import { useEffect, useRef, useState } from "react";

// Live webcam preview with a Capture button. The camera turns on when this
// appears and off again after capturing or when it's closed, so the camera
// light never stays on. onCapture receives the photo as a JPEG Blob.
// "mirror" flips only the preview (like a mirror, nicer for selfies); the
// saved photo is never flipped, so text on an ID stays readable.
export default function CameraCapture({ mirror = false, hint, onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // "cancelled" covers the camera finishing its start-up after this was
    // already closed: that late stream is stopped right away.
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err.name === "NotAllowedError"
            ? "Camera access is blocked. Click the camera icon in your browser's address bar, allow it, then try again."
            : "Couldn't start the camera. Make sure no other app is using it."
        );
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const capture = () => {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      onCapture(blob);
    }, "image/jpeg", 0.92);
  };

  return (
    <div className="bg-dark bg-opacity-50 p-3 rounded-3 border border-secondary border-opacity-25">
      {error ? (
        <p className="text-warning fs-7 mb-3">{error}</p>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => setReady(true)}
          className="w-100 rounded-3 bg-black"
          style={{ maxHeight: 360, objectFit: "contain", transform: mirror ? "scaleX(-1)" : "none" }}
        />
      )}

      {hint && !error && <p className="text-secondary fs-8 mt-2 mb-3">{hint}</p>}

      <div className="d-flex gap-2">
        {!error && (
          <button type="button" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white" onClick={capture} disabled={!ready}>
            <i className="bi bi-camera-fill me-1"></i> {ready ? "Capture" : "Starting camera..."}
          </button>
        )}
        <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 fw-bold" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
