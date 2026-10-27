import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FEATURE_CODES, formatFeatureDate, getPromoPrices } from "../../../lib/featured";
import { FREE_OFFERS, PRO_CODE, PRO_OFFERS, confirmProCheckout, countMyOffers, startProCheckout, useProStatus } from "../../../lib/pro";
import "../pro.css";

// The Freelancer Pro page (views/ProView.jsx, in the freelancer's menu;
// PLAN-monetization.md, Step 5), freelancers only: two plan cards side by side, Free and Pro, each with what it gives (a tick, or
// a grey cross for what it doesn't), its price and one button; above them,
// where the person stands (Free, or Pro until a date, and how many offers they
// have). Pro is paid online ("Paying for Pro online (Xendit)"): Go Pro goes to
// Xendit's own payment page (GCash, Maya or QR Ph), and Xendit sends the person
// back here with ?checkout=<id>; this page then asks whether the payment went
// through. Paying again before Pro ends adds the days after the current end.
// onPaid() lets the dashboard know, so the Pro badge by the name shows at once.
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

// One line of a plan card: a tick for what the plan gives, a grey cross for what it doesn't.
function Feature({ included, children }) {
  return (
    <li className={included ? "" : "text-secondary"}>
      <i className={`bi ${included ? "bi-check-circle-fill text-role" : "bi-x-circle text-secondary"}`} aria-hidden="true"></i>
      <span className={included ? "text-white fs-7" : "fs-7"}>
        <span className="visually-hidden">{included ? "Included: " : "Not included: "}</span>
        {children}
      </span>
    </li>
  );
}

export default function ProPlans({ userId, onPaid }) {
  const pro = useProStatus(userId);
  const reloadPro = pro.reload;
  // The price list by code, and how many offers there are now (null while loading or if it failed).
  const [prices, setPrices] = useState(null);
  const [offers, setOffers] = useState(null);
  // Going to Xendit's page: true while it is being opened; a sentence if it couldn't be.
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState("");

  // Back from Xendit's page: /dashboard/pro?checkout=<id>
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
          if (result.status === "paid") {
            reloadPro();
            onPaid?.();
          }
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
  }, [checkoutId, canceled, round, reloadPro, onPaid]);

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

  const isPro = Boolean(pro.until);
  const limit = isPro ? PRO_OFFERS : FREE_OFFERS;
  let offersText = "";
  if (pro.loaded && offers !== null) {
    offersText = offers > limit
      ? `You have ${offers} offers. A free account can add up to ${FREE_OFFERS}, so you can't add another until you have fewer, or go Pro. The ones you have stay.`
      : `${offers} of ${limit} offers used.`;
  }
  // The Featured prices for 3, 7 and 14 days: the normal ones on Free, the Pro ones on Pro.
  const featuredRows = FEATURE_CODES.map((code) => prices?.[code]).filter(Boolean);
  const normalFeatured = featuredRows.map((row) => peso(row.price)).join(" / ");
  const proFeatured = featuredRows.map((row) => peso(row.pro_price ?? row.price)).join(" / ");
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

      {/* Where the person stands now. */}
      <div className="d-flex flex-wrap align-items-center gap-2">
        {isPro ? (
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
        {offersText && <span className="text-white-50 fs-7">{offersText}</span>}
      </div>

      {/* The two plans side by side (one under the other on a phone). */}
      <div className="row g-4 pt-2">
        <div className="col-md-6">
          <div className="pro-plan-card h-100 d-flex flex-column">
            <h6 className="text-white fw-bold mb-3">Free</h6>
            <div className="d-flex align-items-baseline gap-2">
              <span className="pro-plan-price text-white">₱0</span>
              <span className="text-white-50 fs-7">forever</span>
            </div>
            <div className="pro-plan-rule"></div>
            <ul className="pro-plan-features list-unstyled mb-4 flex-grow-1">
              <Feature included>Up to {FREE_OFFERS} offers</Feature>
              <Feature included>Featured posts{normalFeatured ? `: ${normalFeatured}` : ""}</Feature>
              <Feature included>Verified badge, ratings and AI matching</Feature>
              <Feature included={false}>No Pro badge</Feature>
            </ul>
            {isPro ? (
              <p className="text-secondary fs-8 text-center mb-0">You go back to Free when Pro ends. Your offers stay.</p>
            ) : (
              <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill py-2 fw-bold w-100" disabled>
                Your current plan
              </button>
            )}
          </div>
        </div>

        <div className="col-md-6">
          <div className="pro-plan-card pro-plan-card-pro h-100 d-flex flex-column" data-tour="pro-plan">
            <span className="pro-plan-ribbon">{isPro ? "Your plan" : "Best value"}</span>
            <h6 className="text-white fw-bold mb-3"><i className="bi bi-gem text-role me-2"></i>Freelancer Pro</h6>
            <div className="d-flex align-items-baseline gap-2">
              <span className="pro-plan-price text-role">{proPrice ? peso(proPrice.price) : "Pro"}</span>
              {proPrice && <span className="text-white-50 fs-7">for {proPrice.days} days</span>}
            </div>
            <div className="pro-plan-rule"></div>
            <ul className="pro-plan-features list-unstyled mb-4 flex-grow-1">
              <Feature included><strong>Up to {PRO_OFFERS} offers</strong> instead of {FREE_OFFERS}</Feature>
              <Feature included>Half-price Featured posts{proFeatured ? `: ${proFeatured}` : ""}</Feature>
              <Feature included>A gold Pro badge by your name on Browse Services, your offers and your profile</Feature>
              <Feature included>Everything in Free</Feature>
            </ul>
            {pro.waiting ? (
              <p className="text-info fs-8 text-center mb-0"><i className="bi bi-hourglass-split me-1"></i>Waiting for review</p>
            ) : (
              <button type="button" className="btn btn-gradient-role text-white rounded-pill py-2 fw-bold w-100" onClick={goPro} disabled={!pro.loaded || opening}>
                {opening
                  ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Opening the payment page...</>
                  : <><i className="bi bi-gem me-2"></i>{isPro ? "Extend Pro" : "Go Pro"}</>}
              </button>
            )}
            {openError && <p className="text-danger fs-8 mt-2 mb-0 text-center" role="alert">{openError}</p>}
          </div>
        </div>
      </div>

      <small className="text-secondary fs-8 d-block">
        You pay on Xendit's secure page with GCash, Maya or QR Ph; PhilFreela never sees your payment details.
        Pay again before Pro ends and the days are added after it. What your clients pay you still goes straight to you.
        Featured prices are for 3, 7 or 14 days.
      </small>
    </div>
  );
}
