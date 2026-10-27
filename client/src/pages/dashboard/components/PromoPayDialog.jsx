import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CensoredText from "../../../components/CensoredText";
import { checkReceiptFile, formatGcashNumber, formatPeso, isValidReference, normalizeReference } from "../../../lib/payments";
import { FEATURE_CODES, formatFeatureDate, getIsPro, getPromoPrices, getSlotsLeft, sendPromoRequest } from "../../../lib/featured";
import { getSiteGcash, getSiteQrLink } from "../../../lib/promotions";
import "../payments.css";

// "Feature this post" (PLAN-monetization.md, Step 4): the owner of an offer or
// an open job post pays for 3, 7 or 14 days in the Featured row. The person
// sees PhilFreela's own GCash and the exact amount, pays in the GCash app (the
// site is not part of that), then sends the 13-digit reference and the receipt
// screenshot. An admin checks PhilFreela's GCash by hand and approves.
// (Freelancer Pro is paid online instead: ProPlans, "Paying for Pro online".)
// The parent mounts it only while it is open, so every opening starts empty.
//   target: { kind: "service" | "job", id, title }
//   until:  the end date (ISO text) when the post is already Featured, else empty.
//           Paying again adds the days after it and needs no new spot.
//   onSent(): called after the request was saved.
export default function PromoPayDialog({ target, userId, until, onClose, onSent }) {
  // undefined while loading, { error } when something could not be loaded,
  // else { prices, gcash, qr, isPro, slots }.
  const [info, setInfo] = useState(undefined);
  const [code, setCode] = useState("feature_7");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const [priceResult, gcashResult, isPro, slots] = await Promise.all([
        getPromoPrices(FEATURE_CODES),
        getSiteGcash(),
        getIsPro(userId),
        getSlotsLeft(target.kind)
      ]);
      if (!active) return;
      if (priceResult.error || gcashResult.error) {
        setInfo({ error: priceResult.error || gcashResult.error });
        return;
      }
      const qr = gcashResult.gcash?.qr_path ? await getSiteQrLink(gcashResult.gcash.qr_path) : null;
      if (active) setInfo({ prices: priceResult.prices, gcash: gcashResult.gcash, qr, isPro, slots });
    })();
    return () => {
      active = false;
    };
  }, [userId, target.kind]);

  // Frees the temporary preview when it is replaced or the window closes.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // Escape closes the window, unless it is sending.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sending, onClose]);

  // What a Pro member pays is lower; the database works the price out again when it saves the request.
  const priceOf = (option) => (info?.isPro && option.pro_price != null ? option.pro_price : option.price);
  const chosen = info?.prices?.find((option) => option.code === code);
  const amount = chosen ? priceOf(chosen) : null;

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(info.gcash.gcash_number);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy the number. Please type it in your GCash app.");
    }
  };

  const handlePick = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = ""; // so picking the same file again still works
    if (!picked) return;
    const problem = checkReceiptFile(picked);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending) return;
    const cleanReference = normalizeReference(reference);
    if (!isValidReference(cleanReference)) {
      setError("The GCash reference number is 13 digits. You can copy it from your GCash receipt.");
      return;
    }
    if (!file) {
      setError("Attach your receipt screenshot to continue.");
      return;
    }

    setSending(true);
    setError("");
    const result = await sendPromoRequest({
      userId,
      code,
      target: target.kind === "service" ? { serviceId: target.id } : { jobId: target.id },
      reference: cleanReference,
      receiptFile: file
    });
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSent();
  };

  // Why the form is not shown (null = show it).
  let blocked = null;
  if (info?.error) blocked = info.error;
  else if (info && !info.gcash) blocked = "Payments for Featured posts are not open yet. Please try again later.";
  else if (info && info.slots === 0 && !until) blocked = "All 3 Featured spots are taken right now. Try again when one ends.";

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={sending ? undefined : onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-dialog-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 480, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <h5 id="promo-dialog-title" className="fw-bold mb-1">
          <i className="bi bi-star-fill text-warning me-2"></i>{until ? "Extend your Featured post" : "Feature this post"}
        </h5>
        <p className="text-secondary fs-7 mb-3 text-break"><CensoredText text={target.title} /></p>

        {info === undefined && <p className="text-secondary fs-7 mb-3">Loading...</p>}

        {blocked && (
          <>
            <p className="text-warning fs-7 mb-3" role="alert">{blocked}</p>
            <div className="d-flex justify-content-end">
              <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose}>Close</button>
            </div>
          </>
        )}

        {info && !blocked && (
          <>
            <p className="text-white-50 fs-7 mb-3">
              A Featured post sits in its own row at the top of {target.kind === "service" ? "Browse Services" : "Find Jobs"}, marked as a paid placement.
              {until && <> It is Featured until <strong className="text-white">{formatFeatureDate(until)}</strong>; the days you pay for now are added after that.</>}
            </p>

            <span className="form-label text-white-50 fw-semibold fs-7 d-block">1. Choose how long</span>
            <div className="d-flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label="How long">
              {info.prices.map((option) => {
                const selected = option.code === code;
                const discounted = info.isPro && option.pro_price != null;
                return (
                  <button
                    key={option.code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`btn flex-grow-1 rounded-3 fw-bold py-2 fs-7 d-flex flex-column ${selected ? "btn-gradient-role text-white" : "btn-outline-secondary text-white-50"}`}
                    onClick={() => setCode(option.code)}
                    disabled={sending}
                  >
                    <span>{option.days} days</span>
                    <span className="fs-8">
                      {formatPeso(priceOf(option))}
                      {discounted && <s className="ms-1 opacity-75">{formatPeso(option.price)}</s>}
                    </span>
                  </button>
                );
              })}
            </div>
            {info.isPro && <p className="text-success fs-8 mb-3"><i className="bi bi-patch-check-fill me-1"></i>Pro price.</p>}

            <span className="form-label text-white-50 fw-semibold fs-7 d-block">2. Pay in your GCash app</span>
            <div className="p-3 rounded-3 bg-black bg-opacity-25 border border-secondary border-opacity-25 mb-3">
              <p className="mb-2 fs-7">Send exactly <strong className="text-warning fs-6">{formatPeso(amount)}</strong> to PhilFreela:</p>
              <p className="mb-1 text-break fw-semibold">{info.gcash.account_name}</p>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <span className="pay-mono fs-5">{formatGcashNumber(info.gcash.gcash_number)}</span>
                <button type="button" className="btn btn-outline-light btn-sm rounded-pill" onClick={copyNumber}>
                  <i className={`bi ${copied ? "bi-check2" : "bi-clipboard"} me-1`}></i>{copied ? "Copied" : "Copy"}
                </button>
              </div>
              {info.qr && <img src={info.qr} alt="PhilFreela's GCash QR code" className="d-block mt-3 rounded-3 bg-white p-1" style={{ maxWidth: 180, width: "100%" }} />}
              <p className="text-secondary fs-8 mb-0 mt-2">This is PhilFreela's own GCash. It is the only one that gets Featured fees.</p>
            </div>

            <span className="form-label text-white-50 fw-semibold fs-7 d-block">3. Send us your receipt</span>
            <label htmlFor="featureReference" className="form-label text-white-50 fw-semibold fs-8 mb-1">GCash reference no.</label>
            <input
              id="featureReference"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white pay-mono mb-1"
              placeholder="4021 358 091742"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              maxLength={20}
              disabled={sending}
            />
            <small className="text-secondary fs-8 d-block mb-3">13 digits, shown on your GCash receipt.</small>

            <span className="form-label text-white-50 fw-semibold fs-8 d-block">Receipt screenshot (required)</span>
            <div className="d-flex align-items-center gap-3 mb-1">
              {preview && <img src={preview} alt="Your receipt screenshot" className="pay-receipt-thumb" />}
              <div className="d-flex flex-column gap-1">
                <input type="file" ref={fileInputRef} accept="image/jpeg,image/png,image/webp" className="d-none" onChange={handlePick} />
                <div>
                  <button type="button" className="btn btn-secondary rounded-pill px-4 py-2 text-white fw-bold fs-7" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                    {file ? "Change screenshot" : "Add screenshot"}
                  </button>
                </div>
                {file && <small className="text-white-50 fs-8 text-break">{file.name}</small>}
              </div>
            </div>
            <small className="text-secondary fs-8 d-block mb-2">JPG, PNG or WebP, 5 MB at most. Only you and the PhilFreela admins can open it.</small>
            {!file && <p className="text-warning fs-8 mb-2">Attach your receipt screenshot to continue.</p>}

            <p className="text-secondary fs-8 mb-0">An admin checks PhilFreela's GCash by hand, then your post goes live. You'll get a notification either way.</p>

            {error && <p className="text-danger fs-7 mt-3 mb-0" role="alert">{error}</p>}

            <div className="d-flex gap-2 justify-content-end mt-3">
              <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={sending || !file}>
                {sending ? "Sending..." : "Send payment"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body
  );
}
