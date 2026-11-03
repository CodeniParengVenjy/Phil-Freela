import { useState } from "react";
import GcashNumberInput from "../../../components/GcashNumberInput";
import {
  formatGcashNumber, formatPeso, isValidAccountName, isValidGcashNumber, normalizeGcashNumber, tidyAccountName
} from "../../../lib/payments";
import { checkPrices, savePrice, saveSiteGcash } from "../../../lib/promotions";

// One option of the price list: its price, and for Featured posts the lower
// price a Pro member pays. Only a super admin can change them.
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
                <label htmlFor={`proPrice-${option.code}`} className="form-label text-white-50 fs-8 mb-1">Pro member pays (₱)</label>
                <input id={`proPrice-${option.code}`} type="text" inputMode="decimal" className="form-control admin-input form-control-sm" value={proPrice} onChange={(event) => setProPrice(event.target.value)} disabled={saving} />
              </>
            ) : (
              <span className="text-white-50 fs-8">No lower price for Pro itself.</span>
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
          {hasProPrice && option.pro_price != null && <span className="text-white-50 fs-7"> · a Pro member pays {formatPeso(option.pro_price)}</span>}
        </div>
      )}
    </div>
  );
}

// Admin > Promotions > Settings: PhilFreela's own GCash number and name
// (what people see when they pay a fee by GCash) and the price list. Everyone in
// the admin panel can read them; only a super admin can change them (the database
// enforces that too).
//
// Props:
//   isSuperAdmin
//   gcash           { gcash_number, account_name } or null (not set yet)
//   prices          the price list
//   onGcashSaved    (gcash) => void
//   onPriceSaved    (price) => void
export default function PromotionSettings({ isSuperAdmin, gcash, prices, onGcashSaved, onPriceSaved }) {
  const [message, setMessage] = useState({ text: "", type: "" });
  const say = (text, type = "success") => setMessage({ text, type });

  const [number, setNumber] = useState(gcash ? formatGcashNumber(gcash.gcash_number) : "");
  const [name, setName] = useState(gcash?.account_name || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async (event) => {
    event.preventDefault();
    const normalized = normalizeGcashNumber(number);
    const tidy = tidyAccountName(name);
    if (!isValidGcashNumber(normalized)) {
      say("The GCash number is 09 and 9 more digits, like 0917 123 4567.", "error");
      return;
    }
    if (!isValidAccountName(tidy)) {
      say("The name on the account can have letters, spaces, dots, hyphens and apostrophes (2 to 60 characters).", "error");
      return;
    }

    setSaving(true);
    const result = await saveSiteGcash({ number: normalized, name: tidy });
    setSaving(false);
    if (result.error) {
      say(result.error, "error");
      return;
    }
    onGcashSaved(result.gcash);
    setNumber(formatGcashNumber(result.gcash.gcash_number));
    setName(result.gcash.account_name);
    say("PhilFreela's GCash details were saved. People who pay a fee will see them.");
  };

  return (
    <div>
      {message.text && <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>}
      {!isSuperAdmin && (
        <p className="text-white-50 fs-7 mb-3"><i className="bi bi-lock me-1"></i> Only a super admin can change these.</p>
      )}

      <div className="admin-card rounded-4 p-3 p-md-4 mb-4">
        <h2 className="h6 fw-bold text-white mb-1">PhilFreela's GCash</h2>
        <p className="text-white-50 fs-8 mb-3">Where people send the fee. They see this number and the name on the pay screen, then send you the reference and a receipt.</p>

        {isSuperAdmin ? (
          <form noValidate onSubmit={handleSave}>
            <div className="row g-3">
              <div className="col-12 col-md-5">
                <label htmlFor="siteGcashNumber" className="form-label text-white-50 fs-7 mb-1">GCash Number</label>
                <GcashNumberInput id="siteGcashNumber" className="form-control admin-input" placeholder="0917 123 4567" value={number} onChange={setNumber} disabled={saving} />
              </div>
              <div className="col-12 col-md-7">
                <label htmlFor="siteGcashName" className="form-label text-white-50 fs-7 mb-1">Name on the Account</label>
                <input id="siteGcashName" type="text" className="form-control admin-input" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} disabled={saving} />
              </div>
            </div>
            <button type="submit" className="btn btn-admin-orange rounded-pill px-4 fw-bold mt-3" disabled={saving}>
              <i className="bi bi-save me-1"></i> {saving ? "Saving..." : "Save GCash Details"}
            </button>
          </form>
        ) : gcash ? (
          <div>
            <div className="text-white fw-semibold fs-5">{formatGcashNumber(gcash.gcash_number)}</div>
            <div className="text-white-50">{gcash.account_name}</div>
          </div>
        ) : (
          <p className="text-white-50 mb-0">Not set yet.</p>
        )}
      </div>

      <div className="admin-card rounded-4 p-3 p-md-4">
        <h2 className="h6 fw-bold text-white mb-1">Prices</h2>
        <p className="text-white-50 fs-8 mb-2">What each option costs. A price change applies to new requests only; a request already sent keeps the price it was sent with.</p>
        {prices.map((option) => (
          <PriceRow key={option.code} option={option} canEdit={isSuperAdmin} onSaved={onPriceSaved} say={say} />
        ))}
      </div>
    </div>
  );
}
