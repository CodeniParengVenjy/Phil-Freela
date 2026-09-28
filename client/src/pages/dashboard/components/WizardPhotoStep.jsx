import { useRef, useState } from "react";
import { shrinkImage } from "../../../lib/shrinkImage";
import CameraCapture from "./CameraCapture";
import MediaDropzone from "./MediaDropzone";
import PhotoPreview from "./PhotoPreview";

// Photo types the upload box accepts. Big phone photos are fine: every photo
// is shrunk in the browser before it's sent (see lib/shrinkImage.js).
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

// One ID photo step of the verification form (front or back of the ID).
//   mode "computer": upload a photo, or take it with the webcam.
//   mode "phone":    open the phone's back camera, or pick a photo of the ID
//                    already saved on the phone (gallery or files).
// Either way the photo gets the same instant check (sharp, face found, looks
// like an ID). Only the ID photos can be uploaded: the face scan is always live.
// "side" is { file, status, message }, where status is "idle", "checking",
// "ok" or "error". The parent runs the instant check in onPhoto(file).
export default function WizardPhotoStep({ mode, instructions, prompt, cameraHint, buttonText, side, onPhoto }) {
  const phoneInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pickError, setPickError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const busy = preparing || side.status === "checking";

  // Checks the picked file, shrinks it, and hands it to the parent.
  const acceptFile = async (file) => {
    setPickError("");
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type) && !(mode === "phone" && file.type.startsWith("image/"))) {
      setPickError("Only JPG, PNG or WebP photos are allowed.");
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setPickError("That photo is too big (over 25 MB).");
      return;
    }
    setPreparing(true);
    try {
      onPhoto(await shrinkImage(file));
    } catch (err) {
      setPickError(err.message);
    } finally {
      setPreparing(false);
    }
  };

  const handleCapture = (blob) => {
    setCameraOpen(false);
    onPhoto(new File([blob], "id-photo.jpg", { type: "image/jpeg" }));
  };

  const openPhoneCamera = () => phoneInputRef.current?.click();
  const openPhoneGallery = () => galleryInputRef.current?.click();

  // Both hidden inputs hand the picked photo to acceptFile.
  const handlePicked = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = ""; // so picking the same photo again still counts as a change
    acceptFile(picked);
  };

  return (
    <div className="d-flex flex-column gap-3">
      <p className="text-secondary fs-7 mb-0">{instructions}</p>

      {mode === "phone" ? (
        <>
          {/* capture="environment" opens the back camera; without it, the
              phone offers its gallery and files instead. */}
          <input ref={phoneInputRef} type="file" accept="image/*" capture="environment" className="d-none" onChange={handlePicked} />
          <input ref={galleryInputRef} type="file" accept="image/*" className="d-none" onChange={handlePicked} />
          {side.file ? (
            <div className="media-dropzone is-filled">
              <PhotoPreview photo={side.file} alt="Your ID photo" />
              <div className="flex-grow-1 d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold" onClick={openPhoneCamera} disabled={busy}>
                  <i className="bi bi-camera me-1"></i> Retake
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary text-white rounded-pill px-3 fw-bold" onClick={openPhoneGallery} disabled={busy}>
                  <i className="bi bi-images me-1"></i> Choose another
                </button>
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column gap-2">
              <button type="button" className="btn btn-outline-role rounded-3 w-100 py-3 fw-bold" onClick={openPhoneCamera} disabled={busy}>
                <i className="bi bi-camera-fill me-2"></i>{buttonText}
              </button>
              <button type="button" className="btn btn-outline-secondary text-white rounded-3 w-100 py-3 fw-bold" onClick={openPhoneGallery} disabled={busy}>
                <i className="bi bi-images me-2"></i>Upload from your photos
              </button>
            </div>
          )}
        </>
      ) : cameraOpen ? (
        <CameraCapture hint={cameraHint} onCapture={handleCapture} onCancel={() => setCameraOpen(false)} />
      ) : (
        <>
          <MediaDropzone
            file={side.file}
            onSelect={(file) => (file ? acceptFile(file) : onPhoto(null))}
            accept={IMAGE_TYPES.join(",")}
            prompt={prompt}
            hint="JPG, PNG or WebP. A clear phone photo works best."
          />
          {!busy && (
            <button type="button" className="btn btn-sm btn-outline-role rounded-pill px-3 fw-bold align-self-start" onClick={() => setCameraOpen(true)}>
              <i className="bi bi-camera me-1"></i> {side.file ? "Retake it with your webcam" : "Or take it with your webcam"}
            </button>
          )}
        </>
      )}

      {/* The result of the instant check. */}
      {preparing && <p className="text-secondary fs-7 mb-0"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Preparing photo...</p>}
      {side.status === "checking" && <p className="text-secondary fs-7 mb-0"><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Checking your photo...</p>}
      {side.status === "ok" && <p className="text-success fw-bold fs-7 mb-0"><i className="bi bi-check-circle-fill me-1"></i>Looks good!</p>}
      {side.status === "error" && <p className="text-warning fs-7 mb-0"><i className="bi bi-exclamation-triangle-fill me-1"></i>{side.message}</p>}
      {pickError && <p className="text-warning fs-7 mb-0"><i className="bi bi-exclamation-triangle-fill me-1"></i>{pickError}</p>}
    </div>
  );
}
