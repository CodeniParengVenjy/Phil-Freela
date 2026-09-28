"""Downloads the models too big to keep in GitHub into the models folder:
the SFace face model (37 MB), the copy check's ViT (23 MB), and the
documents' text model (23 MB).

They're fetched from OpenCV's model collection and Hugging Face instead:
Vercel runs this while building (see vercel.json), and on a laptop you run it
once:
    .venv\\Scripts\\python get_models.py

Each file's fingerprint (SHA-256) is checked, so a changed or broken download
is refused instead of used.
"""

import hashlib
import os
import urllib.request

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
}


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


if __name__ == "__main__":
    main()
