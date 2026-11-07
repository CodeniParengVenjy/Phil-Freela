"""Pay to unlock (PLAN-transaction-tracking.md, Step F): the watermarked preview
of the work a freelancer sent on a project.

Until the client has paid (the freelancer confirmed a payment on the project),
the client may only see a PREVIEW, never the original file: the database's
storage rule refuses them the original (database/supabase_deliverable_lock_schema.sql).
This file makes that preview from the real file, so a freelancer can't show one
thing and deliver another:

- a video: at most 720p and its first 3 minutes, with its sound;
- a picture: at most 1200 pixels on its longer side;
- a PDF: its first 3 pages, one under the other, as one picture;

each with "PREVIEW · @username" repeated across the whole picture (the tiled
pattern from visible_watermark.py, used read-only, so it can't be cropped off).
ZIP and Blender files can't be shown in a browser, so they get no preview; the
client sees only the file name until they pay.

Only this service writes into the "deliverable-previews" bucket (it holds the
service key), and only it fills in projects.preview_path.
"""

import io
import logging
import os
import subprocess
import tempfile
import uuid

import imageio_ffmpeg
from fastapi import APIRouter, Header, HTTPException
from PIL import Image, ImageOps, ImageStat
from pydantic import BaseModel

from document_pages import render_pages
from visible_watermark import watermark_layer
from watermark_video import output_size, video_info

logger = logging.getLogger("uvicorn.error")

ORIGINALS_BUCKET = "deliverables"
PREVIEWS_BUCKET = "deliverable-previews"

VIDEO_TYPES = {"mp4", "webm", "mov"}
PICTURE_TYPES = {"jpg", "jpeg", "png", "webp"}

# A video preview: the first 3 minutes are enough to judge the work. Timed on
# a laptop forced to one thread (about one Vercel CPU), a hard 1080p video
# took 20 seconds per minute, so 3 minutes stay near a minute of work.
MAX_PREVIEW_SECONDS = 180
FFMPEG_SECONDS = 240  # give up before Vercel stops the whole request (300 s)
# H.264 quality (28 = smaller than the marketplace videos' 23: it's a preview)
# and at most 1 Mbit/s, so a preview stays far below the bucket's 50 MB. The
# "ultrafast" setting makes it about twice as fast as "veryfast", for a bigger
# file of the same quality.
CRF = 28
MAX_BITRATE = "1M"

PICTURE_MAX_SIDE = 1200
PDF_PAGES = 3
PAGE_GAP = 24  # pixels between the pages of a PDF preview
JPEG_QUALITY = 80
# How strong the repeated "PREVIEW" text is, in percent: clearly there, while
# the work under it can still be judged.
MARK_OPACITY = 40


class PreviewProblem(Exception):
    """A file that can't be turned into a preview; the message is for people."""


def preview_kind(path):
    """'video', 'picture', 'pdf', or None for a file with no preview (ZIP, Blender)."""
    extension = (path or "").rsplit(".", 1)[-1].lower()
    if extension in VIDEO_TYPES:
        return "video"
    if extension in PICTURE_TYPES:
        return "picture"
    if extension == "pdf":
        return "pdf"
    return None


def preview_text(username):
    return f"PREVIEW · @{username}" if username else "PREVIEW · PhilFreela"


def mark_style(text, color, size):
    """The repeated text, in the shape visible_watermark.py reads (the same keys
    as a freelancer's Watermark Settings, but always tiled across everything)."""
    return {
        "visible_enabled": True,
        "text_mode": "custom",
        "custom_text": text,
        "position": "tiled",
        "opacity": MARK_OPACITY,
        "size": size,
        "color": color,
        "font": "jakarta",
        "show_badge": True,
    }


