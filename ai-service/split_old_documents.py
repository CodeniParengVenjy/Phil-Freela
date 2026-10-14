"""One-time script: gives the documents saved BEFORE document previews the same
treatment as new ones (PLAN-document-previews.md, steps B4 and B5).

Before previews, a document's public file in the slide-media bucket held ALL of
its text, so anyone with the file's link could read the part the website now
blurs. For every document slide this makes sure that:
  1. the whole text is saved in slide_texts (private: only its writer and the
     admins can read it). It is saved and read back BEFORE anything else changes,
     so nothing can be lost;
  2. media_slides.hidden_chars says how much the preview leaves out;
  3. the public file holds only the preview.
And for a PDF's page pictures (step B5), which were public and whole:
  4. the whole pages are copied to the private slide-private bucket (and read
     back, so nothing can be lost);
  5. the public pages are blurred below the top of the document (page_blur.py),
     the same as for new uploads.

It is a TRIAL by default: it lists what it would do and changes nothing. From
the ai-service folder (the service's own virtual environment is fine):

    python split_old_documents.py            (the trial)
    python split_old_documents.py --apply    (does it)

It is safe to run again: a slide that is already done needs no steps.
It reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from ai-service/.env, like
the service does.
"""

import io
import os
import sys

from dotenv import load_dotenv
from PIL import Image
from supabase import ClientOptions, create_client

from document_preview import make_preview
from page_blur import blur_pages

BUCKET = "slide-media"
PRIVATE_BUCKET = "slide-private"


def split_documents(client, apply):
    """Goes through every document slide. Returns one line per slide saying
    what was (apply) or would be (trial) done."""
    storage = client.storage.from_(BUCKET)
    slides = client.table("media_slides").select("id, file_path, hidden_chars").eq("media_type", "document").execute().data
    report = []
    for slide in slides:
        name = slide["file_path"]
        try:
            public = storage.download(name).decode("utf-8")
        except Exception as error:
            report.append(f"{name}: SKIPPED, its file can't be read ({error})")
            continue

        # The whole text: the private copy if there already is one, else the
        # public file (which, before previews, was the whole text).
        saved = client.table("slide_texts").select("body").eq("slide_id", slide["id"]).limit(1).execute().data
        whole = saved[0]["body"] if saved else public
        shown, hidden = make_preview(whole)

        steps = []
        if not saved:
            steps.append(f"save the whole text ({len(whole)} characters) in slide_texts")
        if slide["hidden_chars"] != hidden:
            steps.append(f"set hidden_chars to {hidden}")
        if public != shown:
            steps.append(f"replace the public file ({len(public)} characters) with the preview ({len(shown)} characters)")
        if not steps:
            report.append(f"{name}: already done")
            continue
        report.append(f"{name}: " + ("; ".join(steps) if apply else "WOULD " + "; ".join(steps)))
        if not apply:
            continue

        # 1. The whole text first, and read it back, before the public file is touched.
        if not saved:
            client.table("slide_texts").insert({"slide_id": slide["id"], "body": whole}).execute()
            back = client.table("slide_texts").select("body").eq("slide_id", slide["id"]).limit(1).execute().data
            if not back or back[0]["body"] != whole:
                raise RuntimeError(f"{name}: the whole text could not be read back from slide_texts, so the public file was NOT changed")
        # 2. How much the preview leaves out.
        if slide["hidden_chars"] != hidden:
            client.table("media_slides").update({"hidden_chars": hidden}).eq("id", slide["id"]).execute()
        # 3. Only now the public file becomes the preview.
        if public != shown:
            storage.upload(name, shown.encode("utf-8"), {"content-type": "text/plain", "upsert": "true"})
    return report


def page_name(file_path, number):
    """The name of a PDF's page picture (the same as page_path in main.py)."""
    return f"{file_path.rsplit('.', 1)[0]}-p{number}.jpg"


def try_download(storage, name):
    """The file's bytes, or None when the bucket doesn't have it."""
    try:
        return storage.download(name)
    except Exception:
        return None


def code_reads(jpeg, wanted):
    """How many of the 48 bits of the hidden code are wrong when it is read
    from this picture (48 if it can't be read at all)."""
    from hidden_watermark import read_code  # loads the models, so only when asked

    read = read_code(Image.open(io.BytesIO(jpeg)).convert("RGB"))
    return 48 if read is None else bin(read ^ wanted).count("1")


def blur_pdf_pages(client, apply, check_code=True):
    """Step B5 for the PDFs saved before pages were blurred: keeps the whole
    pages in the private bucket, and blurs the public ones. Returns one line
    per PDF."""
    public, private = client.storage.from_(BUCKET), client.storage.from_(PRIVATE_BUCKET)
    slides = client.table("media_slides").select("id, file_path, page_count").eq("media_type", "document").execute().data
    report = []
    for slide in slides:
        count = slide["page_count"] or 0
        if count == 0:
            continue
        names = [page_name(slide["file_path"], n) for n in range(1, count + 1)]
        label = f"{slide['file_path']} ({count} pages)"
        # For each page: the whole picture (the private copy if there is one,
        # else the public file, which used to be whole), the public file as it is
        # now, and whether the private copy exists.
        pages = []
        for name in names:
            now = try_download(public, name)
            kept = try_download(private, name)
            if now is None:
                break
            pages.append((name, kept if kept is not None else now, now, kept is not None))
        if len(pages) < len(names):
            report.append(f"{label}: SKIPPED, a page can't be read")
            continue
        # Done when every page has its private copy and the public one is no
        # longer the same picture (it is blurred).
        if all(has_copy and now != whole for _, whole, now, has_copy in pages):
            report.append(f"{label}: pages already done")
            continue

        blurred = []
        for picture in blur_pages([Image.open(io.BytesIO(whole)).convert("RGB") for _, whole, _, _ in pages]):
            out = io.BytesIO()
            picture.save(out, format="JPEG", quality=92)
            blurred.append(out.getvalue())

        notes = ""
        if check_code:
            codes = client.table("watermark_codes").select("code").eq("slide_id", slide["id"]).limit(1).execute().data
            if codes:
                notes = f"; the hidden code reads from the blurred page 1 with {code_reads(blurred[0], codes[0]['code'])} wrong bits of 48 (6 or fewer is a match)"
        steps = f"copy the {count} whole pages to {PRIVATE_BUCKET} (if they aren't there yet), then blur the public ones{notes}"
        report.append(f"{label}: {steps if apply else 'WOULD ' + steps}")
        if not apply:
            continue

        # 4. The whole pages first, read back, before the public ones change.
        for name, whole, _, has_copy in pages:
            if has_copy:
                continue
            private.upload(name, whole, {"content-type": "image/jpeg", "upsert": "true"})
            if try_download(private, name) != whole:
                raise RuntimeError(f"{label}: a whole page could not be read back from {PRIVATE_BUCKET}, so the public pages were NOT changed")
        # 5. Only now the public pages become the blurred ones.
        for (name, _, _, _), data in zip(pages, blurred):
            public.upload(name, data, {"content-type": "image/jpeg", "upsert": "true"})
    return report


def main():
    apply = "--apply" in sys.argv
    load_dotenv()
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ai-service/.env first.")
    client = create_client(url, key, options=ClientOptions(storage_client_timeout=60))
    lines = split_documents(client, apply) + blur_pdf_pages(client, apply)
    print("\n".join(lines) if lines else "There are no document slides.")
    print("\nDone." if apply else "\nThat was a trial: nothing was changed. Run it again with --apply to do it.")


if __name__ == "__main__":
    main()
