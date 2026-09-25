import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createPhoneLink } from "../../../lib/aiService";
import { PUBLIC_APP_URL, fetchLatestVerification } from "../../../lib/verification";

// How often the computer checks whether the phone has finished.
const CHECK_EVERY_MS = 3000;

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

// Shows a QR code the user scans with their phone to take the photos there.
// The link inside is a one-time key: it expires after 10 minutes and works
// once. Meanwhile this checks every few seconds whether the phone has sent
// the photos, and calls onDone with the new "pending" verification when it has.
// onUseWebcam is only given when the computer has a webcam to go back to.
export default function PhoneQrPanel({ userId, onDone, onUseWebcam }) {
  // { token, expires_at } once created.
  const [link, setLink] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  // Bumped by "Make a new QR code" to create a fresh link.
  const [attempt, setAttempt] = useState(0);
  // One link request per attempt. React may run the effect below twice (it
  // does in development); two requests would make two links, and since only
  // the newest link works, the QR code could end up showing a dead one.
  const linkRequests = useRef({});

  useEffect(() => {
    let active = true;
    if (!linkRequests.current[attempt]) linkRequests.current[attempt] = createPhoneLink();
    linkRequests.current[attempt]
      .then((created) => {
        if (!active) return;
        setError("");
        setLink(created);
        setNow(Date.now());
      })
      .catch((err) => active && setError(err.message));
    return () => {
      active = false;
    };
  }, [attempt]);

  const msLeft = link ? new Date(link.expires_at).getTime() - now : 0;
  const expired = Boolean(link) && msLeft <= 0;

  // Ticks the countdown once a second.
  useEffect(() => {
    if (!link || expired) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [link, expired]);

  // Checks whether the phone has finished. This panel only shows when there's
  // no pending verification, so a pending one means the phone just sent it.
  useEffect(() => {
    if (!link || expired) return undefined;
    const timer = setInterval(async () => {
      const { data } = await fetchLatestVerification(userId);
      if (data?.status === "pending") onDone(data);
    }, CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [link, expired, userId, onDone]);

  const makeNewLink = () => {
    setLink(null);
    setAttempt((n) => n + 1);
  };

  const phoneUrl = link ? `${PUBLIC_APP_URL}/verify-phone/${link.token}` : "";
  const usesLocalhost = /localhost|127\.0\.0\.1/.test(PUBLIC_APP_URL);

  return (
    <div className="bg-dark bg-opacity-50 p-4 rounded-3 border border-secondary border-opacity-25 text-center">
      <p className="text-white fw-bold fs-5 mb-1"><i className="bi bi-phone me-2 text-info"></i>Verify with your phone</p>
      <p className="text-secondary fs-7 mb-4">
        Scan this QR code with your phone's camera, then take the photos on your phone. This page will update by itself when you're done.
      </p>

      {error && (
        <>
          <p className="text-warning fs-7">{error}</p>
          <button type="button" className="btn btn-outline-role rounded-pill px-4 fw-bold" onClick={makeNewLink}>Try again</button>
        </>
      )}

      {!error && !link && <p className="text-secondary fs-7">Making your QR code...</p>}

      {link && !expired && (
        <>
          <div className="d-inline-block bg-white p-3 rounded-3 mb-3">
            <QRCodeSVG value={phoneUrl} size={200} />
          </div>
          <p className="text-light-50 fs-7 mb-1">
            <span className="spinner-grow spinner-grow-sm text-info me-2" aria-hidden="true"></span>
            Waiting for your phone... <span className="fw-bold text-white">{formatCountdown(msLeft)}</span> left
          </p>
          <p className="text-secondary fs-9 mb-0 text-break">
            Can't scan it? Open this link on your phone: <span className="text-info">{phoneUrl}</span>
          </p>
          {usesLocalhost && (
            <p className="text-warning fs-9 mt-2 mb-0">
              Note: phones can't open "localhost". Set VITE_PUBLIC_APP_URL in client/.env to this computer's Wi-Fi address.
            </p>
          )}
        </>
      )}

      {expired && (
        <>
          <p className="text-warning fs-7 mb-3">This QR code expired.</p>
          <button type="button" className="btn btn-gradient-role rounded-pill px-4 fw-bold text-white" onClick={makeNewLink}>
            Make a new QR code
          </button>
        </>
      )}

      {onUseWebcam && (
        <div className="mt-4">
          <button type="button" className="btn btn-link text-secondary fs-8 text-decoration-none hover-role" onClick={onUseWebcam}>
            <i className="bi bi-webcam me-1"></i> Use this computer's webcam instead
          </button>
        </div>
      )}
    </div>
  );
}
