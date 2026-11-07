"""Checks deliverable_preview.py (pay to unlock, PLAN-transaction-tracking.md
Step F): the watermarked previews of a video, a picture and a PDF, the route's
rules, and saving through a small pretend database (no real database, no
network). From the ai-service folder, run:

    .venv\\Scripts\\python test_deliverable_preview.py

Every check prints PASS or FAIL, and the script exits with 1 if any check failed.
"""

import io
import os
import subprocess
import sys
import tempfile
from types import SimpleNamespace

import imageio_ffmpeg
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from PIL import Image, ImageChops, ImageDraw, ImageStat

import deliverable_preview as dp
from watermark_video import video_info

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok or not detail else f"  -> {detail}"))


def raises(problem_type, action):
    """The exception action() raised, or None."""
    try:
        action()
    except problem_type as problem:
        return problem
    return None


# ---------------------------------------------------------------------------
# Which files get a preview
# ---------------------------------------------------------------------------

check("mp4, webm and MOV videos get a video preview",
      [dp.preview_kind(p) for p in ("a/b-1.mp4", "a/b-1.webm", "a/b-1.MOV")] == ["video"] * 3)
check("jpg, jpeg, png and webp get a picture preview",
      [dp.preview_kind(p) for p in ("a.jpg", "a.jpeg", "a.png", "a.webp")] == ["picture"] * 4)
check("a PDF gets a page preview", dp.preview_kind("a/b-1.pdf") == "pdf")
check("ZIP, Blender and no file get none", [dp.preview_kind(p) for p in ("a.zip", "a.blend", None, "")] == [None] * 4)
check("the text names the freelancer", dp.preview_text("mrwhat") == "PREVIEW · @mrwhat")

# ---------------------------------------------------------------------------
# A picture
# ---------------------------------------------------------------------------

photo = Image.new("RGB", (3000, 2000), (90, 140, 200))
ImageDraw.Draw(photo).rectangle((600, 400, 2400, 1600), fill=(240, 200, 60))
buffer = io.BytesIO()
photo.save(buffer, format="PNG")
preview = Image.open(io.BytesIO(dp.picture_preview(buffer.getvalue(), dp.preview_text("mrwhat"))))
check("picture: saved as a JPEG", preview.format == "JPEG")
check("picture: at most 1200 pixels on its longer side, same shape", preview.size == (1200, 800), str(preview.size))
plain = photo.resize((1200, 800))
difference = ImageStat.Stat(ImageChops.difference(preview.convert("RGB"), plain).convert("L")).mean[0]
check("picture: the text is drawn across it", difference > 3, f"mean difference {difference:.2f}")
check("picture: something that isn't a picture is refused in plain words",
      "couldn't be opened" in str(raises(dp.PreviewProblem, lambda: dp.picture_preview(b"not a picture", "x")) or ""))

# ---------------------------------------------------------------------------
# A PDF: only the first 3 of its 5 pages, one under the other
# ---------------------------------------------------------------------------

pages = []
for number in range(5):
    page = Image.new("RGB", (850, 1100), "white")
    ImageDraw.Draw(page).text((100, 100), f"Page {number + 1}", fill="black")
    pages.append(page)
buffer = io.BytesIO()
pages[0].save(buffer, format="PDF", save_all=True, append_images=pages[1:])
sheet = Image.open(io.BytesIO(dp.pdf_preview(buffer.getvalue(), dp.preview_text("mrwhat"))))
page_height = 1200  # render_pages draws the longer side at 1200 pixels
check("PDF: saved as one JPEG", sheet.format == "JPEG")
check("PDF: only the first 3 pages, with a gap between them",
      abs(sheet.height - (3 * page_height + 2 * dp.PAGE_GAP)) <= 3, f"height {sheet.height}")
