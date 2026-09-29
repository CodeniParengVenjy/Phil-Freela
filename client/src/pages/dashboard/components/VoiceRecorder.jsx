import { useEffect, useRef, useState } from "react";
import { MAX_VOICE_SECONDS } from "../../../lib/chatFiles";

// Recording formats to try, best first. Chrome and Firefox record WebM or
// Ogg; Safari (iPhone) records MP4.
const FORMATS = [
  { mime: "audio/webm;codecs=opus", extension: "webm" },
  { mime: "audio/webm", extension: "webm" },
  { mime: "audio/mp4", extension: "m4a" },
  { mime: "audio/ogg;codecs=opus", extension: "ogg" }
];

// 75 -> "1:15"
function formatClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// The mic button's popup: records a voice message with the browser's
// MediaRecorder, then lets the sender listen back before sending it.
// onSend(recording) returns true once it's sent; onClose() closes the popup.
export default function VoiceRecorder({ onSend, onClose }) {
  // "starting" -> "recording" -> "recorded", or "error" (e.g. the mic is blocked).
  const [stage, setStage] = useState("starting");
  const [seconds, setSeconds] = useState(0);
  const [recording, setRecording] = useState(null); // { blob, mime, extension, url }
  const [problem, setProblem] = useState("");
  const [sending, setSending] = useState(false);
  const recorderRef = useRef(null);

  // Starts recording as soon as the popup opens, and always releases the
  // microphone when it closes.
  useEffect(() => {
    let stream = null;
    let timer = null;
    let cancelled = false;

    const startRecording = async () => {
      const format = window.MediaRecorder && FORMATS.find((f) => MediaRecorder.isTypeSupported(f.mime));
      if (!navigator.mediaDevices?.getUserMedia || !format) {
        setStage("error");
        setProblem("This browser can't record voice messages.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        if (!cancelled) {
          setStage("error");
          setProblem("Microphone access was blocked. Allow it in your browser's settings, then try again.");
        }
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: format.mime });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        clearInterval(timer);
        stream.getTracks().forEach((track) => track.stop());
        if (cancelled) return;
        // "audio/webm;codecs=opus" is saved as plain "audio/webm".
        const mime = format.mime.split(";")[0];
        const blob = new Blob(chunks, { type: mime });
        setRecording({ blob, mime, extension: format.extension, url: URL.createObjectURL(blob) });
        setStage("recorded");
      };
      recorder.start();
      recorderRef.current = recorder;
      setStage("recording");

      // The timer, which also stops the recording at the time limit.
      const startedAt = Date.now();
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        setSeconds(Math.min(elapsed, MAX_VOICE_SECONDS));
        if (elapsed >= MAX_VOICE_SECONDS && recorder.state === "recording") recorder.stop();
      }, 250);
    };

    startRecording();

    return () => {
      cancelled = true;
      clearInterval(timer);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Frees the recording's memory when it's replaced or the popup closes.
  useEffect(() => () => {
    if (recording) URL.revokeObjectURL(recording.url);
  }, [recording]);

  const handleStop = () => recorderRef.current?.stop();

  const handleSend = async () => {
    if (!recording?.blob.size) {
      setProblem("Nothing was recorded. Please try again.");
      return;
    }
    setSending(true);
    const sent = await onSend(recording);
    setSending(false);
    if (sent) onClose();
  };

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center"
      style={{ background: "rgba(0,0,0,0.65)", zIndex: 1300 }}
      onClick={sending || stage === "recording" ? undefined : onClose}
    >
      <div
        className="bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4 text-center"
        style={{ maxWidth: 380, width: "100%" }}
        onClick={(event) => event.stopPropagation()}
      >
        <h6 className="fw-bold mb-3"><i className="bi bi-mic-fill text-role me-2"></i>Voice message</h6>

        {stage === "starting" && <p className="text-secondary fs-7 mb-3">Starting the microphone...</p>}

        {stage === "recording" && (
          <div className="mb-3">
            <p className="fs-3 fw-bold mb-1 d-flex align-items-center justify-content-center gap-2">
              <span className="recording-dot"></span>{formatClock(seconds)}
            </p>
            <small className="text-secondary fs-8">Recording... it stops by itself at {formatClock(MAX_VOICE_SECONDS)}.</small>
          </div>
        )}

        {stage === "recorded" && recording && (
          <div className="mb-3">
            <audio src={recording.url} controls className="w-100"></audio>
            <small className="text-secondary fs-8 d-block mt-1">Listen back, then send it or discard it.</small>
          </div>
        )}

        {problem && <p className="text-danger fs-7 mb-3">{problem}</p>}

        <div className="d-flex gap-2 justify-content-center">
          {stage === "recording" ? (
            <button type="button" className="btn btn-danger rounded-pill px-4 py-2 fw-bold" onClick={handleStop}>
              <i className="bi bi-stop-fill me-1"></i> Stop
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={sending}>
                {stage === "recorded" ? "Discard" : "Close"}
              </button>
              {stage === "recorded" && (
                <button type="button" className="btn btn-gradient-role rounded-pill px-4 py-2 fw-bold text-white" onClick={handleSend} disabled={sending}>
                  {sending ? "Sending..." : "Send"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
