---
title: PhilFreela AI Service
emoji: 🪪
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# PhilFreela AI Service

The Python service behind PhilFreela's identity verification (eKYC). It checks
ID photos, compares the face on the ID with a live face scan using pretrained
models (DeepFace with ArcFace, YuNet and RetinaFace), and saves the results for
an admin to review. Nothing is trained here.

(The block at the top of this file is read by Hugging Face Spaces: it says the
Space is built from the `Dockerfile` and listens on port 7860.)

## Run it on a laptop

From this folder:

    py -3.10 -m venv .venv
    .venv\Scripts\python -m pip install -r requirements.txt
    copy .env.example .env      (then fill in the real values)
    .venv\Scripts\python -m uvicorn main:app --port 8000

The website's dev server (`npm run dev` in `client`) forwards `/ai` to it.

## Let the live site use it (free, with ngrok)

The live site (phil-freela.pages.dev) can't run Python, so it reaches this
service on the laptop through an ngrok link. The browser still only talks to
phil-freela.pages.dev/ai; a Cloudflare function (`client/functions/ai`)
passes the requests on to the ngrok link, so every network works.

1. Install ngrok (Microsoft Store) and log in once:
   `ngrok config add-authtoken <token from dashboard.ngrok.com>`.
2. Double-click `start-ai.bat` (in the main project folder). It starts this
   service and the ngrok link; keep both windows open.
3. On Cloudflare Pages, set `AI_SERVICE_URL` to the ngrok link (no slash at
   the end) and redeploy the website. The link stays the same every time.

Verification on the live site works only while `start-ai.bat` is running.

## Host it on Hugging Face Spaces (needs a paid plan)

Hugging Face now charges for Docker Spaces. The `Dockerfile` is kept for this:

1. Create a new Space: SDK **Docker**.
2. Upload these files from this folder: `Dockerfile`, `README.md`,
   `requirements.txt`, `main.py`, `face_check.py`, `photo_checks.py`,
   `download_models.py`. (Never upload `.env`.)
3. In the Space's **Settings → Variables and secrets**, add these **secrets**:
   - `SUPABASE_URL`: the Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service_role key
   - `ALLOWED_ORIGINS`: the website's address, e.g. `https://phil-freela.pages.dev`
4. Wait for the build (about 10 minutes the first time). Opening
   `https://<user>-<space>.hf.space/health` should show `{"status":"ok"}`.
5. On Cloudflare Pages, set `VITE_AI_SERVICE_URL` to that address (no slash at
   the end) and redeploy the website.

Free Spaces go to sleep after about 2 days without visitors; the first request
after that takes a minute or two while it wakes up.
