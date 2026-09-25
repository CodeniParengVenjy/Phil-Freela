# Runs the AI service on Hugging Face Spaces (a free "Docker" Space).
# Hugging Face builds this file into a container and starts it; the website
# (phil-freela.pages.dev) then calls it at https://<user>-<space>.hf.space.
FROM python:3.10-slim

# OpenCV (used by DeepFace for images) needs these system libraries.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face runs the container as user 1000, so the app lives in that
# user's home folder (DeepFace also keeps its model files there).
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    TF_CPP_MIN_LOG_LEVEL=2
WORKDIR /home/user/app

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user . .

# Download the pretrained models now, while building, so they're ready the
# moment the service starts instead of on the first verification.
RUN python download_models.py

# Hugging Face Spaces sends web traffic to port 7860.
EXPOSE 7860
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
