import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ProBadge from "../../../components/ProBadge";
import { FEATURE_CODES, formatFeatureDate, getPromoPrices } from "../../../lib/featured";
import { FREE_OFFERS, PRO_CODE, PRO_OFFERS, confirmProCheckout, countMyOffers, startProCheckout, useProStatus } from "../../../lib/pro";

// Settings > Freelancer Pro (PLAN-monetization.md, Step 5), freelancers only:
// where the person stands (Free or Pro until a date, how many offers they have),
// what Pro gives, and the one button that buys it. Pro is paid online
// ("Paying for Pro online (Xendit)"): Go Pro goes to Xendit's own payment page
// (GCash, Maya or QR Ph), and Xendit sends the person back here with
// ?checkout=<id>; this tab then asks whether the payment went through. Paying
// again before Pro ends adds the days after the current end.
const peso = (amount) => `₱${Number(amount).toLocaleString()}`;

// How long to keep asking after coming back: a payment can take a few seconds
// to be confirmed by Xendit.
const CHECKS = 6;
const CHECK_EVERY_MS = 2500;

// What to say after coming back from Xendit's page.
const RESULTS = {
  checking: { className: "border-secondary", icon: "spinner", text: "Checking your payment with Xendit..." },
  paid: { className: "border-success", icon: "bi-check-circle-fill text-success", text: "Payment received. Thank you! You are now a Freelancer Pro." },
  open: { className: "border-warning", icon: "bi-hourglass-split text-warning", text: "We haven't received the payment yet. If you paid, it can take a minute." },
  expired: { className: "border-warning", icon: "bi-clock-history text-warning", text: "That payment page expired before it was paid. Nothing was charged. You can try again." },
  canceled: { className: "border-secondary", icon: "bi-x-circle text-secondary", text: "You left the payment page. Nothing was charged." }
};

