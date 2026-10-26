import { useEffect, useState } from "react";
import ProBadge from "../../../components/ProBadge";
import { FEATURE_CODES, formatFeatureDate, getPromoPrices } from "../../../lib/featured";
import { FREE_OFFERS, PRO_CODE, PRO_OFFERS, countMyOffers, useProStatus } from "../../../lib/pro";
import PromoPayDialog from "./PromoPayDialog";

// Settings > Freelancer Pro (PLAN-monetization.md, Step 5), freelancers only:
// where the person stands (Free or Pro until a date, how many offers they have),
// what Pro gives, and the one button that buys it. The payment itself is the
// shared pay window (PromoPayDialog): GCash to PhilFreela, the reference and a
// receipt, then an admin approves. Pro is for the account: people who pay again
// before it ends get the days added after the current end.
const peso = (amount) => `₱${Number(amount).toLocaleString()}`;

export default function ProSettings({ userId, showToast }) {
  const pro = useProStatus(userId);
  // The price list by code, and how many offers there are now (null while loading or if it failed).
  const [prices, setPrices] = useState(null);
  const [offers, setOffers] = useState(null);
  const [paying, setPaying] = useState(false);

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
            <button type="button" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" onClick={() => setPaying(true)} disabled={!pro.loaded}>
              <i className="bi bi-gem me-2"></i>{pro.until ? "Extend Pro" : "Go Pro"}
            </button>
          )}
          {proPrice && <span className="text-white fw-bold">{peso(proPrice.price)} <span className="text-white-50 fw-normal fs-7">for {proPrice.days} days</span></span>}
        </div>
        <small className="text-secondary fs-8 d-block">
          Pay again before it ends and the days are added after it.
          Pro is paid to PhilFreela's own GCash and checked by an admin; what your clients pay you still goes straight to you.
        </small>
      </div>

      {paying && (
        <PromoPayDialog
          target={{ kind: "pro" }}
          userId={userId}
          until={pro.until}
          onClose={() => setPaying(false)}
          onSent={() => {
            setPaying(false);
            pro.reload();
            showToast("Payment sent. An admin will check it, and you'll get a notification.");
          }}
        />
      )}
    </div>
  );
}
