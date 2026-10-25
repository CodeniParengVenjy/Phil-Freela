import { useEffect, useRef, useState } from "react";
import {
  checkQrFile, formatGcashNumber, formatPeso, isValidAccountName, isValidGcashNumber, normalizeGcashNumber, tidyAccountName
} from "../../../lib/payments";
import { checkPrices, getSiteQrLink, removeSiteQr, savePrice, saveSiteGcash, uploadSiteQr } from "../../../lib/promotions";

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

// Admin > Promotions > Settings: PhilFreela's own GCash number, name and QR
// (what people see when they pay a fee) and the price list. Everyone in the
// admin panel can read them; only a super admin can change them (the database
// enforces that too).
//
// Props:
//   isSuperAdmin, adminId
//   gcash           { gcash_number, account_name, qr_path } or null (not set yet)
//   prices          the price list
//   onGcashSaved    (gcash) => void
//   onPriceSaved    (price) => void
export default function PromotionSettings({ isSuperAdmin, adminId, gcash, prices, onGcashSaved, onPriceSaved }) {
  const [message, setMessage] = useState({ text: "", type: "" });
  const say = (text, type = "success") => setMessage({ text, type });

  const [number, setNumber] = useState(gcash ? formatGcashNumber(gcash.gcash_number) : "");
  const [name, setName] = useState(gcash?.account_name || "");
  // A newly picked QR picture, a temporary link to preview it, and "take the saved one away".
  const [qrFile, setQrFile] = useState(null);
  const [qrPreview, setQrPreview] = useState(null);
  const [removeQr, setRemoveQr] = useState(false);
  const [savedQrLink, setSavedQrLink] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const savedQrPath = gcash?.qr_path || null;

  // The saved QR is in a private folder, so it is shown through a link that expires.
  useEffect(() => {
    let active = true;
    getSiteQrLink(savedQrPath).then((link) => {
      if (active) setSavedQrLink(link);
    });
    return () => { active = false; };
  }, [savedQrPath]);

  // Frees the preview's memory whenever it's replaced or the page closes.
  useEffect(() => () => {
    if (qrPreview) URL.revokeObjectURL(qrPreview);
  }, [qrPreview]);

  const handlePick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // lets the same file be picked again later
    if (!file) return;
    const problem = checkQrFile(file);
    if (problem) {
      say(problem, "error");
      return;
    }
    setMessage({ text: "", type: "" });
    setQrFile(file);
    setQrPreview(URL.createObjectURL(file));
    setRemoveQr(false);
  };

  const handleRemovePicture = () => {
    setQrFile(null);
    setQrPreview(null);
    setRemoveQr(true);
  };

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
    let nextPath = savedQrPath;
    let uploadedPath = null;
    if (qrFile) {
      const uploaded = await uploadSiteQr(adminId, qrFile);
      if (uploaded.error) {
        setSaving(false);
        say(uploaded.error, "error");
        return;
      }
      uploadedPath = uploaded.path;
      nextPath = uploaded.path;
    } else if (removeQr) {
      nextPath = null;
    }

    const result = await saveSiteGcash({ number: normalized, name: tidy, qrPath: nextPath });
    if (result.error) {
      if (uploadedPath) removeSiteQr(uploadedPath); // don't leave an unused file behind
      setSaving(false);
      say(result.error, "error");
      return;
    }
    if (savedQrPath && nextPath !== savedQrPath) removeSiteQr(savedQrPath);
    setSaving(false);
    onGcashSaved(result.gcash);
    setNumber(formatGcashNumber(result.gcash.gcash_number));
    setName(result.gcash.account_name);
    setQrFile(null);
    setQrPreview(null);
    setRemoveQr(false);
    say("PhilFreela's GCash details were saved. People who pay a fee will see them.");
  };

  const shownQr = qrPreview || (removeQr ? null : savedQrLink);

  return (
    <div>
      {message.text && <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>}
      {!isSuperAdmin && (
        <p className="text-white-50 fs-7 mb-3"><i className="bi bi-lock me-1"></i> Only a super admin can change these.</p>
      )}

      <div className="admin-card rounded-4 p-3 p-md-4 mb-4">
        <h2 className="h6 fw-bold text-white mb-1">PhilFreela's GCash</h2>
        <p className="text-white-50 fs-8 mb-3">Where people send the fee. They see this number, the name and the QR on the pay screen, then send you the reference and a receipt.</p>

        {isSuperAdmin ? (
          <form noValidate onSubmit={handleSave}>
            <div className="row g-3">
              <div className="col-12 col-md-5">
                <label htmlFor="siteGcashNumber" className="form-label text-white-50 fs-7 mb-1">GCash Number</label>
                <input id="siteGcashNumber" type="text" inputMode="tel" className="form-control admin-input" placeholder="0917 123 4567" value={number} onChange={(event) => setNumber(event.target.value)} disabled={saving} />
              </div>
              <div className="col-12 col-md-7">
                <label htmlFor="siteGcashName" className="form-label text-white-50 fs-7 mb-1">Name on the Account</label>
                <input id="siteGcashName" type="text" className="form-control admin-input" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} disabled={saving} />
              </div>
              <div className="col-12">
                <span className="form-label d-block text-white-50 fs-7 mb-1">QR Picture (optional)</span>
                <input ref={fileInputRef} type="file" className="d-none" accept="image/jpeg,image/png,image/webp" onChange={handlePick} aria-label="GCash QR picture" />
                {shownQr && <img src={shownQr} alt="PhilFreela's GCash QR" className="d-block mb-2 rounded-3 bg-white" style={{ maxWidth: 220, maxHeight: 220, objectFit: "contain" }} />}
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                    <i className="bi bi-qr-code me-1"></i> {shownQr ? "Change picture" : "Choose a picture"}
                  </button>
                  {shownQr && (
                    <button type="button" className="btn btn-outline-danger btn-sm rounded-pill px-3" onClick={handleRemovePicture} disabled={saving}>
                      <i className="bi bi-x-lg me-1"></i> Remove
                    </button>
                  )}
                  <span className="text-white-50 fs-8">JPG, PNG or WebP, up to 2 MB.</span>
                </div>
              </div>
            </div>
            <button type="submit" className="btn btn-admin-orange rounded-pill px-4 fw-bold mt-3" disabled={saving}>
              <i className="bi bi-save me-1"></i> {saving ? "Saving..." : "Save GCash Details"}
            </button>
          </form>
        ) : gcash ? (
          <div className="d-flex flex-wrap align-items-start gap-3">
            {savedQrLink && <img src={savedQrLink} alt="PhilFreela's GCash QR" className="rounded-3 bg-white" style={{ maxWidth: 160, maxHeight: 160, objectFit: "contain" }} />}
            <div>
              <div className="text-white fw-semibold fs-5">{formatGcashNumber(gcash.gcash_number)}</div>
              <div className="text-white-50">{gcash.account_name}</div>
            </div>
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
