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

## Host it on Hugging Face Spaces (free)

1. Create a new Space: SDK **Docker**, hardware **CPU basic (free)**.
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
