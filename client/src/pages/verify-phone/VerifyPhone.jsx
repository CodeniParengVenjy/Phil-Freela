import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { checkPhoneLink, submitFromPhone } from "../../lib/aiService";
import VerificationWizard from "../dashboard/components/VerificationWizard";
import "../dashboard/dashboard.css";

// The page the QR code opens on the phone (/verify-phone/<token>). No login:
// the one-time token in the link is the key, and the AI service checks it
// (it expires after 10 minutes and works once). Nothing personal is shown,
// so a leaked link reveals nothing about whose it is.
export default function VerifyPhone() {
  const { token } = useParams();
  // "checking" -> "ready" (form) -> "done"; or "invalid" / "offline".
  const [stage, setStage] = useState("checking");

  useEffect(() => {
    let active = true;
    checkPhoneLink(token)
      .then(({ valid }) => active && setStage(valid ? "ready" : "invalid"))
      .catch(() => active && setStage("offline"));
    return () => {
      active = false;
    };
  }, [token]);

  const handleSubmit = async (photos) => {
    await submitFromPhone(token, photos);
    setStage("done");
  };

  return (
    <div className="min-vh-100 text-light py-4 px-3" style={{ background: "var(--bg-dark)", fontFamily: "var(--font-body)" }}>
      <div className="mx-auto" style={{ maxWidth: 480 }}>
        <div className="d-flex align-items-center gap-2 mb-4">
          <img src="/logo-philfreela.svg" alt="PhilFreela" style={{ height: 32 }} />
          <span className="fw-bold">Identity Verification</span>
        </div>

        <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
          {stage === "checking" && <p className="text-secondary fs-7 mb-0">Checking your link...</p>}

          {stage === "invalid" && (
            <div className="text-center">
              <i className="bi bi-clock-history fs-1 text-warning"></i>
              <p className="text-white fw-bold fs-5 mt-2 mb-1">This link expired</p>
              <p className="text-secondary fs-7 mb-0">
                QR links work once and only for 10 minutes. Make a new QR code on your computer and scan it again.
              </p>
            </div>
          )}

          {stage === "offline" && (
            <div className="text-center">
              <i className="bi bi-wifi-off fs-1 text-warning"></i>
              <p className="text-white fw-bold fs-5 mt-2 mb-1">Can't reach PhilFreela</p>
              <p className="text-secondary fs-7 mb-0">Make sure your phone is on the same Wi-Fi as the computer, then scan the QR code again.</p>
            </div>
          )}

          {stage === "ready" && <VerificationWizard mode="phone" token={token} onSubmit={handleSubmit} />}

          {stage === "done" && (
            <div className="text-center">
              <i className="bi bi-check-circle-fill fs-1 text-success"></i>
              <p className="text-white fw-bold fs-5 mt-2 mb-1">All done!</p>
              <p className="text-secondary fs-7 mb-0">Your photos were sent. You can go back to your computer, where it now says "Waiting for review".</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
