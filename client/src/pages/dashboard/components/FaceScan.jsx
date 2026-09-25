import { useEffect, useRef, useState } from "react";
import { loadFaceTracker, measureFace } from "../../../lib/faceTracker";

// How the scan decides (see measureFace in lib/faceTracker.js). Picked by
// measuring sample photos: straight faces measured about -0.07 to +0.05, and
// clearly turned heads 0.5 or more. The turn asked for is bigger than the AI
// service's own minimum, so a scan that passes here also passes there.
const STRAIGHT_MAX_TURN = 0.15;
const MIN_TURN = 0.45;
// The face must take up at least this much of the picture's width.
const MIN_FACE_WIDTH = 0.12;
// Frames in a row the face must stay straight and still (about half a second).
const HOLD_STILL_FRAMES = 10;
// If the face disappears for this long mid-scan, the scan starts over, so
// nobody can swap in someone else's face partway through.
const LOST_FACE_MS = 1500;
// After this long on a turn step, suggest turning further.
const STUCK_MS = 8000;

const STEPS = [
  { prompt: "Look straight at the camera", icon: "bi-person-bounding-box" },
  { prompt: "Slowly turn your head to the left", icon: "bi-arrow-left-circle" },
  { prompt: "Now slowly turn your head to the right", icon: "bi-arrow-right-circle" }
];

// Saves a copy of a checked snapshot as a JPEG. The saved photo isn't mirrored.
function saveSnapshot(snapshot) {
  const copy = document.createElement("canvas");
  copy.width = snapshot.width;
  copy.height = snapshot.height;
  copy.getContext("2d").drawImage(snapshot, 0, 0);
  return new Promise((resolve) => copy.toBlob(resolve, "image/jpeg", 0.92));
}

function cameraErrorMessage(err) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "The face scan needs a secure (https) connection. Open the site with https:// and try again.";
  }
  if (err?.name === "NotAllowedError") {
    return "Camera access is blocked. Allow the camera for this site in your browser's settings, then try again.";
  }
  if (err?.name === "NotFoundError") return "No camera was found on this device.";
  return "Couldn't start the face scan. Close other apps using the camera, then try again.";
}

