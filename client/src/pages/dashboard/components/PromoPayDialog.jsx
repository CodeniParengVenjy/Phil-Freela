import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CensoredText from "../../../components/CensoredText";
import { formatPeso } from "../../../lib/payments";
import { onlinePaymentsReady, startFeatureCheckout } from "../../../lib/checkout";
import { FEATURE_CODES, formatFeatureDate, getIsPro, getPromoPrices, getSlotsLeft } from "../../../lib/featured";
import { Loader, Busy } from "../../../components/Loaders";

// "Feature this post" (PLAN-monetization.md, Step 4, and PLAN-premium.md): the
// owner of an offer or an open job post pays for 3, 7 or 14 days in the
// Featured row. "Pay online" opens Xendit's page (GCash, Maya or QR Ph); the post
// is Featured as soon as Xendit confirms the payment, and Xendit sends the person
// back to this page. When the server can't take online payments, the window only
// says so (the old way of paying PhilFreela's own GCash by hand was removed).
// The parent mounts it only while it is open, so every opening starts empty.
//   target: { kind: "service" | "job", id, title }
//   until:  the end date (ISO text) when the post is already Featured, else empty.
//           Paying again adds the days after it and needs no new spot.
export default function PromoPayDialog({ target, userId, until, onClose }) {
  // undefined while loading, { error } when something could not be loaded,
  // else { prices, isPro, slots, online }.
  const [info, setInfo] = useState(undefined);
  const [code, setCode] = useState("feature_7");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [priceResult, online, isPro, slots] = await Promise.all([
        getPromoPrices(FEATURE_CODES),
        onlinePaymentsReady(),
        getIsPro(userId),
        getSlotsLeft(target.kind)
      ]);
      if (!active) return;
      if (priceResult.error) {
        setInfo({ error: priceResult.error });
        return;
      }
      setInfo({ prices: priceResult.prices, isPro, slots, online });
    })();
    return () => {
      active = false;
    };
  }, [userId, target.kind]);

  // Escape closes the window, unless it is sending.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sending, onClose]);

  // What a Premium member pays is lower; the database works the price out again itself.
  const priceOf = (option) => (info?.isPro && option.pro_price != null ? option.pro_price : option.price);
  const chosen = info?.prices?.find((option) => option.code === code);
  const amount = chosen ? priceOf(chosen) : null;

  // Xendit's own page. It sends the person back to this page when they are done.
  const payOnline = async () => {
    setSending(true);
    setError("");
    const result = await startFeatureCheckout(code, target);
    if (result.url) {
      window.location.assign(result.url);
      return;
    }
    setSending(false);
    setError(result.error);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (sending) return;
    payOnline();
  };

  // Why the form is not shown (null = show it).
  let blocked = null;
  if (info?.error) blocked = info.error;
  else if (info && !info.online) blocked = "Payments for Featured posts are not open yet. Please try again later.";
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

        {info === undefined && <Loader size="sm" className="mb-3" />}

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
            {info.isPro && <p className="text-success fs-8 mb-3"><i className="bi bi-gem me-1"></i>Premium price.</p>}

            <span className="form-label text-white-50 fw-semibold fs-7 d-block">2. Pay online</span>
            <div className="p-3 rounded-3 bg-black bg-opacity-25 border border-secondary border-opacity-25 mb-3">
              <p className="mb-2 fs-7">
                You pay <strong className="text-warning fs-6">{formatPeso(amount)}</strong> on Xendit's secure page with GCash, Maya or QR Ph.
              </p>
              <p className="text-secondary fs-8 mb-0">
                Your post is Featured as soon as the payment goes through: no receipt and no waiting for an admin.
                PhilFreela never sees your payment details.
              </p>
            </div>
            {error && <p className="text-danger fs-7 mb-0" role="alert">{error}</p>}
            <div className="d-flex gap-2 justify-content-end mt-3">
              <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={sending || amount === null}>
                {sending ? <Busy kind="go">Opening Xendit</Busy> : <><i className="bi bi-lock-fill me-1"></i>{`Pay ${formatPeso(amount)} online`}</>}
              </button>
            </div>
          </>
        )}
      </form>
    </div>,
    document.body
  );
}
