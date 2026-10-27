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
  own font, Plus Jakarta Sans (SIL Open Font License, `assets/OFL.txt`), or
  with Premium in DM Serif Display, Space Mono or Pacifico (also SIL Open
  Font License, `assets/OFL-*.txt`), in any color and 5 sizes.
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
- **Documents** (`text_watermark.py`, `document_pages.py`): a PDF, DOCX or
  TXT is kept as text with an invisible code written in zero-width
  characters. A PDF's first 5 pages are also kept as pictures, drawn by
  **PDFium** (the PDF reader inside Google Chrome, through the `pypdfium2`
  package, Apache 2.0 / BSD), each with the freelancer's name repeated
  faintly across the page and the same code hidden in it with HiDDeN.
  Visitors only get a **preview** of a document's text (`document_preview.py`:
  the first 30%, at most 1,500 characters, cut at a word): the public `.txt`
  file holds only that, and the whole text is saved in the private
  `slide_texts` table (only its writer and the admins can read it), so the
  website can blur the rest without the hidden part ever reaching the page.
  `python test_document_preview.py` checks the rule. A PDF's page pictures
  get the same treatment in the pixels (`page_blur.py`): only the top of the
  document stays clear (30% of the pages, at least a third of page 1, at most
  the whole of page 1) and the rest is blurred in the picture itself
  (shrunk into 10-pixel blocks, then smoothed, so small print can't be read
  back), before the name and the hidden code go on. The whole pages are kept
  in the private `slide-private` bucket for the writer and the admins.
  `python test_page_blur.py` checks it. Documents saved before this are fixed
  once by `python split_old_documents.py --apply`.

The same upload (`POST /slides`, for services and portfolio projects alike)
also runs the ownership check on every file before it is shown. A file that
fails waits for an admin on the Flagged Content page:

- **Hidden code**: does the file already carry another freelancer's code (a
  download of their work)? Read by `find_code_owner`, the same function the
  Check Ownership page uses: the photo as it is, and, when it looks at least
  a bit like someone else's photo, also as if its edges had been cropped
  off. Videos are read from up to 16 frames, and each page picture of a PDF
  is read too.
- **Look-alike** (`similarity.py`): is it nearly the same as another
  freelancer's photo or video frames? Compared with a Vision Transformer
  (Meta's DINO ViT-S/16). Writing is compared with a text model
  (`text_embedder.py`, all-MiniLM-L6-v2).

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
