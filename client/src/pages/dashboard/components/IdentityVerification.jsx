import { useCallback, useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { submitVerification } from "../../../lib/aiService";
import { fetchLatestVerification, isPhone } from "../../../lib/verification";
import PhoneQrPanel from "./PhoneQrPanel";
import VerificationWizard from "./VerificationWizard";

const LOAD_ERROR = "Couldn't load your verification status. Please refresh the page.";

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// The Verify Identity page's content. Shows the user's latest verification
// status, or the step-by-step form (VerificationWizard):
//   - on a phone: using the phone's cameras,
//   - on a computer with a webcam: webcam or upload for the ID, webcam for the face scan,
//   - on a computer without one (or "Use my phone instead"): a QR code to continue on a phone.
// The AI results are only shown to admins, so nobody can keep retrying photos
// until they fool the face check.
export default function IdentityVerification() {
  const { currentUserId, showToast } = useOutletContext();

  // undefined = still loading, null = never submitted, otherwise the latest attempt.
  const [latest, setLatest] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  // null while checking, then true/false. Browsers without camera support
  // at all are known to have no webcam right away.
  const [hasWebcam, setHasWebcam] = useState(() => (navigator.mediaDevices?.enumerateDevices ? null : false));
  const [onPhone] = useState(isPhone);
  const [usePhone, setUsePhone] = useState(false);
  const [tryingAgain, setTryingAgain] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    fetchLatestVerification(currentUserId).then(({ data, error }) => {
      if (!active) return;
      if (error) setLoadError(LOAD_ERROR);
      else setLatest(data);
    });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  // Checks whether this computer has any camera at all (no permission needed).
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => setHasWebcam(devices.some((device) => device.kind === "videoinput")))
      .catch(() => setHasWebcam(false));
  }, []);

  // After photos are sent from anywhere: show the new "Waiting for review".
  const showSubmitted = useCallback((verification) => {
    showToast("Photos submitted! An admin will review your verification.");
    setTryingAgain(false);
    setUsePhone(false);
    setLatest(verification);
  }, [showToast]);

  // Sends everything as the logged-in user and loads the new status.
  // Throws a readable error if it fails, so the form can show it.
  const sendAsLoggedInUser = async (photos) => {
    await submitVerification(photos);
    const { data, error } = await fetchLatestVerification(currentUserId);
    if (error) throw new Error(LOAD_ERROR);
    showSubmitted(data);
  };

  if (loadError) return <p className="text-warning fs-7 mb-0">{loadError}</p>;
  if (latest === undefined || (hasWebcam === null && !onPhone)) return <p className="text-secondary fs-7 mb-0">Loading...</p>;

  if (latest?.status === "approved") {
    return (
      <div className="bg-success bg-opacity-10 border border-success border-opacity-50 rounded-3 p-4">
        <p className="text-success fw-bold fs-5 mb-1"><i className="bi bi-patch-check-fill me-2"></i>You're verified</p>
        <p className="text-light-50 fs-7 mb-0">
          Your identity was confirmed{latest.reviewed_at ? ` on ${formatDate(latest.reviewed_at)}` : ""}. Your profile now shows the Verified badge.
        </p>
      </div>
    );
  }

  if (latest?.status === "pending") {
    return (
      <div className="bg-warning bg-opacity-10 border border-warning border-opacity-50 rounded-3 p-4">
        <p className="text-warning fw-bold fs-5 mb-1"><i className="bi bi-hourglass-split me-2"></i>Waiting for review</p>
        <p className="text-light-50 fs-7 mb-0">
          You submitted your photos on {formatDate(latest.created_at)}. An admin will check them soon.
        </p>
      </div>
    );
  }

  if (latest?.status === "rejected" && !tryingAgain) {
    return (
      <div className="bg-danger bg-opacity-10 border border-danger border-opacity-50 rounded-3 p-4">
        <p className="text-danger fw-bold fs-5 mb-1"><i className="bi bi-x-circle-fill me-2"></i>Verification not approved</p>
        {latest.admin_note && <p className="text-light-50 fs-7 mb-1"><span className="fw-bold text-white">Reason:</span> {latest.admin_note}</p>}
        <p className="text-light-50 fs-7 mb-3">You can send new photos.</p>
        <button type="button" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white" onClick={() => setTryingAgain(true)}>
          Try again
        </button>
      </div>
    );
  }

  // Already on a phone: use its cameras directly, no QR code needed.
  if (onPhone) return <VerificationWizard mode="phone" onSubmit={sendAsLoggedInUser} />;

  if (hasWebcam === false || usePhone) {
    return (
      <PhoneQrPanel
        userId={currentUserId}
        onDone={showSubmitted}
        onUseWebcam={hasWebcam ? () => setUsePhone(false) : undefined}
      />
    );
  }

  return <VerificationWizard mode="computer" onSubmit={sendAsLoggedInUser} onUsePhone={() => setUsePhone(true)} />;
}
