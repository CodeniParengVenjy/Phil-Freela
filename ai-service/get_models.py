"""Downloads the models too big to keep in GitHub into the models folder:
the SFace face model (37 MB), the copy check's ViT (23 MB), the documents'
text model (23 MB), and moodboard matching's CLIP vision model (58 MB). On
Linux (Vercel) it also adds FFmpeg for videos, compressed (see get_ffmpeg).

They're fetched from OpenCV's model collection and Hugging Face instead:
Vercel runs this while building (see vercel.json), and on a laptop you run it
once:
    .venv\\Scripts\\python get_models.py

Each file's fingerprint (SHA-256) is checked, so a changed or broken download
is refused instead of used.
"""

import hashlib
import io
import lzma
import os
import sys
import urllib.request
import zipfile

MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")

FILES = {
    "face_recognition_sface_2021dec.onnx": (
        "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
        "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    ),
    # The copy check's Vision Transformer (Meta's DINO ViT-S/16, Apache 2.0),
    # the 8-bit ONNX version from Hugging Face (23 MB). See similarity.py.
    "dino_vits16_model_quantized.onnx": (
        "https://huggingface.co/Xenova/dino-vits16/resolve/main/onnx/model_quantized.onnx",
        "686df030e42d721ce72c8e89edc95cc9107068039298e3500d724727d69f172a",
    ),
    # The documents copy check's text model (all-MiniLM-L6-v2, Apache 2.0),
    # 8-bit ONNX (23 MB) and its tokenizer. See text_embedder.py.
    "minilm_l6_v2_quantized.onnx": (
        "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx",
        "afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1",
    ),
    "minilm_tokenizer.json": (
        "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json",
        "da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0",
    ),
    # Moodboard matching's image model (OpenAI's CLIP, MIT license), just the
    # vision half, 4-bit ONNX (58 MB -- the 8-bit version (89 MB) tested no
    # better at telling freelancers' work apart and didn't fit Vercel's
    # 500 MB limit alongside the other AI features). See moodboard.py.
    "clip_vision_quantized.onnx": (
        "https://huggingface.co/Xenova/clip-vit-base-patch32/resolve/main/onnx/vision_model_bnb4.onnx",
        "d37c9d4463a3ade0bd069e2d35af22f6cbe71ca6e64ad922dbd4f5b2cba9243e",
    ),
}

# FFmpeg for videos, on Linux only: the program inside imageio-ffmpeg's Linux
# package (80 MB), kept xz-compressed (21 MB) so the service stays under
# Vercel's 500 MB limit. watermark_video.py unpacks it when a video comes in.
FFMPEG_PACKAGE = (
    "https://files.pythonhosted.org/packages/a0/2d/43c8522a2038e9d0e7dbdf3a61195ecc31ca576fb1527a528c877e87d973/imageio_ffmpeg-0.6.0-py3-none-manylinux2014_x86_64.whl",
    "c7e46fcec401dd990405049d2e2f475e2b397779df2519b544b8aab515195282",
)
FFMPEG_INSIDE = "imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2"
FFMPEG_SHA256 = "e7e7fb30477f717e6f55f9180a70386c62677ef8a4d4d1a5d948f4098aa3eb99"
FFMPEG_PACKED = "ffmpeg-linux-x86_64.xz"


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main():
    os.makedirs(MODELS, exist_ok=True)
    for name, (url, expected) in FILES.items():
        path = os.path.join(MODELS, name)
        if os.path.exists(path) and sha256(path) == expected:
            print(f"{name}: already here")
            continue

        partial = path + ".part"
        urllib.request.urlretrieve(url, partial)
        if sha256(partial) != expected:
            os.remove(partial)
            raise SystemExit(f"{name}: the download doesn't match the expected file, so it wasn't used.")
        os.replace(partial, path)
        print(f"{name}: downloaded")

    if sys.platform == "linux":
        get_ffmpeg()


def get_ffmpeg():
    path = os.path.join(MODELS, FFMPEG_PACKED)
    if os.path.exists(path) and hashlib.sha256(lzma.open(path).read()).hexdigest() == FFMPEG_SHA256:
        print(f"{FFMPEG_PACKED}: already here")
        return

    url, expected = FFMPEG_PACKAGE
    package = urllib.request.urlopen(url).read()
    if hashlib.sha256(package).hexdigest() != expected:
        raise SystemExit("FFmpeg: the download doesn't match the expected file, so it wasn't used.")
    program = zipfile.ZipFile(io.BytesIO(package)).read(FFMPEG_INSIDE)
    if hashlib.sha256(program).hexdigest() != FFMPEG_SHA256:
        raise SystemExit("FFmpeg: the program isn't the expected one, so it wasn't used.")
    with open(path + ".part", "wb") as file:
        file.write(lzma.compress(program))
    os.replace(path + ".part", path)
    print(f"{FFMPEG_PACKED}: downloaded and compressed")


if __name__ == "__main__":
    main()
