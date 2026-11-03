import { useState } from "react";
import { formatPeso } from "../../../lib/payments";
import { checkPrices, savePrice } from "../../../lib/promotions";

// One option of the price list: its price, and for Featured posts and ads the
// lower price a Premium member pays. Only a super admin can change them.
function PriceRow({ option, canEdit, onSaved, say }) {
  const hasProPrice = option.code !== "pro_30";
  const asText = (value) => (value === null || value === undefined ? "" : String(value));
  const [price, setPrice] = useState(asText(option.price));
  const [proPrice, setProPrice] = useState(asText(option.pro_price));
  const [saving, setSaving] = useState(false);
  const changed = price !== asText(option.price) || proPrice !== asText(option.pro_price);

  const handleSave = async () => {
    const checked = checkPrices({ price, proPrice }, hasProPrice);
    if (checked.error) {
      say(checked.error, "error");
      return;
    }
    setSaving(true);
    const result = await savePrice(option.code, checked);
    setSaving(false);
    if (result.error) {
      say(result.error, "error");
      return;
    }
    setPrice(asText(result.price.price));
    setProPrice(asText(result.price.pro_price));
    onSaved(result.price);
    say(`The price of "${option.label}" was saved.`);
  };

  return (
    <div className="row g-2 align-items-end py-2 border-top border-secondary border-opacity-25">
      <div className="col-12 col-md-4">
        <div className="text-white fw-semibold">{option.label}</div>
        <div className="text-white-50 fs-8">{option.days} days</div>
      </div>
      {canEdit ? (
        <>
          <div className="col-6 col-md-3">
            <label htmlFor={`price-${option.code}`} className="form-label text-white-50 fs-8 mb-1">Price (₱)</label>
            <input id={`price-${option.code}`} type="text" inputMode="decimal" className="form-control admin-input form-control-sm" value={price} onChange={(event) => setPrice(event.target.value)} disabled={saving} />
          </div>
          <div className="col-6 col-md-3">
            {hasProPrice ? (
              <>
                <label htmlFor={`proPrice-${option.code}`} className="form-label text-white-50 fs-8 mb-1">Premium member pays (₱)</label>
                <input id={`proPrice-${option.code}`} type="text" inputMode="decimal" className="form-control admin-input form-control-sm" value={proPrice} onChange={(event) => setProPrice(event.target.value)} disabled={saving} />
              </>
            ) : (
              <span className="text-white-50 fs-8">No lower price for Premium itself.</span>
            )}
          </div>
          <div className="col-12 col-md-2">
            <button type="button" className="btn btn-admin-orange btn-sm rounded-pill px-3 fw-bold" onClick={handleSave} disabled={saving || !changed}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </>
      ) : (
        <div className="col-12 col-md-8 text-white">
          {formatPeso(option.price)}
          {hasProPrice && option.pro_price != null && <span className="text-white-50 fs-7"> · a Premium member pays {formatPeso(option.pro_price)}</span>}
        </div>
      )}
    </div>
  );
}

// Admin > Promotions > Settings: the price list (what Featured posts, Community
// Billboard ads and Premium cost on Xendit). Everyone in the admin panel can read
// it; only a super admin can change it (the database enforces that too).
//
// Props:
//   isSuperAdmin
//   prices          the price list
//   onPriceSaved    (price) => void
export default function PromotionSettings({ isSuperAdmin, prices, onPriceSaved }) {
  const [message, setMessage] = useState({ text: "", type: "" });
  const say = (text, type = "success") => setMessage({ text, type });

  return (
    <div>
      {message.text && <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>}
      {!isSuperAdmin && (
        <p className="text-white-50 fs-7 mb-3"><i className="bi bi-lock me-1"></i> Only a super admin can change these.</p>
      )}

      <div className="admin-card rounded-4 p-3 p-md-4">
        <h2 className="h6 fw-bold text-white mb-1">Prices</h2>
        <p className="text-white-50 fs-8 mb-2">What each option costs on Xendit. A price change applies to new payments only.</p>
        {prices.map((option) => (
          <PriceRow key={option.code} option={option} canEdit={isSuperAdmin} onSaved={onPriceSaved} say={say} />
        ))}
      </div>
    </div>
  );
}
