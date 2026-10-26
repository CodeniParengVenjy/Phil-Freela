import { useEffect, useState } from "react";
import GcashNumberInput from "../../../components/GcashNumberInput";
import { noAutofill } from "../../../lib/profile";
import {
  formatGcashNumber, getMyGcash, isValidAccountName, isValidGcashNumber, nameInitials, normalizeGcashNumber, removeMyGcash,
  saveMyGcash, tidyAccountName
} from "../../../lib/payments";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import "../payments.css";

// Settings > GCash Payment (freelancers only). The number and the name on the
// GCash account. The name stays private (only you can read it): a client who has a
// project with you, or who you ask for payment in a chat, sees only its initials and
// the number, so they can pay you in the GCash app; nobody else can see even that
// (database/supabase_gcash_initials_schema.sql). PhilFreela never handles the money.
export default function GcashSettingsForm({ userId, showToast }) {
  // undefined while loading, null when nothing is saved yet, else the saved row.
  const [saved, setSaved] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

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
    const problem = await saveMyGcash(userId, { number: normalized, name: tidyName });
    setSaving(false);
    if (problem) {
      setError(problem);
      return;
    }

    setSaved({ gcash_number: normalized, account_name: tidyName });
    setNumber(formatGcashNumber(normalized));
    setName(tidyName);
    showToast("GCash details saved.");
  };

  const handleRemoveAll = async () => {
    setRemoving(true);
    const problem = await removeMyGcash(userId);
    setRemoving(false);
    setConfirmRemove(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setSaved(null);
    setNumber("");
    setName("");
    showToast("Your GCash details were removed.");
  };

  if (loadError) return <p className="text-danger fs-7">{loadError}</p>;
  if (saved === undefined) return <p className="text-secondary fs-7">Loading your GCash details...</p>;

  // What other people will see instead of the name, as it is typed.
  const tidyName = tidyAccountName(name);
  const initials = isValidAccountName(tidyName) ? nameInitials(tidyName) : "";

  return (
    <>
      <p className="text-secondary fs-7 mb-4">
        A client who has a project with you, or who you ask for payment in a chat, sees your GCash number and only the
        initials of your name, so they can pay you in the GCash app. They are not shown on your public profile. PhilFreela
        never handles the money: you are paid straight into your GCash, and you confirm each payment yourself.
      </p>

      <form className="d-flex flex-column gap-4" onSubmit={handleSubmit} noValidate>
        <div>
          <label className="form-label text-white-50 fw-semibold fs-7" htmlFor="gcashNumber">GCash number:</label>
          <GcashNumberInput
            id="gcashNumber"
            autoComplete="off"
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2 pay-mono"
            placeholder="0917 123 4567"
            value={number}
            onChange={setNumber}
          />
          <small className="text-secondary fs-8">11 digits, starting with 09.</small>
        </div>

        <div>
          <label className="form-label text-white-50 fw-semibold fs-7" htmlFor="gcashName">Name on your GCash account:</label>
          <input
            id="gcashName"
            type="text"
            {...noAutofill("gc1")}
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
            placeholder="Ana R. Santos"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
          />
          <small className="text-secondary fs-8 d-block" data-initials-preview>
            {initials
              ? <>Others will see only the initials: <strong className="text-white">{initials}</strong></>
              : "Others will see only the initials of this name, never the name itself."}
          </small>
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