// Live face scan: the camera shows an oval guide, and the scan captures three
// frames by itself: looking straight, then turned one way, then the other.
// A printed photo or a picture on a screen can't turn its head, so this is a
// basic "liveness" check. Calls onComplete({ straight, left, right }) with the
// three frames as JPEG Blobs.
export default function FaceScan({ onComplete, onCancel }) {
  const videoRef = useRef(null);
  // "loading" -> "scanning" -> "done", or "error".
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const [hint, setHint] = useState("");
  // Bumped by "Try again" to restart everything.
  const [attempt, setAttempt] = useState(0);
  // The latest onComplete, without restarting the camera when it changes.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let cancelled = false;
    let stream = null;
    let frameId = 0;
    // Everything the scan tracks between camera frames.
    const scan = { step: 0, frames: [], firstSide: 0, still: 0, lastSeen: 0, stepStartedAt: 0, lastVideoTime: -1, hint: "" };

    const say = (text) => {
      if (scan.hint !== text) {
        scan.hint = text;
        setHint(text);
      }
    };

    const stopCamera = () => {
      cancelAnimationFrame(frameId);
      stream?.getTracks().forEach((track) => track.stop());
    };

    const goToStep = (next) => {
      scan.step = next;
      scan.still = 0;
      scan.stepStartedAt = performance.now();
      setStep(next);
    };

    const restart = (reason) => {
      scan.frames = [];
      scan.firstSide = 0;
      goToStep(0);
      say(reason);
    };

    const capture = (snapshot) => {
      scan.frames.push(saveSnapshot(snapshot));
      if (scan.step < 2) {
        goToStep(scan.step + 1);
        say("");
        return;
      }
      // All three frames taken.
      scan.step = 3;
      stopCamera();
      setStatus("done");
      Promise.all(scan.frames).then(([straight, left, right]) => {
        if (!cancelled) onCompleteRef.current({ straight, left, right });
      });
    };

    // Runs for every new camera frame (a snapshot of it).
    const handleFrame = (snapshot, faces, now) => {
      if (faces.length === 0) {
        if (scan.step > 0 && now - scan.lastSeen > LOST_FACE_MS) {
          restart("We lost your face, so the scan started over. Keep your face inside the oval.");
        } else if (scan.step === 0) {
          say("Show your face inside the oval.");
        }
        scan.still = 0;
        return;
      }
      if (faces.length > 1) {
        say("Only one person should be in view.");
        scan.still = 0;
        return;
      }

      scan.lastSeen = now;
      const face = measureFace(faces[0]);

      if (scan.step === 0) {
        let problem = "";
        if (face.width < MIN_FACE_WIDTH) {
          problem = "Move a little closer to the camera.";
        } else if (Math.abs(face.centerX - 0.5) > 0.25 || Math.abs(face.centerY - 0.5) > 0.3) {
          problem = "Center your face inside the oval.";
        } else if (Math.abs(face.turn) > STRAIGHT_MAX_TURN) {
          problem = "Look straight at the camera.";
        }

        if (problem) {
          scan.still = 0;
          say(problem);
          return;
        }
        scan.still += 1;
        say("Hold still...");
        if (scan.still >= HOLD_STILL_FRAMES) capture(snapshot);
        return;
      }

      const turnedEnough = Math.abs(face.turn) >= MIN_TURN;
      const side = Math.sign(face.turn);
      if (scan.step === 1 && turnedEnough) {
        scan.firstSide = side;
        capture(snapshot);
      } else if (scan.step === 2 && turnedEnough && side !== scan.firstSide) {
        capture(snapshot);
      } else if (scan.step === 2 && turnedEnough) {
        say("That's the same side. Turn your head the other way.");
      } else if (now - scan.stepStartedAt > STUCK_MS) {
        say("Turn your head a little further.");
      }
    };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("insecure");
        const [tracker, media] = await Promise.all([
          loadFaceTracker(),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
          })
        ]);
        stream = media;
        if (cancelled) return stopCamera();

        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        setStatus("scanning");
        scan.stepStartedAt = performance.now();

        // Each new camera frame is copied into this snapshot first. The face
        // tracker checks the snapshot, and a capture saves that same snapshot,
        // so the saved photo is always exactly the one that passed. (The live
        // video can move on while the tracker is working, especially on a
        // slow computer.)
        const snapshot = document.createElement("canvas");
        const snapshotContext = snapshot.getContext("2d");

        const tick = () => {
          if (cancelled || scan.step > 2) return;
          if (video.readyState >= 2 && video.currentTime !== scan.lastVideoTime) {
            scan.lastVideoTime = video.currentTime;
            if (snapshot.width !== video.videoWidth || snapshot.height !== video.videoHeight) {
              snapshot.width = video.videoWidth;
              snapshot.height = video.videoHeight;
            }
            snapshotContext.drawImage(video, 0, 0);
            const now = performance.now();
            handleFrame(snapshot, tracker.detectForVideo(snapshot, now).faceLandmarks, now);
          }
          if (scan.step <= 2) frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        stopCamera();
        // Camera problems have a name (like "NotAllowedError"); the rest are
        // the face scanner's files failing to load.
        const cameraProblem = err?.name && err.name !== "Error";
        setError(cameraProblem || err?.message === "insecure"
          ? cameraErrorMessage(err)
          : "Couldn't load the face scanner. Check your connection and try again.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [attempt]);

  const tryAgain = () => {
    setError("");
    setStep(0);
    setHint("");
    setStatus("loading");
    setAttempt((n) => n + 1);
  };

  const current = STEPS[Math.min(step, 2)];

  return (
    <div className="text-center">
      {status === "error" ? (
        <div className="bg-dark bg-opacity-50 p-4 rounded-3 border border-secondary border-opacity-25">
          <i className="bi bi-camera-video-off fs-1 text-warning"></i>
          <p className="text-warning fs-7 mt-2">{error}</p>
          <button type="button" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white" onClick={tryAgain}>Try again</button>
        </div>
      ) : (
        <>
          <div className="position-relative mx-auto overflow-hidden rounded-4 bg-black" style={{ maxWidth: 360, aspectRatio: "3 / 4" }}>
            {/* Mirrored, like a mirror, so "turn left" feels natural. */}
            <video ref={videoRef} playsInline muted className="w-100 h-100" style={{ objectFit: "cover", transform: "scaleX(-1)" }} />
            {/* Dark area outside the oval, and the oval outline. */}
            <svg viewBox="0 0 300 400" className="position-absolute top-0 start-0 w-100 h-100" aria-hidden="true">
              <defs>
                <mask id="faceScanHole">
                  <rect width="300" height="400" fill="white" />
                  <ellipse cx="150" cy="190" rx="105" ry="140" fill="black" />
                </mask>
              </defs>
              <rect width="300" height="400" fill="rgba(0,0,0,0.55)" mask="url(#faceScanHole)" />
              <ellipse cx="150" cy="190" rx="105" ry="140" fill="none" strokeWidth="4"
                stroke={status === "done" ? "#22c55e" : "var(--accent-role)"} strokeDasharray={status === "scanning" ? "none" : "10 8"} />
            </svg>
            {status === "loading" && (
              <div className="position-absolute top-50 start-50 translate-middle text-white fs-7">
                <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Starting the face scan...
              </div>
            )}
          </div>

          <div className="d-flex justify-content-center gap-2 mt-3" aria-hidden="true">
            {STEPS.map((s, index) => (
              <span key={s.prompt} className="rounded-circle d-inline-block"
                style={{ width: 10, height: 10, background: index < step || status === "done" ? "#22c55e" : index === step ? "var(--accent-role)" : "rgba(255,255,255,0.25)" }} />
            ))}
          </div>

          <p className="text-white fw-bold fs-5 mt-3 mb-1">
            {status === "done" ? (
              <><i className="bi bi-check-circle-fill text-success me-2"></i>Face scan complete</>
            ) : (
              <><i className={`bi ${current.icon} me-2`}></i>{current.prompt}</>
            )}
          </p>
          <p className="text-secondary fs-7 mb-3" style={{ minHeight: "1.5em" }} aria-live="polite">{status === "scanning" ? hint : ""}</p>

          {onCancel && status !== "done" && (
            <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 fw-bold" onClick={onCancel}>Cancel</button>
          )}
        </>
      )}
    </div>
  );
}
