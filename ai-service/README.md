# PhilFreela AI Service

The Python service behind PhilFreela's identity verification (eKYC). It checks
ID photos, compares the face on the ID with a live face scan, and saves the
results for an admin to review. It uses two small pretrained models that come
with OpenCV (in the `models` folder); nothing is trained here:

- **YuNet** finds faces (and the eyes, nose and mouth, used for the head-turn check).
- **SFace** turns a face into 128 numbers; photos of the same person give
  similar numbers.

The SFace file (37 MB) is too big to keep in GitHub comfortably, so
`get_models.py` downloads it from OpenCV's model collection and checks its
fingerprint. Vercel runs it while building; on a laptop, run it once.

It also watermarks every photo that freelancers upload to their services and
portfolio projects (`POST /slides`):

- **Visible watermark** (`visible_watermark.py`): the freelancer's name drawn
  in the style they picked in Settings > Watermark Settings, in the website's
  own font, Plus Jakarta Sans (SIL Open Font License, `assets/OFL.txt`).
- **Invisible code** (`hidden_watermark.py`): a random 48-bit code hidden with
  **HiDDeN** ("Hiding Data with Deep Networks"), using Meta's pretrained model
  from the Stable Signature project
  (https://github.com/facebookresearch/stable_signature, weights licensed
  CC BY-NC 4.0: free for non-commercial use such as this capstone, credit to
  Meta). `export_hidden.py` turned it into the two small ONNX files in
  `models/` once; it needs PyTorch, which isn't part of `requirements.txt`.
- **Videos** (`watermark_video.py`): turned into a compressed 720p MP4 with
  FFmpeg (through `imageio-ffmpeg`; on Vercel, `get_models.py` adds FFmpeg
  compressed, to stay under the 500 MB limit); the visible watermark is
  laid over every frame and the invisible code is hidden in every frame (the
  HiDDeN pattern is worked out every 2 seconds and reused in between, to fit
  Vercel's single CPU). The finished video is read back as a self-check.

## Online: Vercel (free)

The live website (phil-freela.pages.dev) can't run Python, so this service
runs on Vercel. The browser still only talks to phil-freela.pages.dev/ai: a
Cloudflare function (`client/functions/ai`) passes the requests on to Vercel.

One-time setup:

1. On vercel.com, sign in with GitHub, then **Add New → Project** and import
   the Phil-Freela repository.
2. Set **Root Directory** to `ai-service`.
3. Under **Environment Variables**, add:
   - `SUPABASE_URL`: the Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service_role key (secret)
   - `ALLOWED_ORIGINS`: `https://phil-freela.pages.dev`
4. Click **Deploy**. Opening `https://<project>.vercel.app/health` should show
   `{"status":"ok"}`.
5. On Cloudflare Pages (phil-freela > Settings > Variables and secrets), set
   `AI_SERVICE_URL` to that address (no slash at the end), then redeploy the website.

After that, every push to GitHub updates it by itself. `vercel.json` runs
`get_models.py` while building, runs the service in Tokyo (next to the Supabase
database) and includes the model files. When nobody has used it for a while,
the first check takes a few extra seconds.

## Run it on a laptop

From this folder:

    py -3.10 -m venv .venv
    .venv\Scripts\python -m pip install -r requirements.txt
    .venv\Scripts\python get_models.py
    copy .env.example .env      (then fill in the real values)
    .venv\Scripts\python -m uvicorn main:app --port 8000

The website's dev server (`npm run dev` in `client`) forwards `/ai` to it.
