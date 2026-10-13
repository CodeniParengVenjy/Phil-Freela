"""One-time script: gives the documents saved BEFORE document previews the same
treatment as new ones (PLAN-document-previews.md, step B4).

Before previews, a document's public file in the slide-media bucket held ALL of
its text, so anyone with the file's link could read the part the website now
blurs. For every document slide this makes sure that:
  1. the whole text is saved in slide_texts (private: only its writer and the
     admins can read it). It is saved and read back BEFORE anything else changes,
     so nothing can be lost;
  2. media_slides.hidden_chars says how much the preview leaves out;
  3. the public file holds only the preview.

It is a TRIAL by default: it lists what it would do and changes nothing. From
the ai-service folder (the service's own virtual environment is fine):

    python split_old_documents.py            (the trial)
    python split_old_documents.py --apply    (does it)

It is safe to run again: a slide that is already done needs no steps.
It reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from ai-service/.env, like
the service does.
"""

import os
import sys

from dotenv import load_dotenv
from supabase import ClientOptions, create_client

from document_preview import make_preview

BUCKET = "slide-media"


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


def main():
    apply = "--apply" in sys.argv
    load_dotenv()
    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ai-service/.env first.")
    client = create_client(url, key, options=ClientOptions(storage_client_timeout=60))
    lines = split_documents(client, apply)
    print("\n".join(lines) if lines else "There are no document slides.")
    print("\nDone." if apply else "\nThat was a trial: nothing was changed. Run it again with --apply to do it.")


if __name__ == "__main__":
    main()
