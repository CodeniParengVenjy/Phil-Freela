"""PhilFreela AI service.

First time only, from this folder:
    py -3.10 -m venv .venv
    .venv\\Scripts\\python -m pip install -r requirements.txt
    copy .env.example .env      (then fill in the real values)

Run it:
    .venv\\Scripts\\python -m uvicorn main:app --port 8000

It only needs to listen on this computer: the website (and phones on the same
Wi-Fi) reach it through the website's own /ai address, which the Vite dev
server forwards here (see client/vite.config.js).
"""

import io
import logging
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from postgrest.exceptions import APIError
from supabase import ClientOptions, create_client

from face_check import NoFaceError, check_faces, prepare_image
from photo_checks import PhotoProblem, check_face_scan, check_id_back, check_id_front

load_dotenv()

# Errors are written to the terminal running the service, so problems can be
# traced without showing technical details to users.
logger = logging.getLogger("uvicorn.error")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError("Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ai-service/.env (see .env.example).")

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
# (CORS). On the laptop the website goes through its own /ai address, which
# counts as the same site; the live site (phil-freela.pages.dev) calls it
# directly through the ngrok link, so it must be listed in ALLOWED_ORIGINS.
allowed_origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST"],
    # The last one lets the website skip ngrok's warning page (see aiService.js).
    allow_headers=["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
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


def to_clean_jpeg(image):
    """Saves a smaller copy as a fresh JPEG. Nothing hidden (like the GPS
    location phones store in photos) is copied over."""
    stored = image.copy()
    stored.thumbnail((STORED_MAX_SIDE, STORED_MAX_SIDE))
    buffer = io.BytesIO()
    stored.save(buffer, format="JPEG", quality=85)
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
