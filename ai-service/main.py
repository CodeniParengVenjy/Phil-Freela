"""PhilFreela AI service.

Online, it runs on Vercel (free), which finds `app` in this file by itself;
the live website reaches it through its own /ai address (a Cloudflare
function forwards it, see client/functions/ai). See README.md.

To run it on a laptop instead, first time only, from this folder:
    py -3.10 -m venv .venv
    .venv\\Scripts\\python -m pip install -r requirements.txt
    .venv\\Scripts\\python get_models.py
    copy .env.example .env      (then fill in the real values)

Run it:
    .venv\\Scripts\\python -m uvicorn main:app --port 8000
"""

import io
import logging
import os
import tempfile
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

import cv2
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from postgrest.exceptions import APIError
from supabase import ClientOptions, create_client

from face_check import NoFaceError, check_faces, prepare_image
from hidden_watermark import new_code, protect_photo
from photo_checks import PhotoProblem, check_face_scan, check_id_back, check_id_front
from visible_watermark import draw_visible_watermark

load_dotenv()

# Errors are written to the terminal running the service, so problems can be
# traced without showing technical details to users.
logger = logging.getLogger("uvicorn.error")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in ai-service/.env on a laptop, or the host's environment variables).")

# The service role key skips the database rules, which is why only this
# service may hold it. That's what lets it save verifications that users
# themselves can't create or edit.
# Photo uploads get 60 seconds instead of the default 20, so a slow internet
# connection doesn't make a verification fail.
supabase = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    options=ClientOptions(storage_client_timeout=60),
)

BUCKET = "verification-docs"
ID_TYPES = {"philsys", "drivers_license", "passport", "umid", "prc"}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB, same limit as the storage bucket

# Saved photos are shrunk to at most this many pixels. The ID text stays sharp
# enough for an admin to read, and uploads are about half the size of the
# full photos the face check looks at, which matters on slow internet.
STORED_MAX_SIDE = 1280
UPLOAD_TRIES = 3

app = FastAPI(title="PhilFreela AI Service")

# Website addresses allowed to call this service directly from a browser
# (CORS). The website normally goes through its own /ai address instead (the
# dev server on the laptop, a Cloudflare function on the live site), which
# counts as the same site, so this only matters for direct calls.
allowed_origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health")
def health():
    """Quick check that the service is running."""
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_user_id(authorization):
    """Asks Supabase whether the user's login token is real; returns their id."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please log in first.")
    try:
        response = supabase.auth.get_user(authorization.removeprefix("Bearer "))
    except Exception:
        raise HTTPException(401, "Your login has expired. Please log in again.")
    if not response or not response.user:
        raise HTTPException(401, "Your login has expired. Please log in again.")
    return response.user.id


def ensure_can_verify(user_id):
    """Only regular users (with a profile) who aren't already verified or waiting."""
    profile = supabase.table("profiles").select("id").eq("id", user_id).limit(1).execute().data
    if not profile:
        raise HTTPException(403, "Only freelancer and client accounts can verify their identity.")

    active = (
        supabase.table("identity_verifications")
        .select("status")
        .eq("user_id", user_id)
        .in_("status", ["pending", "approved"])
        .limit(1)
        .execute()
        .data
    )
    if active:
        if active[0]["status"] == "approved":
            raise HTTPException(409, "You are already verified.")
        raise HTTPException(409, "Your verification is already waiting for review.")


def read_image(upload, photo_name):
    """Checks an uploaded file is a real JPG/PNG/WEBP under 5 MB and opens it."""
    data = upload.file.read(MAX_FILE_SIZE + 1)
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(400, f"The {photo_name} is too big (max 5 MB).")

    # Opening it with Pillow checks the actual file contents, so a text file
    # renamed to ".jpg" is caught here.
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception:
        raise HTTPException(400, f"The {photo_name} is not a valid image.")
    if image.format not in ALLOWED_FORMATS:
        raise HTTPException(400, f"The {photo_name} must be a JPG, PNG, or WEBP image.")

    return prepare_image(image)


