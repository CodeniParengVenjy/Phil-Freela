import { useState } from "react";
import { MAX_NAME_LENGTH, checkName, cleanName, saveDisplayName } from "../../../lib/profile";

// Shown over every dashboard page to someone whose profile has no name (people
// who signed up before names were required, like @apol). It can't be closed:
// they type a name that follows the Name policy (lib/profile.js checkName),
// save it, and carry on. "Sign out" is the only other way out.
export default function MissingNameDialog({ userId, onSaved, onSignOut }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (saving) return;

    // Same rule as sign-up and Settings; the database checks it again.
    const problem = checkName(name);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError("");
    const saveProblem = await saveDisplayName(userId, name);
    setSaving(false);
    if (saveProblem) {
      setError(saveProblem);
      return;
    }
    onSaved(cleanName(name));
  };

  return (
    <div
      className="role-confirm-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="missingNameTitle"
      style={{
        position: "fixed", inset: 0, zIndex: 1400,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem",
        overflowY: "auto"
      }}
    >
      <form
        noValidate
        onSubmit={handleSubmit}
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 440, width: "100%" }}
      >
        <div className="role-confirm-icon bg-role-subtle text-role rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 56, height: 56 }}>
          <i className="bi bi-person-vcard fs-4"></i>
        </div>
        <h5 id="missingNameTitle" className="fw-bold text-center mb-2">Please add your name</h5>
        <p className="text-secondary fs-7 text-center mb-3">
          Your account doesn't have a name yet. Other people see it on your jobs, services and messages, so
          PhilFreela needs it before you carry on.
        </p>

        <label htmlFor="missingName" className="form-label text-white-50 fw-semibold fs-7 mb-1">Your name</label>
        <div className="input-group">
          <span className="input-group-text bg-secondary bg-opacity-25 border-secondary text-white-50"><i className="bi bi-person"></i></span>
          <input
            id="missingName"
            type="text"
            className={`form-control bg-secondary bg-opacity-25 text-white py-2 ${error ? "border-danger" : "border-secondary"}`}
            placeholder="e.g. Keanne Obias"
            maxLength={MAX_NAME_LENGTH}
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(event) => { setName(event.target.value); setError(""); }}
            aria-invalid={error ? "true" : "false"}
            aria-describedby="missingNameHelp"
          />
        </div>
        {error ? (
          <p id="missingNameHelp" className="text-danger fs-8 fw-semibold mt-2 mb-0" role="alert">{error}</p>
        ) : (
          <p id="missingNameHelp" className="text-secondary fs-8 mt-2 mb-0">
            Use your real name: 2 to {MAX_NAME_LENGTH} letters, no numbers, emoji or links.
          </p>
        )}

        <button type="submit" className="btn btn-gradient-role rounded-pill w-100 py-2 fw-bold text-white mt-3" disabled={saving}>
          {saving ? "Saving..." : "Save name"}
        </button>
        <div className="text-center mt-3">
          <button type="button" className="btn btn-link text-white-50 text-decoration-none fs-8 p-0" onClick={onSignOut} disabled={saving}>
            <i className="bi bi-box-arrow-right me-1"></i> Sign out
          </button>
        </div>
      </form>
    </div>
  );
}
