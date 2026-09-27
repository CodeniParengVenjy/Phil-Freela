"""Converts Meta's pretrained HiDDeN watermarking model to ONNX. Run it once.

HiDDeN ("Hiding Data with Deep Networks", Zhu et al., 2018) hides a short
message in a picture in a way people can't see. We use Meta's pretrained copy
from the Stable Signature project (48-bit messages, trained on 256x256
pictures). Nothing is trained here:
    Code:    https://github.com/facebookresearch/stable_signature/tree/main/hidden
    Weights: https://dl.fbaipublicfiles.com/ssl_watermarking/hidden_replicate.pth
    License: CC BY-NC 4.0 (free for non-commercial use such as this capstone,
             with credit to Meta)

The AI service can't carry PyTorch on Vercel's free plan, so this script turns
the two networks into small ONNX files that onnxruntime runs:
    models/hidden_encoder.onnx   256x256 picture + 48 bits -> the hidden pattern
    models/hidden_decoder.onnx   picture -> 48 numbers (above 0 = bit 1)

Run it on a laptop, in its own Python environment (PyTorch is big and is not
part of requirements.txt):
    python -m pip install torch onnx
    python export_hidden.py
"""

import argparse
import os
import tempfile
import urllib.request

import torch
import torch.nn as nn

WEIGHTS_URL = "https://dl.fbaipublicfiles.com/ssl_watermarking/hidden_replicate.pth"
MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
NUM_BITS = 48
SIZE = 256


# The network, as in Meta's hidden/models.py (only the parts we use).

class ConvBNRelu(nn.Module):
    """3x3 convolution + batch normalization + GELU."""

    def __init__(self, channels_in, channels_out):
        super().__init__()
        self.layers = nn.Sequential(
            nn.Conv2d(channels_in, channels_out, 3, stride=1, padding=1),
            nn.BatchNorm2d(channels_out, eps=1e-3),
            nn.GELU(),
        )

    def forward(self, x):
        return self.layers(x)


class HiddenEncoder(nn.Module):
    """Picture + message -> a pattern (values -1..1) that carries the message."""

    def __init__(self, num_blocks=4, num_bits=NUM_BITS, channels=64):
        super().__init__()
        layers = [ConvBNRelu(3, channels)] + [ConvBNRelu(channels, channels) for _ in range(num_blocks - 1)]
        self.conv_bns = nn.Sequential(*layers)
        self.after_concat_layer = ConvBNRelu(channels + 3 + num_bits, channels)
        self.final_layer = nn.Conv2d(channels, 3, kernel_size=1)
        self.tanh = nn.Tanh()

    def forward(self, imgs, msgs):
        msgs = msgs.unsqueeze(-1).unsqueeze(-1).expand(-1, -1, imgs.size(-2), imgs.size(-1))
        encoded = self.conv_bns(imgs)
        pattern = self.after_concat_layer(torch.cat([msgs, encoded, imgs], dim=1))
        return self.tanh(self.final_layer(pattern))


class HiddenDecoder(nn.Module):
    """Picture -> one number per bit (above 0 means 1)."""

    def __init__(self, num_blocks=8, num_bits=NUM_BITS, channels=64):
        super().__init__()
        layers = [ConvBNRelu(3, channels)] + [ConvBNRelu(channels, channels) for _ in range(num_blocks - 1)]
        layers += [ConvBNRelu(channels, num_bits), nn.AdaptiveAvgPool2d(output_size=(1, 1))]
        self.layers = nn.Sequential(*layers)
        self.linear = nn.Linear(num_bits, num_bits)

    def forward(self, img_w):
        return self.linear(self.layers(img_w).squeeze(-1).squeeze(-1))


def load_weights():
    """Downloads Meta's checkpoint and splits it into the encoder and decoder."""
    path = os.path.join(tempfile.gettempdir(), "hidden_replicate.pth")
    if not os.path.exists(path):
        print("Downloading", WEIGHTS_URL)
        urllib.request.urlretrieve(WEIGHTS_URL, path)
    # The checkpoint also stores the training settings (an argparse Namespace);
    # allowing just that type keeps PyTorch's safe loading on.
    torch.serialization.add_safe_globals([argparse.Namespace])
    state = torch.load(path, map_location="cpu")["encoder_decoder"]
    state = {k.replace("module.", ""): v for k, v in state.items()}

    encoder, decoder = HiddenEncoder(), HiddenDecoder()
    encoder.load_state_dict({k.replace("encoder.", "", 1): v for k, v in state.items() if k.startswith("encoder.")})
    decoder.load_state_dict({k.replace("decoder.", "", 1): v for k, v in state.items() if k.startswith("decoder.")})
    return encoder.eval(), decoder.eval()


def main():
    encoder, decoder = load_weights()
    os.makedirs(MODELS, exist_ok=True)
    picture = torch.rand(1, 3, SIZE, SIZE)
    message = torch.randint(0, 2, (1, NUM_BITS)).float() * 2 - 1

    encoder_path = os.path.join(MODELS, "hidden_encoder.onnx")
    torch.onnx.export(
        encoder, (picture, message), encoder_path, dynamo=False,
        input_names=["image", "message"], output_names=["pattern"], opset_version=17,
    )

    # The decoder accepts any picture size (it averages over the whole picture).
    decoder_path = os.path.join(MODELS, "hidden_decoder.onnx")
    torch.onnx.export(
        decoder, (picture,), decoder_path, dynamo=False,
        input_names=["image"], output_names=["bits"], opset_version=17,
        dynamic_axes={"image": {0: "batch", 2: "height", 3: "width"}, "bits": {0: "batch"}},
    )

    # Check the ONNX files give the same answers as PyTorch.
    import numpy as np
    import onnxruntime as ort
    with torch.no_grad():
        want_pattern = encoder(picture, message).numpy()
        want_bits = decoder(picture).numpy()
    got_pattern = ort.InferenceSession(encoder_path).run(None, {"image": picture.numpy(), "message": message.numpy()})[0]
    got_bits = ort.InferenceSession(decoder_path).run(None, {"image": picture.numpy()})[0]
    print("encoder max difference:", float(np.abs(want_pattern - got_pattern).max()))
    print("decoder max difference:", float(np.abs(want_bits - got_bits).max()))
    for path in (encoder_path, decoder_path):
        print(f"saved {path} ({os.path.getsize(path) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