def to_clean_jpeg(image, max_side=STORED_MAX_SIDE, quality=85):
    """Saves a smaller copy as a fresh JPEG. Nothing hidden (like the GPS
    location phones store in photos) is copied over."""
    stored = image.copy()
    stored.thumbnail((max_side, max_side))
    buffer = io.BytesIO()
    stored.save(buffer, format="JPEG", quality=quality)
    return buffer.getvalue()


def run_photo_check(check, *images):
    """Runs one of the photo_checks and turns a problem into a "retake" reply."""
    try:
        check(*images)
    except PhotoProblem as problem:
        raise HTTPException(422, str(problem))


def get_caller_user_id(authorization, token):
    """Whose photos these are: the phone's QR token if one is sent, otherwise
    the logged-in user's token."""
    if token:
        link = find_valid_link(token)
        if not link:
            raise HTTPException(410, "This link has expired or was already used. Make a new QR code on your computer.")
        return link["user_id"]
    return get_user_id(authorization)


def handle_submission(user_id, id_type, id_photo, id_back, selfie, selfie_left, selfie_right):
    """Shared by the computer and phone (QR) uploads. Re-runs every check
    (the website runs them step by step too, but it can't be trusted to),
    compares the faces, saves the photos, and adds a "pending" verification
    for an admin."""
    if id_type not in ID_TYPES:
        raise HTTPException(400, "Please choose a valid ID type.")
    # Both sides of the card are required; passports have no card back.
    if id_type != "passport" and id_back is None:
        raise HTTPException(400, "Please add a photo of the back of your ID.")
    ensure_can_verify(user_id)

    id_image = read_image(id_photo, "photo of the front of your ID")
    id_back_image = read_image(id_back, "photo of the back of your ID") if id_back is not None else None
    selfie_image = read_image(selfie, "face scan")
    left_image = read_image(selfie_left, "face scan")
    right_image = read_image(selfie_right, "face scan")

    run_photo_check(check_id_front, id_image)
    if id_back_image is not None:
        run_photo_check(check_id_back, id_image, id_back_image)
    run_photo_check(check_face_scan, selfie_image, left_image, right_image)

    try:
        result = check_faces(id_image, selfie_image, left_image, right_image)
    except NoFaceError as error:
        # Nothing is saved; the user just retakes the photo.
        raise HTTPException(422, str(error))

    verification_id = str(uuid.uuid4())
    folder = f"{user_id}/{verification_id}"
    id_path = f"{folder}/id.jpg"
    id_back_path = f"{folder}/id_back.jpg" if id_back_image is not None else None
    selfie_path = f"{folder}/selfie.jpg"
    selfie_left_path = f"{folder}/selfie_left.jpg"
    selfie_right_path = f"{folder}/selfie_right.jpg"

    uploads = [(id_path, id_image), (selfie_path, selfie_image), (selfie_left_path, left_image), (selfie_right_path, right_image)]
    if id_back_path:
        uploads.append((id_back_path, id_back_image))
    saved_paths = [path for path, _ in uploads]

    storage = supabase.storage.from_(BUCKET)

    def upload(item):
        path, image = item
        data = to_clean_jpeg(image)
        # On slow internet a connection sometimes drops mid-upload, so each
        # photo gets up to 3 tries. "upsert" lets a retry replace a
        # half-finished upload of the same file.
        for attempt in range(UPLOAD_TRIES):
            try:
                storage.upload(path, data, {"content-type": "image/jpeg", "upsert": "true"})
                return
            except Exception:
                if attempt == UPLOAD_TRIES - 1:
                    raise
                logger.warning("Upload of %s failed, trying again", path)
                time.sleep(attempt + 1)

    try:
        # Up to 3 photos upload at the same time instead of one after another.
        with ThreadPoolExecutor(max_workers=3) as pool:
            list(pool.map(upload, uploads))
    except Exception:
        logger.exception("Uploading verification photos failed")
        # e.g. the internet connection dropped: remove whatever did upload,
        # so no half-finished verification is left behind.
        try:
            storage.remove(saved_paths)
        except Exception:
            pass
        raise HTTPException(503, "Couldn't save your photos because of a connection problem. Please try again.")

    try:
        supabase.table("identity_verifications").insert({
            "id": verification_id,
            "user_id": user_id,
            "id_type": id_type,
            "id_photo_path": id_path,
            "id_back_path": id_back_path,
            "selfie_path": selfie_path,
            "selfie_left_path": selfie_left_path,
            "selfie_right_path": selfie_right_path,
            "face_match": result["match"],
            "face_distance": result["distance"],
            # The head turns were already checked above; this adds that all
            # three scan frames show the same person.
            "liveness_passed": result["same_person"],
        }).execute()
    except APIError as error:
        # Don't leave photos behind for a verification that wasn't saved.
        storage.remove(saved_paths)
        # 23505 = the database's "one pending/approved per user" rule, e.g.
        # the user submitted from the computer and the phone at the same time.
        if error.code == "23505":
            raise HTTPException(409, "Your verification is already waiting for review.")
        raise

    # The AI results stay out of the reply: only admins see them, so nobody
    # can keep retrying photos until they fool the face check.
    return {"id": verification_id, "status": "pending"}