export default function ProSettings({ userId }) {
  const pro = useProStatus(userId);
  const reloadPro = pro.reload;
  // The price list by code, and how many offers there are now (null while loading or if it failed).
  const [prices, setPrices] = useState(null);
  const [offers, setOffers] = useState(null);
  // Going to Xendit's page: true while it is being opened; a sentence if it couldn't be.
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");

  // Back from Xendit's page: /dashboard/settings?tab=Freelancer Pro&checkout=<id>
  // (and &canceled=1 when they left without paying).
  const [searchParams] = useSearchParams();
  const checkoutId = searchParams.get("checkout");
  const canceled = searchParams.get("canceled") === "1";
  // The answer about that payment (null while asking), and a counter that asks again.
  const [answer, setAnswer] = useState(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    let active = true;
    getPromoPrices([...FEATURE_CODES, PRO_CODE]).then((result) => {
      if (active && result.prices) setPrices(Object.fromEntries(result.prices.map((row) => [row.code, row])));
    });
    countMyOffers(userId).then((count) => {
      if (active) setOffers(count);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!checkoutId || canceled) return undefined;
    let active = true;
    (async () => {
      // Ask a few times: Xendit may need a few seconds to confirm a payment.
      for (let check = 0; check < CHECKS; check++) {
        const result = await confirmProCheckout(checkoutId);
        if (!active) return;
        if (result.error) {
          setAnswer({ state: "error", text: result.error });
          return;
        }
        if (result.status !== "open") {
          setAnswer({ state: result.status });
          if (result.status === "paid") reloadPro();
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, CHECK_EVERY_MS));
        if (!active) return;
      }
      setAnswer({ state: "open" });
    })();
    return () => {
      active = false;
    };
  }, [checkoutId, canceled, round, reloadPro]);

  const checkAgain = () => {
    setAnswer(null);
    setRound((value) => value + 1);
  };

  const goPro = async () => {
    setOpening(true);
    setOpenError("");
    const result = await startProCheckout();
    if (result.error) {
      setOpening(false);
      setOpenError(result.error);
      return;
    }
    // Xendit's own page. It sends the person back here when they are done.
    window.location.assign(result.url);
  };

  // What happened on Xendit's page (nothing to say if they didn't come from there).
  let shown = null;
  if (checkoutId) shown = canceled ? { state: "canceled" } : answer ?? { state: "checking" };
  const result = shown && (shown.state === "error" ? { className: "border-danger", icon: "bi-exclamation-circle-fill text-danger", text: shown.text } : RESULTS[shown.state]);

  const limit = pro.until ? PRO_OFFERS : FREE_OFFERS;
  let offersText = "";
  if (pro.loaded && offers !== null) {
    offersText = offers > limit
      ? `You have ${offers} offers. A free account can add up to ${FREE_OFFERS}, so you can't add another until you have fewer, or go Pro. The ones you have stay.`
      : `${offers} of ${limit} offers used.`;
  }
  // "3 days ₱25 (₱49), 7 days ₱50 (₱99), 14 days ₱90 (₱179)": what a Pro member pays, with the normal price after it.
  const featuredPrices = FEATURE_CODES.map((code) => prices?.[code]).filter(Boolean);
  const proPrice = prices?.[PRO_CODE];

  return (
    <div className="d-flex flex-column gap-4">
      {result && (
        <div className={`p-3 rounded-3 border ${result.className} d-flex flex-wrap align-items-center gap-2`} role="status">
          {result.icon === "spinner"
            ? <span className="spinner-border spinner-border-sm text-secondary" aria-hidden="true"></span>
            : <i className={`bi ${result.icon}`}></i>}
          <span className="text-white fs-7 flex-grow-1">{result.text}</span>
          {(shown.state === "open" || shown.state === "error") && (
            <button type="button" className="btn btn-sm btn-outline-secondary text-white-50 rounded-pill px-3 fs-8 fw-bold" onClick={checkAgain}>
              Check again
            </button>
          )}
        </div>
      )}

      <div className="p-3 rounded-3 bg-black bg-opacity-25 border border-secondary border-opacity-25">
        <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
          {pro.until ? (
            <span className="badge bg-warning text-dark fs-8 text-wrap text-start">
              <i className="bi bi-gem me-1"></i>Pro until {formatFeatureDate(pro.until)}
            </span>
          ) : (
            <span className="badge bg-secondary fs-8">Free account</span>
          )}
          {pro.waiting && (
            <span className="badge bg-info text-dark fs-8">
              <i className="bi bi-hourglass-split me-1"></i>Waiting for review
            </span>
          )}
        </div>
        {offersText && <p className="text-white-50 fs-7 mb-0">{offersText}</p>}
      </div>

      <div>
        <h6 className="text-white fw-bold mb-2">What Pro gives you</h6>
        <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
          <li className="d-flex gap-2">
            <i className="bi bi-collection-fill text-role mt-1"></i>
            <span className="text-white-50 fs-7"><strong className="text-white">Up to {PRO_OFFERS} offers</strong> instead of {FREE_OFFERS}.</span>
          </li>
          <li className="d-flex gap-2">
            <i className="bi bi-gem text-warning mt-1"></i>
            <span className="text-white-50 fs-7">A gold <ProBadge pro /> badge by your name on Browse Services, your offers and your profile.</span>
          </li>
          <li className="d-flex gap-2">
            <i className="bi bi-star-fill text-warning mt-1"></i>
            <span className="text-white-50 fs-7">
              <strong className="text-white">Half-price Featured posts.</strong>
              {featuredPrices.length > 0 && (
                <> {featuredPrices.map((row) => `${row.days} days ${peso(row.pro_price ?? row.price)} (${peso(row.price)})`).join(", ")}.</>
              )}
            </span>
          </li>
        </ul>
      </div>

      <div>
        <div className="d-flex flex-wrap align-items-center gap-3 mb-2">
          {!pro.waiting && (
            <button type="button" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" onClick={goPro} disabled={!pro.loaded || opening}>
              {opening
                ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Opening the payment page...</>
                : <><i className="bi bi-gem me-2"></i>{pro.until ? "Extend Pro" : "Go Pro"}</>}
            </button>
          )}
          {proPrice && <span className="text-white fw-bold">{peso(proPrice.price)} <span className="text-white-50 fw-normal fs-7">for {proPrice.days} days</span></span>}
        </div>
        {openError && <p className="text-danger fs-7 mb-2" role="alert">{openError}</p>}
        <small className="text-secondary fs-8 d-block">
          You pay on Xendit's secure page with GCash, Maya or QR Ph; PhilFreela never sees your payment details.
          Pay again before Pro ends and the days are added after it. What your clients pay you still goes straight to you.
        </small>
      </div>
    </div>
  );
}
