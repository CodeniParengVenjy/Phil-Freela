"""Turns text into 384 numbers that capture its meaning, using the pretrained
all-MiniLM-L6-v2 model (sentence-transformers, Apache 2.0). Used by the
documents copy check (watermarking step 6), and meant to be shared with the
planned AI search box. Nothing is trained here.

The 8-bit ONNX version and its tokenizer come from Hugging Face's
Xenova/all-MiniLM-L6-v2; get_models.py downloads them.

How it works: the tokenizer cuts the text into word pieces, the model gives
each piece 384 numbers that depend on the words around it, and the average of
those (the "mean pooling" the model was trained with) describes the whole
text. Texts with the same meaning get similar numbers, even with different
words, so they're compared with cosine similarity (1.0 = same meaning).
"""

import os

import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
MODEL_FILE = "minilm_l6_v2_quantized.onnx"
TOKENIZER_FILE = "minilm_tokenizer.json"
MAX_TOKENS = 256  # the model's limit; longer text is cut off

_session = None
_tokenizer = None


def _load():
    global _session, _tokenizer
    if _session is None:
        _session = ort.InferenceSession(os.path.join(MODELS, MODEL_FILE), providers=["CPUExecutionProvider"])
        _tokenizer = Tokenizer.from_file(os.path.join(MODELS, TOKENIZER_FILE))
        _tokenizer.enable_truncation(max_length=MAX_TOKENS)
        _tokenizer.enable_padding()
    return _session, _tokenizer


def embed_texts(texts):
    """Each text's 384 numbers, scaled to length 1 (so cosine similarity is
    just the dot product). Returns a (number of texts x 384) array."""
    session, tokenizer = _load()
    encoded = tokenizer.encode_batch(list(texts))
    ids = np.array([e.ids for e in encoded], dtype=np.int64)
    mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)
    tokens = session.run(None, {"input_ids": ids, "attention_mask": mask, "token_type_ids": np.zeros_like(ids)})[0]
    # Average the word pieces (padding doesn't count), then scale to length 1.
    summed = (tokens * mask[..., None]).sum(axis=1)
    mean = summed / np.maximum(mask.sum(axis=1, keepdims=True), 1)
    return mean / np.linalg.norm(mean, axis=1, keepdims=True)
