"""Watermarks for videos (watermarking system, step 7).

A video is turned into a compressed 720p MP4 (FFmpeg, through the
imageio-ffmpeg package), and every frame gets:
1. the freelancer's visible watermark (drawn once, laid over every frame), and
2. the invisible HiDDeN code (see hidden_watermark.py).

Speed trick: running the HiDDeN encoder on every frame (about 900 for 30
seconds) would take minutes on Vercel's single CPU. So it runs on one "key"
frame every 2 seconds, and that frame's pattern is also added to the frames up
to the next key frame; nearby frames look almost the same, so the pattern
still fits them. Afterwards the finished video is read back from a few frames.
"""

import lzma
import os
import shutil
import tempfile

import cv2
import imageio_ffmpeg
import numpy as np

from hidden_watermark import code_change, read_code_from_frames, wrong_bits

MAX_SIDE = 1280  # 720p (1280x720 for a wide video, 720x1280 for a tall one)
MAX_FPS = 30
KEY_FRAME_SECONDS = 2  # a new hidden pattern every 2 seconds
# H.264 quality: 18 = nearly lossless ... 28 = small. 23 keeps the pattern readable.
CRF = 23
# JND multiplier (photos use 1.5-4.0). Chosen from tests: at 2.5, re-compressed
# copies lost 7-11 bits; at 3.0 they lose 2-6, which still matches.
STRENGTH = 3.0
CHECK_FRAMES = 4  # frames read back in the self-check
MAX_WRONG_BITS = 4  # in the read-back of the finished video

# On Vercel, FFmpeg comes compressed in the models folder (see get_models.py).
PACKED_FFMPEG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models", "ffmpeg-linux-x86_64.xz")


def _unpack_ffmpeg():
    """Unpacks the compressed FFmpeg to the temporary folder the first time a
    video comes in (about 3 seconds) and tells imageio-ffmpeg to use it. On a
    laptop there's nothing to do: its imageio-ffmpeg includes FFmpeg."""
    if os.environ.get("IMAGEIO_FFMPEG_EXE") or not os.path.exists(PACKED_FFMPEG):
        return
    program = os.path.join(tempfile.gettempdir(), "ffmpeg")
    if not os.path.exists(program):
        # Written under a temporary name first, so two uploads at once can't
        # use a half-written copy.
        handle, partial = tempfile.mkstemp(dir=tempfile.gettempdir())
        with lzma.open(PACKED_FFMPEG) as packed, os.fdopen(handle, "wb") as out:
            shutil.copyfileobj(packed, out)
        os.chmod(partial, 0o755)
        os.replace(partial, program)
    os.environ["IMAGEIO_FFMPEG_EXE"] = program


def video_info(path):
    """(width, height, fps, seconds, has_sound) of a video file, with phone
    videos' rotation already applied to the width and height."""
    _unpack_ffmpeg()
    frames = imageio_ffmpeg.read_frames(path)
    meta = next(frames)
    frames.close()
    width, height = meta["size"]
    if meta.get("rotate") in (90, 270):
        width, height = height, width
    return width, height, meta["fps"], meta["duration"], bool(meta.get("audio_codec"))


def _even(value):
    return max(2, int(value) // 2 * 2)


def output_size(width, height):
    """The saved video's (width, height): at most 1280 on its longer side,
    never bigger than the original, and even (MP4 needs even sizes)."""
    scale = min(1.0, MAX_SIDE / max(width, height))
    return _even(width * scale), _even(height * scale)


def watermark_video(in_path, out_path, code, layer=None):
    """Writes the watermarked 720p MP4 to out_path. layer: the visible
    watermark (an RGBA PIL image of output_size) or None. Returns the key
    frames twice, as (uploaded, shown): as they came in and as they were
    saved (HxWx3 arrays), for the copy check."""
    width, height, fps, _, has_sound = video_info(in_path)
    out_w, out_h = output_size(width, height)
    out_fps = min(fps or MAX_FPS, MAX_FPS)
    if layer is not None and layer.size != (out_w, out_h):
        raise ValueError("The watermark layer must be the size of the output video.")

    # The visible watermark, kept only for the box where it's drawn (a corner
    # mark is small, so most of each frame is left alone): its colors, and how
    # much of it (alpha) and of the frame (1 - alpha) to mix at each pixel.
    box = None
    if layer is not None and layer.getbbox():
        x0, y0, x1, y1 = layer.getbbox()
        rgba = np.asarray(layer.crop((x0, y0, x1, y1)))
        alpha = rgba[..., 3].astype(np.float32) / 255
        box = (slice(y0, y1), slice(x0, x1), np.ascontiguousarray(rgba[..., :3]), 1 - alpha, alpha)
    reader = imageio_ffmpeg.read_frames(in_path, output_params=["-vf", f"fps={out_fps},scale={out_w}:{out_h}"])
    next(reader)  # the first item is the video's details
    writer = imageio_ffmpeg.write_frames(
        out_path, (out_w, out_h), fps=out_fps, codec="libx264", quality=None, macro_block_size=2,
        output_params=["-crf", str(CRF), "-preset", "veryfast", "-movflags", "+faststart"],
        audio_path=in_path if has_sound else None, audio_codec="aac" if has_sound else None,
    )
    writer.send(None)  # starts FFmpeg

    key_every = max(1, round(out_fps * KEY_FRAME_SECONDS))
    uploaded, shown = [], []
    try:
        for count, data in enumerate(reader):
            frame = np.frombuffer(data, dtype=np.uint8).reshape(out_h, out_w, 3)
            is_key = count % key_every == 0
            if is_key:
                uploaded.append(frame)
            if box is not None:
                rows, cols, color, frame_part, mark_part = box
                frame = frame.copy()
                frame[rows, cols] = cv2.blendLinear(np.ascontiguousarray(frame[rows, cols]), color, frame_part, mark_part)
            if is_key:
                # A key frame: work out the hidden pattern for the next 2
                # seconds, as two layers of whole numbers (how much lighter,
                # how much darker) that OpenCV adds fast without going past 0 or 255.
                change = np.round(code_change(frame.astype(np.float32), code, STRENGTH))
                lighter = np.clip(change, 0, 255).astype(np.uint8)
                darker = np.clip(-change, 0, 255).astype(np.uint8)
            marked = cv2.subtract(cv2.add(frame, lighter), darker)
            if is_key:
                shown.append(marked)
            writer.send(marked)
    finally:
        writer.close()
        reader.close()
    return uploaded, shown


def spread(frames, how_many):
    """How_many of the frames, evenly spread from the first to the last."""
    if len(frames) <= how_many:
        return frames
    return [frames[round(i * (len(frames) - 1) / (how_many - 1))] for i in range(how_many)]


def sample_frames(path, how_many):
    """How_many frames spread across the video, as HxWx3 arrays (0-255)."""
    width, height, _, seconds, _ = video_info(path)
    rate = how_many / max(seconds, 0.1)
    reader = imageio_ffmpeg.read_frames(path, output_params=["-vf", f"fps={rate}"])
    next(reader)
    frames = [np.frombuffer(data, dtype=np.uint8).reshape(height, width, 3).astype(np.float32) for data in reader]
    reader.close()
    return frames[:how_many] if len(frames) > how_many else frames


def read_video_code(path, how_many=CHECK_FRAMES):
    """The code read from several frames of a video together."""
    frames = sample_frames(path, how_many)
    return read_code_from_frames(frames) if frames else None


def code_reads_back(path, code):
    """Self-check: does the finished video give back its code?"""
    found = read_video_code(path)
    return found is not None and wrong_bits(found, code) <= MAX_WRONG_BITS