def find_valid_link(token):
    """Returns the QR link if it exists, isn't used, and hasn't expired."""
    try:
        uuid.UUID(token)
    except ValueError:
        return None

    now = datetime.now(timezone.utc).isoformat()
    rows = (
        supabase.table("verification_links")
        .select("token, user_id")
        .eq("token", token)
        .is_("used_at", "null")
        .gt("expires_at", now)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


# ---------------------------------------------------------------------------
# Identity verification endpoints
# ---------------------------------------------------------------------------

@app.post("/checks/id-front")
def check_front(
    photo: UploadFile = File(...),
    token: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
):
    """Instant check of the front of the ID, before the user can go on.
    Nothing is saved. Needs a login or a valid QR token, so strangers can't use it."""
    get_caller_user_id(authorization, token)
    run_photo_check(check_id_front, read_image(photo, "photo of the front of your ID"))
    return {"ok": True}


@app.post("/checks/id-back")
def check_back(
    front: UploadFile = File(...),
    back: UploadFile = File(...),
    token: str | None = Form(default=None),
    authorization: str | None = Header(default=None),
):
    """Instant check of the back of the ID (the front is sent too, to make sure
    it isn't the same photo). Nothing is saved."""
    get_caller_user_id(authorization, token)
    front_image = read_image(front, "photo of the front of your ID")
    run_photo_check(check_id_back, front_image, read_image(back, "photo of the back of your ID"))
    return {"ok": True}


@app.post("/verifications")
def submit_verification(
    id_type: str = Form(...),
    id_photo: UploadFile = File(...),
    selfie: UploadFile = File(...),
    selfie_left: UploadFile = File(...),
    selfie_right: UploadFile = File(...),
    id_back: UploadFile | None = File(default=None),
    authorization: str | None = Header(default=None),
):
    """A logged-in user sends their ID photos and face scan."""
    user_id = get_user_id(authorization)
    return handle_submission(user_id, id_type, id_photo, id_back, selfie, selfie_left, selfie_right)


@app.post("/phone-links")
def create_phone_link(authorization: str | None = Header(default=None)):
    """A logged-in user without a webcam asks for a QR code link."""
    user_id = get_user_id(authorization)
    ensure_can_verify(user_id)

    # Only the newest QR code works: older unused ones are deleted.
    supabase.table("verification_links").delete().eq("user_id", user_id).is_("used_at", "null").execute()
    link = supabase.table("verification_links").insert({"user_id": user_id}).execute().data[0]
    return {"token": link["token"], "expires_at": link["expires_at"]}


@app.get("/phone-links/{token}")
def check_phone_link(token: str):
    """The phone asks if its QR link still works. Only yes/no, no personal info."""
    return {"valid": find_valid_link(token) is not None}


@app.post("/phone-links/{token}/submit")
def submit_from_phone(
    token: str,
    id_type: str = Form(...),
    id_photo: UploadFile = File(...),
    selfie: UploadFile = File(...),
    selfie_left: UploadFile = File(...),
    selfie_right: UploadFile = File(...),
    id_back: UploadFile | None = File(default=None),
):
    """The phone sends the photos. The QR token takes the place of a login."""
    link = find_valid_link(token)
    if not link:
        raise HTTPException(410, "This link has expired or was already used. Make a new QR code on your computer.")

    result = handle_submission(link["user_id"], id_type, id_photo, id_back, selfie, selfie_left, selfie_right)

    # Mark it used only after success, so a rejected photo can be retaken.
    supabase.table("verification_links").update({"used_at": datetime.now(timezone.utc).isoformat()}).eq("token", token).execute()
    return result


# ---------------------------------------------------------------------------
# Slideshows for services and portfolio projects (watermarking system,
# steps 1-2). Each shows up to 10 photos and videos. Every one goes through
# here (browsers can't upload to the "slide-media" bucket themselves), so each
# is checked, and from step 3 on it also gets watermarked here.
# ---------------------------------------------------------------------------

SLIDE_BUCKET = "slide-media"
SLIDE_UPLOADS_BUCKET = "slide-uploads"
# What a slide can belong to: its table, the media_slides column pointing at
# it, and what to call it in messages.
SLIDE_OWNERS = {
    "service": ("services", "service_id", "service"),
    "portfolio": ("portfolio_items", "portfolio_item_id", "project"),
}
MAX_SLIDES_PER_ITEM = 10
MAX_SLIDES_PER_FREELANCER = 50
MAX_VIDEOS_PER_FREELANCER = 5
MAX_VIDEO_SIZE = 50 * 1024 * 1024  # same limit as the storage buckets
MAX_VIDEO_SECONDS = 30
# Saved photos are at most this many pixels wide or tall: sharp in the
# slideshow, but never the freelancer's full-quality original.
SLIDE_MAX_SIDE = 1200


def remove_quietly(bucket, path):
    """Deletes a file. If that fails it only leaves an unused file behind."""
    try:
        supabase.storage.from_(bucket).remove([path])
    except Exception:
        logger.warning("Couldn't delete %s from %s", path, bucket)


def ensure_own_item(user_id, owner, item_id):
    """Slides can only be added by the service's or project's owner, and not
    while suspended or banned."""
    table, _, name = SLIDE_OWNERS[owner]
    try:
        uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(404, f"That {name} no longer exists.")

    rows = supabase.table(table).select("freelancer_id").eq("id", item_id).limit(1).execute().data
    if not rows:
        raise HTTPException(404, f"That {name} no longer exists.")
    if rows[0]["freelancer_id"] != user_id:
        raise HTTPException(403, f"You can only add photos and videos to your own {name}s.")

    # Same check the posting rules use: a ban, or a suspension that blocks
    # posting (e.g. for spam) and hasn't ended.
    if supabase.rpc("is_posting_blocked", {"target": user_id}).execute().data:
        raise HTTPException(403, "Your account is suspended from posting, so you can't upload right now.")


def next_slide_position(user_id, owner, item_id, media_type):
    """Checks the upload limits and returns the first free spot (1-10) in the
    service's or project's slideshow."""
    _, column, name = SLIDE_OWNERS[owner]
    used = {row["position"] for row in supabase.table("media_slides").select("position").eq(column, item_id).execute().data}
    if len(used) >= MAX_SLIDES_PER_ITEM:
        raise HTTPException(409, f"A {name} can have at most {MAX_SLIDES_PER_ITEM} photos and videos.")

    # Limits across all of the freelancer's services and projects together,
    # to save storage space.
    mine = supabase.table("media_slides").select("media_type").eq("freelancer_id", user_id).execute().data
    if len(mine) >= MAX_SLIDES_PER_FREELANCER:
        raise HTTPException(409, f"You've reached the limit of {MAX_SLIDES_PER_FREELANCER} photos and videos. Delete a service or project to add more.")
    if media_type == "video" and sum(row["media_type"] == "video" for row in mine) >= MAX_VIDEOS_PER_FREELANCER:
        raise HTTPException(409, f"You can have at most {MAX_VIDEOS_PER_FREELANCER} videos. Delete a service or project with a video to add another.")

    return next(spot for spot in range(1, MAX_SLIDES_PER_ITEM + 1) if spot not in used)


def video_seconds(data, extension):
    """How long the video is, in seconds (None if it can't be played).
    OpenCV reads videos from a file, so it's written to a temporary one first."""
    handle, path = tempfile.mkstemp(suffix=f".{extension}")
    try:
        with os.fdopen(handle, "wb") as file:
            file.write(data)
        video = cv2.VideoCapture(path)
        try:
            if not video.isOpened() or not video.grab():
                return None
            # Step through the frames to the end: the last frame's time is the
            # length. Stops early once it's clearly too long.
            while True:
                seconds = video.get(cv2.CAP_PROP_POS_MSEC) / 1000
                if seconds > MAX_VIDEO_SECONDS + 1 or not video.grab():
                    return seconds
        finally:
            video.release()
    finally:
        os.remove(path)


def read_slide_video(user_id, video_path):
    """Takes the video the browser put in slide-uploads and checks it's a real
    MP4 or WEBM of at most 50 MB and 30 seconds. Returns (data, extension)."""
    # Only from the caller's own folder, so nobody can take someone else's upload.
    if not video_path.startswith(f"{user_id}/") or ".." in video_path:
        raise HTTPException(403, "That video upload isn't yours.")

    try:
        data = supabase.storage.from_(SLIDE_UPLOADS_BUCKET).download(video_path)
    except Exception:
        raise HTTPException(404, "The video upload wasn't found. Please try again.")
    finally:
        # The temporary copy is never needed again, whatever happens next.
        remove_quietly(SLIDE_UPLOADS_BUCKET, video_path)

    if len(data) > MAX_VIDEO_SIZE:
        raise HTTPException(400, "That video is too big (max 50 MB).")

    # The first bytes show the real file type, whatever the file is called.
    if data[4:8] == b"ftyp":
        extension = "mp4"
    elif data[:4] == b"\x1a\x45\xdf\xa3":
        extension = "webm"
    else:
        raise HTTPException(400, "Videos must be MP4 or WEBM.")

    seconds = video_seconds(data, extension)
    if seconds is None:
        raise HTTPException(400, "That video couldn't be opened. Please try another one.")
    if seconds > MAX_VIDEO_SECONDS + 0.5:
        raise HTTPException(400, f"Videos can be at most {MAX_VIDEO_SECONDS} seconds long.")
    return data, extension


def upload_slide_file(path, data, content_type):
    """Saves a slide to slide-media, with up to 3 tries on a bad connection."""
    storage = supabase.storage.from_(SLIDE_BUCKET)
    for attempt in range(UPLOAD_TRIES):
        try:
            storage.upload(path, data, {"content-type": content_type, "upsert": "true"})
            return
        except Exception:
            if attempt == UPLOAD_TRIES - 1:
                logger.exception("Uploading slide %s failed", path)
                raise HTTPException(503, "Couldn't save that file because of a connection problem. Please try again.")
            logger.warning("Upload of %s failed, trying again", path)
            time.sleep(attempt + 1)


def watermark_photo(user_id, image, promo):
    """Step 3: draws the freelancer's visible watermark (in their style from
    Settings > Watermark Settings, and not on promos), then hides a new
    invisible code in the photo (HiDDeN, see hidden_watermark.py).
    Returns (jpeg_bytes, code), where code is None for a picture too plain to
    hold one."""
    image = image.copy()
    image.thumbnail((SLIDE_MAX_SIDE, SLIDE_MAX_SIDE))

    if not promo:
        settings = (
            supabase.table("watermark_settings")
            .select("visible_enabled, text_mode, custom_text, position, opacity, size, color, show_badge")
            .eq("freelancer_id", user_id).limit(1).execute().data
        )
        profile = supabase.table("profiles").select("username, full_name").eq("id", user_id).limit(1).execute().data
        profile = profile[0] if profile else {}
        image = draw_visible_watermark(image, settings[0] if settings else None, profile.get("username", ""), profile.get("full_name", ""))

    code = new_code()
    data, has_code = protect_photo(image, code)
    return data, (code if has_code else None)


@app.post("/slides")
def add_slide(
    service_id: str | None = Form(default=None),
    portfolio_item_id: str | None = Form(default=None),
    image: UploadFile | None = File(default=None),
    video_path: str | None = Form(default=None),
    promo: bool = Form(default=False),
    authorization: str | None = Header(default=None),
):
    """Adds one photo or video to the end of the caller's own service or
    portfolio project (send service_id or portfolio_item_id). promo: the
    freelancer marked it as an ad, so it gets no visible watermark.
    Photos come with the request. Videos are too big for that (Vercel allows
    4.5 MB per request), so the browser uploads them to slide-uploads first
    and sends where it put them."""
    user_id = get_user_id(authorization)
    if (service_id is None) == (portfolio_item_id is None):
        raise HTTPException(400, "Send one service or one project.")
    if (image is None) == (video_path is None):
        raise HTTPException(400, "Send one photo or one video.")

    owner, item_id = ("service", service_id) if service_id is not None else ("portfolio", portfolio_item_id)
    _, column, name = SLIDE_OWNERS[owner]
    ensure_own_item(user_id, owner, item_id)
    media_type = "image" if image is not None else "video"
    position = next_slide_position(user_id, owner, item_id, media_type)

    code = None
    if image is not None:
        # Same checks as ID photos (a real JPG/PNG/WEBP under 5 MB), then the
        # watermarks, saved as a fresh JPEG (nothing hidden, like the GPS
        # location phones store in photos, is copied over).
        data, code = watermark_photo(user_id, read_image(image, "photo"), promo)
        extension, content_type = "jpg", "image/jpeg"
    else:
        # Videos get their watermarks in step 7.
        data, extension = read_slide_video(user_id, video_path)
        content_type = f"video/{extension}"

    slide_id = str(uuid.uuid4())
    file_path = f"{user_id}/{slide_id}.{extension}"
    upload_slide_file(file_path, data, content_type)

    try:
        supabase.table("media_slides").insert({
            "id": slide_id,
            "freelancer_id": user_id,
            column: item_id,
            "position": position,
            "media_type": media_type,
            "file_path": file_path,
            "watermarked": code is not None,
            "promo": promo,
        }).execute()
    except APIError as error:
        # Don't leave a file behind for a slide that wasn't saved.
        remove_quietly(SLIDE_BUCKET, file_path)
        if error.code == "23505":  # another upload took the same spot at the same moment
            raise HTTPException(409, "Another upload was saving at the same time. Please try again.")
        if error.code == "23503":  # the service or project was deleted meanwhile
            raise HTTPException(404, f"That {name} no longer exists.")
        raise

    # The invisible code goes in its own private table (only this service can read it).
    if code is not None:
        try:
            supabase.table("watermark_codes").insert({"code": code, "slide_id": slide_id}).execute()
        except APIError:
            # Practically impossible (the same random code twice), but then undo the slide.
            logger.exception("Saving the watermark code for slide %s failed", slide_id)
            supabase.table("media_slides").delete().eq("id", slide_id).execute()
            remove_quietly(SLIDE_BUCKET, file_path)
            raise HTTPException(409, "Something went wrong while saving that photo. Please try again.")

    return {
        "id": slide_id, "position": position, "media_type": media_type, "file_path": file_path,
        "watermarked": code is not None, "promo": promo,
    }
