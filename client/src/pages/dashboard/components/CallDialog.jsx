import { useEffect, useRef, useState } from "react";
import Avatar from "../../../components/Avatar";
import { acceptCall, hangUp, toggleCamera, toggleMute, useCall } from "../../../lib/calls";
import "./calls.css";

const STAGE_TEXT = { starting: "Starting...", calling: "Calling...", connecting: "Connecting..." };

// The voice / video call window, shown on every dashboard page (see
// DashboardOverlays). The call itself lives in lib/calls.js; this only draws
// it: the ringing pop-up, then the call window, which can be made smaller to
// keep using the site during the call.
export default function CallDialog() {
  const call = useCall();
  // The call key the window was made smaller for, so every new call opens big.
  const [smallKey, setSmallKey] = useState(null);

  useTone(call?.stage === "ringing" ? "incoming" : call?.stage === "calling" ? "outgoing" : null);

  if (!call) return null;
  if (call.stage === "ringing") return <IncomingCall call={call} />;

  const small = smallKey === call.key;
  return <CallWindow call={call} small={small} onToggleSize={() => setSmallKey(small ? null : call.key)} />;
}

function IncomingCall({ call }) {
  const { other, kind } = call;
  return (
    <div className="call-backdrop">
      <div className="call-incoming bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4 text-center" role="dialog" aria-label={`Incoming ${kind} call`}>
        <div className="call-pulse rounded-circle mx-auto mb-3">
          <Avatar path={other.avatarPath} name={other.name} size={96} />
        </div>
        <h5 className="fw-bold mb-1 text-truncate">{other.name}</h5>
        <p className="text-secondary fs-7 mb-4">Incoming {kind} call...</p>
        <div className="d-flex justify-content-center gap-5">
          <CallButton icon="bi-telephone-x-fill" label="Decline" color="red" onClick={() => hangUp()} />
          <CallButton icon={kind === "video" ? "bi-camera-video-fill" : "bi-telephone-fill"} label="Accept" color="green" onClick={acceptCall} />
        </div>
      </div>
    </div>
  );
}

function CallWindow({ call, small, onToggleSize }) {
  const { other, stage } = call;
  const isVideo = call.kind === "video";
  const live = stage === "active";

  return (
    <>
      {!small && <div className="call-backdrop" />}
      <div
        className={`call-window${small ? " call-window-small" : ""} bg-dark text-white border border-secondary border-opacity-25`}
        role="dialog"
        aria-label={`${isVideo ? "Video" : "Voice"} call with ${other.name}`}
      >
        <div className="d-flex align-items-center gap-2 px-3 py-2">
          <Avatar path={other.avatarPath} name={other.name} size={32} />
          <div className="flex-grow-1 overflow-hidden">
            <div className="fw-semibold fs-7 text-truncate">{other.name}</div>
            <div className={`fs-8 ${stage === "ended" ? "text-warning" : "text-secondary"}`}>
              {stage === "ended" ? call.message : live ? <CallTimer since={call.connectedAt} /> : STAGE_TEXT[stage]}
            </div>
          </div>
          {stage !== "ended" && (
            <button type="button" className="btn btn-sm text-white-50 border-0" title={small ? "Make bigger" : "Make smaller"} aria-label={small ? "Make bigger" : "Make smaller"} onClick={onToggleSize}>
              <i className={`bi ${small ? "bi-arrows-angle-expand" : "bi-arrows-angle-contract"}`}></i>
            </button>
          )}
        </div>

        <div className={`call-stage${isVideo ? "" : " call-stage-voice"}`}>
          {/* The other person: their video, or their voice alone. */}
          {call.remoteStream && (isVideo
            ? <StreamPlayer stream={call.remoteStream} className="call-remote-video" />
            : <StreamPlayer stream={call.remoteStream} audioOnly />)}

          {/* Their picture until the video starts, while their camera is off,
              and all through a voice call. It covers the video (which keeps
              playing their voice). */}
          {(!isVideo || !live || !call.remoteStream || call.remoteCameraOff) && (
            <div className="call-placeholder flex-column gap-2">
              <Avatar path={other.avatarPath} name={other.name} size={small ? 64 : 112} />
              {isVideo && live && call.remoteCameraOff && (
                <span className="fs-8 text-white-50"><i className="bi bi-camera-video-off-fill me-1"></i>Camera off</span>
              )}
            </div>
          )}

          {/* Your own camera, small in the corner (mirrored, like a mirror). */}
          {isVideo && call.localStream && !call.cameraOff && (
            <StreamPlayer stream={call.localStream} muted className="call-local-video" />
          )}
        </div>

        <div className="d-flex justify-content-center gap-3 p-3">
          {stage === "ended" ? (
            <button type="button" className="btn btn-outline-secondary text-white rounded-pill px-4" onClick={() => hangUp()}>Close</button>
          ) : (
            <>
              <CallButton
                icon={call.muted ? "bi-mic-mute-fill" : "bi-mic-fill"}
                label={call.muted ? "Unmute" : "Mute"}
                pressed={call.muted}
                disabled={!call.localStream}
                onClick={toggleMute}
              />
              {isVideo && (
                <CallButton
                  icon={call.cameraOff ? "bi-camera-video-off-fill" : "bi-camera-video-fill"}
                  label={call.cameraOff ? "Camera on" : "Camera off"}
                  pressed={call.cameraOff}
                  disabled={!call.localStream}
                  onClick={toggleCamera}
                />
              )}
              <CallButton icon="bi-telephone-x-fill" label={live ? "Hang up" : "Cancel"} color="red" onClick={() => hangUp()} />
            </>
          )}
        </div>
      </div>
    </>
  );
}

// A round call button with a small label under it.
function CallButton({ icon, label, color, pressed = false, disabled = false, onClick }) {
  return (
    <div className="d-flex flex-column align-items-center gap-1">
      <button
        type="button"
        className={`call-btn${color ? ` call-btn-${color}` : ""}${pressed ? " call-btn-pressed" : ""}`}
        aria-label={label}
        aria-pressed={color ? undefined : pressed}
        disabled={disabled}
        onClick={onClick}
      >
        <i className={`bi ${icon}`}></i>
      </button>
      <span className="call-btn-label">{label}</span>
    </div>
  );
}

// Plays a camera/microphone stream in a <video> (or <audio> for voice calls).
function StreamPlayer({ stream, audioOnly = false, muted = false, className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return audioOnly
    ? <audio ref={ref} autoPlay />
    : <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

// "3:12" since the call connected, counting up every second.
function CallTimer({ since }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

// The ring sound, made by the browser itself (no sound file): two short high
// beeps for an incoming call, a long low tone while your call rings on their
// side. Browsers stay silent if the page hasn't been clicked yet.
function useTone(tone) {
  useEffect(() => {
    if (!tone) return undefined;
    let context;
    try {
      context = new AudioContext();
    } catch {
      return undefined;
    }

    const beep = (start, length, frequency) => {
      const oscillator = context.createOscillator();
      const volume = context.createGain();
      oscillator.frequency.value = frequency;
      volume.gain.value = 0.08;
      oscillator.connect(volume).connect(context.destination);
      oscillator.start(context.currentTime + start);
      oscillator.stop(context.currentTime + start + length);
    };
    const play = () => {
      if (tone === "incoming") {
        beep(0, 0.35, 880);
        beep(0.45, 0.35, 880);
      } else {
        beep(0, 1.2, 440);
      }
    };

    play();
    const timer = setInterval(play, tone === "incoming" ? 2000 : 3500);
    return () => {
      clearInterval(timer);
      context.close();
    };
  }, [tone]);
}
