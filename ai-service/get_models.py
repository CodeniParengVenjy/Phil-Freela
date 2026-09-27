"""Downloads the SFace face model (37 MB) into the models folder.

It's too big to keep in GitHub comfortably, so it's fetched from OpenCV's own
model collection instead: Vercel runs this while building (see vercel.json),
and on a laptop you run it once:
    .venv\\Scripts\\python get_models.py

The file's fingerprint (SHA-256) is checked, so a changed or broken download
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