blank_corner = sheet.convert("L").crop((sheet.width // 2, 400, sheet.width - 50, 1100))
check("PDF: dark text across the white paper", blank_corner.getextrema()[0] < 200, str(blank_corner.getextrema()))
check("PDF: a broken PDF is refused in plain words",
      "couldn't be opened" in str(raises(dp.PreviewProblem, lambda: dp.pdf_preview(b"%PDF-1.4 broken", "x")) or ""))

# ---------------------------------------------------------------------------
# A video: smaller, cut to the limit, with its sound
# ---------------------------------------------------------------------------

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def make_video(path, size, seconds):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error",
                    "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30",
                    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
                    "-t", str(seconds), "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-shortest", path], check=True)


with tempfile.TemporaryDirectory() as folder:
    wide, tall = os.path.join(folder, "wide.mp4"), os.path.join(folder, "tall.mp4")
    make_video(wide, "1920x1080", 4)
    make_video(tall, "1080x1920", 2)
    limit = dp.MAX_PREVIEW_SECONDS
    dp.MAX_PREVIEW_SECONDS = 2  # stands in for the 3 minutes, to keep the test quick
    try:
        with open(wide, "rb") as file:
            wide_preview = dp.video_bytes(file.read(), "mp4", dp.preview_text("mrwhat"))
        with open(tall, "rb") as file:
            tall_preview = dp.video_bytes(file.read(), "mp4", dp.preview_text("mrwhat"))
    finally:
        dp.MAX_PREVIEW_SECONDS = limit
    for name, data in (("wide", wide_preview), ("tall", tall_preview)):
        with open(os.path.join(folder, f"{name}-preview.mp4"), "wb") as file:
            file.write(data)
    width, height, fps, seconds, sound = video_info(os.path.join(folder, "wide-preview.mp4"))
    check("video: a 1080p video becomes 720p", (width, height) == (1280, 720), f"{width}x{height}")
    check("video: cut to the preview limit", abs(seconds - 2) < 0.3, f"{seconds} s")
    check("video: keeps its sound", sound)
    width, height, *_ = video_info(os.path.join(folder, "tall-preview.mp4"))
    check("video: a tall phone video stays tall (720x1280)", (width, height) == (720, 1280), f"{width}x{height}")
    check("video: something that isn't a video is refused in plain words",
          "couldn't be turned into a preview" in str(raises(dp.PreviewProblem, lambda: dp.video_bytes(b"\x00" * 5000, "mp4", "x")) or ""))

# ---------------------------------------------------------------------------
# Saving, and the route, with a small pretend database
# ---------------------------------------------------------------------------


class FakeQuery:
    def __init__(self, rows):
        self.rows, self.filters, self.values = rows, [], None

    def select(self, _columns):
        return self

    def update(self, values):
        self.values = values
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def limit(self, _count):
        return self

    def execute(self):
        found = [row for row in self.rows if all(row.get(key) == value for key, value in self.filters)]
        if self.values is not None:
            for row in found:
                row.update(self.values)
        return SimpleNamespace(data=[dict(row) for row in found])


class FakeBucket:
    def __init__(self, files):
        self.files = files

    def download(self, path):
        if path not in self.files:
            raise Exception("Object not found")
        return self.files[path]

    def upload(self, path, data, _options):
        self.files[path] = data

    def remove(self, paths):
        for path in paths:
            self.files.pop(path, None)

    def list(self, folder, options):
        names = [path.split("/", 1)[1] for path in self.files if path.startswith(folder + "/")]
        return [{"name": name} for name in names if options.get("search", "") in name]


class FakeSupabase:
    def __init__(self):
        self.tables = {"projects": [], "profiles": []}
        self.buckets = {}
        self.storage = SimpleNamespace(from_=lambda bucket: FakeBucket(self.buckets.setdefault(bucket, {})))

    def table(self, name):
        return FakeQuery(self.tables[name])


FREELANCER = "11111111-1111-1111-1111-111111111111"
CLIENT = "22222222-2222-2222-2222-222222222222"
PROJECT = "33333333-3333-3333-3333-333333333333"
OTHER_PROJECT = "44444444-4444-4444-4444-444444444444"

small = io.BytesIO()
Image.new("RGB", (640, 480), (30, 30, 30)).save(small, format="PNG")
ORIGINAL = f"{FREELANCER}/{PROJECT}-200.png"


