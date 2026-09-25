"""Downloads the pretrained models once (used by the Dockerfile while building).

On a laptop this isn't needed: DeepFace downloads them the first time they're used.
"""

from deepface import DeepFace

DeepFace.build_model(model_name="ArcFace")                             # compares faces
DeepFace.build_model(model_name="yunet", task="face_detector")        # finds faces (fast)
DeepFace.build_model(model_name="retinaface", task="face_detector")   # finds faces (backup)
print("Models ready.")
