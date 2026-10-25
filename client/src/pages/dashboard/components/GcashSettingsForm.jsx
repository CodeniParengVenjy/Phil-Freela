import { useEffect, useRef, useState } from "react";
import {
  checkQrFile, formatGcashNumber, getMyGcash, getQrLink, isValidAccountName, isValidGcashNumber, normalizeGcashNumber,
  removeMyGcash, removeQrFile, saveMyGcash, tidyAccountName, uploadQr
} from "../../../lib/payments";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import "../payments.css";

// Settings > GCash Payment (freelancers only). The number, the name on the GCash
// account and an optional QR picture. Clients who have a project with this
// freelancer see them on the project's page so they can pay in the GCash app;
// nobody else can (database/supabase_payments_schema.sql). PhilFreela never
// handles the money.
export default function GcashSettingsForm({ userId, showToast }) {
  // undefined while loading, null when nothing is saved yet, else the saved row.
  const [saved, setSaved] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  // A QR picked but not saved yet, its temporary preview link, and "Remove" pressed.
  const [qrFile, setQrFile] = useState(null);
  const [qrPreview, setQrPreview] = useState(null);
  const [qrRemoved, setQrRemoved] = useState(false);
  // The link that shows the saved QR, kept with the file it is for:
  // { path, link }, where link is null when it couldn't be made.
  const [qrLink, setQrLink] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let active = true;
    getMyGcash(userId).then(({ data, error: problem }) => {
      if (!active) return;
      if (problem) {
        setLoadError(problem);
        return;
      }
      setSaved(data);
      setNumber(data ? formatGcashNumber(data.gcash_number) : "");
      setName(data?.account_name || "");
    });
    return () => {
      active = false;
    };
  }, [userId]);

  // The saved QR is private, so it is shown through a link that expires.
  const savedQrPath = saved?.qr_path;
  useEffect(() => {
    if (!savedQrPath) return undefined;
    let active = true;
    getQrLink(savedQrPath).then((link) => {
      if (active) setQrLink({ path: savedQrPath, link });
    });
    return () => {
      active = false;
    };
  }, [savedQrPath]);
  const savedQrLink = savedQrPath && qrLink?.path === savedQrPath ? qrLink.link : null;

  // Frees the temporary preview when it is replaced or the form closes.
  useEffect(() => () => {
    if (qrPreview) URL.revokeObjectURL(qrPreview);
  }, [qrPreview]);

  const handlePick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // so picking the same file again still works
    if (!file) return;
    const problem = checkQrFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setQrFile(file);
    setQrPreview(URL.createObjectURL(file));
    setQrRemoved(false);
  };

  const handleRemoveQr = () => {
    setQrFile(null);
    setQrPreview(null);
    setQrRemoved(true);
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving || saved === undefined) return;

    const normalized = normalizeGcashNumber(number);
    const tidyName = tidyAccountName(name);
    if (!isValidGcashNumber(normalized)) {
      setError("Enter your 11-digit GCash number, like 0917 123 4567.");
      return;
    }
    if (!isValidAccountName(tidyName)) {
      setError("Enter the name on your GCash account: letters, spaces, dots and hyphens only.");
      return;
    }

    setSaving(true);
    setError("");

    // A new QR is uploaded first; if the details can't be saved after that, the
    // upload is removed again so no unused file is left behind.
    let newPath = null;
    if (qrFile) {
      const upload = await uploadQr(userId, qrFile);
      if (upload.error) {
        setSaving(false);
        setError(upload.error);
        return;
      }
      newPath = upload.path;
    }
    const qrPath = qrFile ? newPath : qrRemoved ? null : saved?.qr_path || null;

    const problem = await saveMyGcash(userId, { number: normalized, name: tidyName, qrPath });
    if (problem) {
      if (newPath) await removeQrFile(newPath);
      setSaving(false);
      setError(problem);
      return;
    }
    // The old picture isn't needed any more.
    if (saved?.qr_path && saved.qr_path !== qrPath) await removeQrFile(saved.qr_path);

    setSaved({ gcash_number: normalized, account_name: tidyName, qr_path: qrPath });
    setNumber(formatGcashNumber(normalized));
    setName(tidyName);
    setQrFile(null);
    setQrPreview(null);
    setQrRemoved(false);
    setSaving(false);
    showToast("GCash details saved.");
  };

  const handleRemoveAll = async () => {
    setRemoving(true);
    const problem = await removeMyGcash(userId);
    if (!problem && saved?.qr_path) await removeQrFile(saved.qr_path);
    setRemoving(false);
    setConfirmRemove(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setSaved(null);
    setNumber("");
    setName("");
    setQrFile(null);
    setQrPreview(null);
    setQrRemoved(false);
    showToast("Your GCash details were removed.");
  };

  if (loadError) return <p className="text-danger fs-7">{loadError}</p>;
  if (saved === undefined) return <p className="text-secondary fs-7">Loading your GCash details...</p>;

  // What the QR box shows: the picked picture, else the saved one (unless it was removed).
  const shownQr = qrPreview || (qrRemoved ? null : savedQrLink);
  const hasQr = Boolean(qrFile || (!qrRemoved && saved?.qr_path));

  return (
    <>
      <p className="text-secondary fs-7 mb-4">
        Clients who have a project with you see these details, so they can pay you in the GCash app. They are not shown on
        your public profile. PhilFreela never handles the money: you are paid straight into your GCash, and you confirm each
        payment yourself.
      </p>

      <form className="d-flex flex-column gap-4" onSubmit={handleSubmit} noValidate>
        <div>
          <label className="form-label text-white-50 fw-semibold fs-7" htmlFor="gcashNumber">GCash number:</label>
          <input
            id="gcashNumber"
            type="text"
            inputMode="tel"
            autoComplete="off"
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2 pay-mono"
            placeholder="0917 123 4567"
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            maxLength={20}
          />
          <small className="text-secondary fs-8">11 digits, starting with 09.</small>
        </div>

        <div>
          <label className="form-label text-white-50 fw-semibold fs-7" htmlFor="gcashName">Name on your GCash account:</label>
          <input
            id="gcashName"
            type="text"
            autoComplete="off"
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
            placeholder="Ana R. Santos"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
          />
          <small className="text-secondary fs-8">Clients compare it with the name GCash shows before they send.</small>
        </div>

        <div>
          <span className="form-label text-white-50 fw-semibold fs-7 d-block">GCash QR (optional):</span>
          <div className="d-flex flex-wrap align-items-center gap-3">
            {shownQr ? (
              <div className="pay-qr-tile"><img src={shownQr} alt="Your GCash QR" /></div>
            ) : (
              <div className="pay-qr-empty text-secondary fs-8">
                {hasQr ? "Loading your QR..." : "No QR yet"}
              </div>
            )}
            <div className="d-flex flex-column gap-2">
              <input type="file" ref={fileInputRef} accept="image/jpeg,image/png,image/webp" className="d-none" onChange={handlePick} />
              <div className="d-flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary rounded-pill px-4 py-2 text-white fw-bold fs-7" onClick={() => fileInputRef.current?.click()} disabled={saving}>
                  {hasQr ? "Replace QR" : "Upload QR"}
                </button>
                {hasQr && (
                  <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-3 py-2 fs-7" onClick={handleRemoveQr} disabled={saving}>
                    Remove
                  </button>
                )}
              </div>
              <small className="text-secondary fs-8" style={{ maxWidth: 320 }}>
                Save your QR from your GCash app and upload the picture. JPG, PNG or WebP, 2 MB at most. PhilFreela only shows
                the picture; it doesn't read it.
              </small>
              {(qrFile || qrRemoved) && <small className="text-warning fs-8">Save Changes to keep this.</small>}
            </div>
          </div>
        </div>

        {error && <p className="text-danger fs-7 mb-0" role="alert">{error}</p>}

        <div className="d-flex flex-wrap align-items-center gap-3">
          <button type="submit" className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white shadow-glow-role" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
          {saved && (
            <button type="button" className="btn btn-link text-danger text-decoration-none fs-7 p-0" onClick={() => setConfirmRemove(true)} disabled={saving}>
              Remove my GCash details
            </button>
          )}
        </div>
      </form>

      <DeleteConfirmDialog
        open={confirmRemove}
        title="Remove your GCash details?"
        message="Clients won't see where to pay you until you add them again. Payments already recorded stay as they are."
        busy={removing}
        confirmLabel="Remove"
        busyLabel="Removing..."
        cancelLabel="Keep them"
        onConfirm={handleRemoveAll}
        onCancel={() => setConfirmRemove(false)}
      />
    </>
  );
}