def fresh_database():
    db = FakeSupabase()
    db.tables["profiles"].append({"id": FREELANCER, "username": "mrwhat"})
    db.tables["projects"].append({"id": PROJECT, "freelancer_id": FREELANCER, "client_id": CLIENT,
                                  "submission_path": ORIGINAL, "preview_path": None})
    db.buckets["deliverables"] = {ORIGINAL: small.getvalue()}
    db.buckets["deliverable-previews"] = {
        f"{FREELANCER}/{PROJECT}-100-preview.jpg": b"old",              # earlier work on this project
        f"{FREELANCER}/{OTHER_PROJECT}-100-preview.jpg": b"keep me",    # another project
    }
    return db


db = fresh_database()
answer = dp.make_and_save(db, dict(db.tables["projects"][0]))
expected = f"{FREELANCER}/{PROJECT}-200-preview.jpg"
previews = db.buckets["deliverable-previews"]
check("saving: the preview is named after the original", answer == {"preview_path": expected}, str(answer))
check("saving: the preview is in the preview bucket, as a JPEG", previews.get(expected, b"")[:3] == b"\xff\xd8\xff")
check("saving: the project now points at it", db.tables["projects"][0]["preview_path"] == expected)
check("saving: the preview of earlier work on the same project is removed",
      f"{FREELANCER}/{PROJECT}-100-preview.jpg" not in previews)
check("saving: another project's preview is left alone", f"{FREELANCER}/{OTHER_PROJECT}-100-preview.jpg" in previews)

db = fresh_database()
stale = dict(db.tables["projects"][0])
db.tables["projects"][0]["submission_path"] = f"{FREELANCER}/{PROJECT}-300.png"  # new work was sent meanwhile
db.buckets["deliverables"][stale["submission_path"]] = small.getvalue()
problem = raises(HTTPException, lambda: dp.make_and_save(db, stale))
check("saving: new work sent meanwhile -> 409 and nothing left behind",
      problem is not None and problem.status_code == 409
      and f"{FREELANCER}/{PROJECT}-200-preview.jpg" not in db.buckets["deliverable-previews"]
      and db.tables["projects"][0]["preview_path"] is None)

db = fresh_database()
db.tables["projects"][0]["submission_path"] = f"{FREELANCER}/{PROJECT}-200.zip"
problem = raises(HTTPException, lambda: dp.make_and_save(db, dict(db.tables["projects"][0])))
check("saving: a ZIP gets no preview (400)", problem is not None and problem.status_code == 400)

db = fresh_database()
db.buckets["deliverables"].clear()
problem = raises(HTTPException, lambda: dp.make_and_save(db, dict(db.tables["projects"][0])))
check("saving: a missing original -> 404", problem is not None and problem.status_code == 404)


def fake_login(authorization):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Please log in first.")
    return authorization.removeprefix("Bearer ")


db = fresh_database()
app = FastAPI()
app.include_router(dp.preview_router(db, fake_login))
client = TestClient(app)


def ask(project_id, user=None):
    headers = {"Authorization": f"Bearer {user}"} if user else {}
    return client.post("/deliverables/preview", json={"project_id": project_id}, headers=headers)


check("route: no login -> 401", ask(PROJECT).status_code == 401)
check("route: the client can't make it -> 403", ask(PROJECT, CLIENT).status_code == 403)
check("route: not a project id -> 404", ask("not-an-id", FREELANCER).status_code == 404)
check("route: an unknown project -> 403", ask(OTHER_PROJECT, FREELANCER).status_code == 403)
response = ask(PROJECT, FREELANCER)
check("route: the freelancer gets the preview made", response.status_code == 200 and response.json() == {"preview_path": expected},
      f"{response.status_code} {response.text[:200]}")
db.buckets["deliverable-previews"][expected] = b"made once"
response = ask(PROJECT, FREELANCER)
check("route: asking again returns the same preview without making it again",
      response.json() == {"preview_path": expected} and db.buckets["deliverable-previews"][expected] == b"made once")

print(f"\n{sum(results)} of {len(results)} checks passed")
sys.exit(0 if all(results) else 1)