def marked(picture, text, size="medium"):
    """A copy of the picture with the text across it: dark on a light picture
    (white paper), white on a dark one, like the PDF pages of the marketplace."""
    light = ImageStat.Stat(picture.convert("L")).mean[0] >= 128
    layer = watermark_layer(picture.size, mark_style(text, "black" if light else "white", size), "", "")
    return Image.alpha_composite(picture.convert("RGBA"), layer).convert("RGB")


def to_jpeg(picture):
    out = io.BytesIO()
    picture.save(out, format="JPEG", quality=JPEG_QUALITY)
    return out.getvalue()


def picture_preview(data, text):
    """JPEG bytes: the picture, smaller, with the text across it."""
    try:
        picture = ImageOps.exif_transpose(Image.open(io.BytesIO(data))).convert("RGB")
    except Exception:
        raise PreviewProblem("That picture couldn't be opened.")
    picture.thumbnail((PICTURE_MAX_SIDE, PICTURE_MAX_SIDE))
    return to_jpeg(marked(picture, text))


def pdf_preview(data, text):
    """JPEG bytes: the first pages of the PDF, one under the other, each with
    the text across it."""
    try:
        pages = render_pages(data, max_pages=PDF_PAGES, max_side=PICTURE_MAX_SIDE)
    except Exception:
        raise PreviewProblem("That PDF couldn't be opened.")
    if not pages:
        raise PreviewProblem("That PDF has no pages to show.")
    pages = [marked(page, text, "small") for page in pages]
    width = max(page.width for page in pages)
    sheet = Image.new("RGB", (width, sum(page.height for page in pages) + PAGE_GAP * (len(pages) - 1)), (33, 37, 41))
    top = 0
    for page in pages:
        sheet.paste(page, ((width - page.width) // 2, top))
        top += page.height + PAGE_GAP
    return to_jpeg(sheet)


def video_preview(source, target, text):
    """Writes the preview MP4 of the video at source to target, with FFmpeg in
    one go: smaller (at most 720p and 30 frames a second), the first 3 minutes,
    the text laid over every frame (one picture drawn once), and the sound."""
    width, height, fps, _, _ = video_info(source)  # also gets FFmpeg ready on Vercel
    out_w, out_h = output_size(width, height)
    out_fps = min(fps or 30, 30)
    mark = os.path.join(os.path.dirname(target), "mark.png")
    watermark_layer((out_w, out_h), mark_style(text, "white", "medium"), "", "").save(mark)
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-loglevel", "error",
        "-i", source, "-i", mark,
        "-filter_complex", f"[0:v]fps={out_fps},scale={out_w}:{out_h},setsar=1[v];[v][1:v]overlay=0:0,format=yuv420p[out]",
        "-map", "[out]", "-map", "0:a?",
        "-t", str(MAX_PREVIEW_SECONDS),
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", str(CRF), "-maxrate", MAX_BITRATE, "-bufsize", "2M",
        "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart",
        target,
    ]
    subprocess.run(command, check=True, capture_output=True, timeout=FFMPEG_SECONDS)


def video_bytes(data, extension, text):
    """MP4 bytes of the video preview (FFmpeg works on files, so the video is
    written to a temporary folder first)."""
    with tempfile.TemporaryDirectory() as folder:
        source, target = os.path.join(folder, f"original.{extension}"), os.path.join(folder, "preview.mp4")
        with open(source, "wb") as file:
            file.write(data)
        try:
            video_preview(source, target, text)
        except subprocess.TimeoutExpired:
            raise PreviewProblem("That video takes too long to turn into a preview. Please send a shorter or smaller video.")
        except Exception:
            logger.exception("Making a video preview failed")
            raise PreviewProblem("That video couldn't be turned into a preview. Please try an MP4 video.")
        with open(target, "rb") as file:
            return file.read()


def make_preview(kind, data, extension, text):
    """(bytes, content type, extension) of the preview."""
    if kind == "video":
        return video_bytes(data, extension, text), "video/mp4", "mp4"
    if kind == "picture":
        return picture_preview(data, text), "image/jpeg", "jpg"
    return pdf_preview(data, text), "image/jpeg", "jpg"


def make_and_save(supabase, project):
    """Makes the preview of the project's sent file, saves it in the preview
    bucket and fills in projects.preview_path. project: a row with id,
    freelancer_id and submission_path. Returns {"preview_path": ...}. Also used
    once by hand for the files sent before this existed."""
    original = project.get("submission_path")
    kind = preview_kind(original)
    if not original or not kind:
        raise HTTPException(400, "This work has no file that can be previewed. ZIP and Blender files can't be.")

    try:
        data = supabase.storage.from_(ORIGINALS_BUCKET).download(original)
    except Exception:
        raise HTTPException(404, "The file that was sent wasn't found.")

    profile = supabase.table("profiles").select("username").eq("id", project["freelancer_id"]).limit(1).execute().data
    text = preview_text(profile[0].get("username") if profile else None)
    try:
        content, content_type, extension = make_preview(kind, data, original.rsplit(".", 1)[-1].lower(), text)
    except PreviewProblem as problem:
        raise HTTPException(400, str(problem))

    # Saved next to the original's name: "<user id>/<project>-<time>-preview.mp4".
    preview = f"{original.rsplit('.', 1)[0]}-preview.{extension}"
    previews = supabase.storage.from_(PREVIEWS_BUCKET)
    try:
        previews.upload(preview, content, {"content-type": content_type, "upsert": "true"})
    except Exception:
        logger.exception("Saving the preview %s failed", preview)
        raise HTTPException(503, "Couldn't save the preview because of a connection problem. Please try again.")

    # Only if the same file is still the sent work (new work may have been sent
    # meanwhile, and that one gets its own preview).
    saved = (
        supabase.table("projects").update({"preview_path": preview})
        .eq("id", project["id"]).eq("submission_path", original).execute().data
    )
    if not saved:
        remove_quietly(previews, [preview])
        raise HTTPException(409, "New work was sent meanwhile. Please try again.")

    # Previews of earlier work on the same project are never shown again.
    try:
        folder = preview.split("/", 1)[0]
        older = [
            f"{folder}/{item['name']}"
            for item in previews.list(folder, {"search": project["id"]})
            if item.get("name", "").startswith(project["id"]) and f"{folder}/{item['name']}" != preview
        ]
        if older:
            remove_quietly(previews, older)
    except Exception:
        logger.warning("Couldn't look for older previews of project %s", project["id"])
    return {"preview_path": preview}


def remove_quietly(storage, paths):
    """Removes files; if that fails it only leaves unused files behind."""
    try:
        storage.remove(paths)
    except Exception:
        logger.warning("Couldn't remove %s", paths)


class PreviewRequest(BaseModel):
    project_id: str


def preview_router(supabase, get_user_id):
    """The /deliverables/preview route, given main.py's database client and its
    login check (added to the app with one line in main.py)."""
    router = APIRouter()

    @router.post("/deliverables/preview")
    def make_deliverable_preview(body: PreviewRequest, authorization: str | None = Header(default=None)):
        """Pay to unlock: makes the watermarked preview the client sees until a
        payment on the project is confirmed. Called by the project's freelancer
        right after sending the work (or again with "Make the preview"). Returns
        {"preview_path": ...}; asking again once it exists returns the same one
        without making it again."""
        user_id = get_user_id(authorization)
        try:
            uuid.UUID(body.project_id)
        except ValueError:
            raise HTTPException(404, "That project wasn't found.")
        rows = (
            supabase.table("projects").select("id, freelancer_id, submission_path, preview_path")
            .eq("id", body.project_id).limit(1).execute().data
        )
        if not rows or rows[0]["freelancer_id"] != user_id:
            raise HTTPException(403, "Only the freelancer on this project can make its preview.")
        if rows[0]["preview_path"]:
            return {"preview_path": rows[0]["preview_path"]}
        return make_and_save(supabase, rows[0])

    return router
