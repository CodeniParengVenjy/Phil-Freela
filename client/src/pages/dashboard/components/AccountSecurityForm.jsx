import { useEffect, useState } from "react";
import { changePassword, checkPasswordChange, getSignInInfo, signOutOtherDevices } from "../../../lib/accountSecurity";

const emptyForm = { current: "", next: "", confirm: "" };

// Settings > Account Security: shows how the user signs in, lets them change
// their password (after typing the current one), and signs out their other
// devices. The work is done in lib/accountSecurity.js.
export default function AccountSecurityForm({ showToast }) {
  // null while loading, then { email, hasPassword, withGoogle, lastSignIn }.
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showPasswords, setShowPasswords] = useState(false);
  // The message under the form: { text, type: "error" | "success" }.
  const [message, setMessage] = useState({ text: "", type: "" });
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    getSignInInfo().then((found) => {
      if (active) setInfo(found);
    });
    return () => { active = false; };
  }, []);

  const updateField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (saving) return;
    const problem = checkPasswordChange(form.current, form.next, form.confirm);
    if (problem) {
      setMessage({ text: problem, type: "error" });
      return;
    }

    setSaving(true);
    setMessage({ text: "", type: "" });
    const failed = await changePassword(info.email, form.current, form.next);
    setSaving(false);
    if (failed) {
      setMessage({ text: failed, type: "error" });
      return;
    }
    // The boxes are emptied, so the passwords don't stay on the screen.
    setForm(emptyForm);
    setShowPasswords(false);
    setMessage({ text: "Password changed. Your other devices were signed out.", type: "success" });
    showToast("Password changed.");
  };

  const handleSignOutOthers = async () => {
    setSigningOut(true);
    const failed = await signOutOtherDevices();
    setSigningOut(false);
    showToast(failed || "Your other devices were signed out.");
  };

  if (info === null) return <p className="text-secondary fs-7">Loading...</p>;

  const methods = [info.hasPassword && "Email and password", info.withGoogle && "Google"].filter(Boolean).join(", ");
  const inputType = showPasswords ? "text" : "password";
  const inputClass = "form-control bg-secondary bg-opacity-25 border-secondary text-white py-2";

  return (
    <div className="d-flex flex-column gap-4">
      {/* How this account signs in. */}
      <div className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25">
        <h6 className="text-white fw-bold mb-3"><i className="bi bi-person-lock text-role me-2"></i>How you sign in</h6>
        <dl className="row fs-7 mb-0">
          <dt className="col-sm-4 text-white-50 fw-semibold">Email</dt>
          <dd className="col-sm-8 text-white text-break">{info.email || "None"}</dd>
          <dt className="col-sm-4 text-white-50 fw-semibold">Sign-in method</dt>
          <dd className="col-sm-8 text-white">{methods || "Unknown"}</dd>
          <dt className="col-sm-4 text-white-50 fw-semibold">Last sign-in</dt>
          <dd className="col-sm-8 text-white mb-0">{info.lastSignIn ? new Date(info.lastSignIn).toLocaleString() : "Unknown"}</dd>
        </dl>
      </div>

      {/* Change password: only for accounts that have one. */}
      <div>
        <h6 className="text-white fw-bold mb-1">Change password</h6>
        {info.hasPassword ? (
          <form className="d-flex flex-column gap-3" style={{ maxWidth: 420 }} noValidate onSubmit={handleChangePassword}>
            <p className="text-secondary fs-8 mb-0">
              At least 8 characters, with an uppercase letter, a lowercase letter and a number.
            </p>
            <div>
              <label htmlFor="currentPassword" className="form-label text-white-50 fw-semibold fs-7">Current password:</label>
              <input id="currentPassword" type={inputType} className={inputClass} autoComplete="current-password" value={form.current} onChange={updateField("current")} disabled={saving} />
            </div>
            <div>
              <label htmlFor="newPassword" className="form-label text-white-50 fw-semibold fs-7">New password:</label>
              <input id="newPassword" type={inputType} className={inputClass} autoComplete="new-password" value={form.next} onChange={updateField("next")} disabled={saving} />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="form-label text-white-50 fw-semibold fs-7">Type the new password again:</label>
              <input id="confirmPassword" type={inputType} className={inputClass} autoComplete="new-password" value={form.confirm} onChange={updateField("confirm")} disabled={saving} />
            </div>
            <div className="form-check">
              <input id="showPasswords" type="checkbox" className="form-check-input" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />
              <label htmlFor="showPasswords" className="form-check-label text-white-50 fs-7">Show passwords</label>
            </div>
            {message.text && (
              <p className={`fs-7 fw-semibold mb-0 ${message.type === "error" ? "text-danger" : "text-success"}`} role="status">{message.text}</p>
            )}
            <div>
              <button type="submit" className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white" disabled={saving}>
                {saving ? "Changing..." : "Change Password"}
              </button>
            </div>
            <small className="text-secondary fs-8">
              Forgot your current password? Sign out and use "Forgot password" on the sign-in page.
            </small>
          </form>
        ) : (
          <p className="text-secondary fs-7 mb-0">
            You sign in with Google, so there is no PhilFreela password to change. Your Google account keeps your sign-in safe.
          </p>
        )}
      </div>

      {/* Other devices. */}
      <div>
        <hr className="border-secondary border-opacity-25 mt-0 mb-4" />
        <h6 className="text-white fw-bold mb-1">Other devices</h6>
        <p className="text-secondary fs-8 mb-3">
          Signs your account out of every other phone, computer and browser, and keeps you signed in here. Use it if you
          signed in on a shared computer and forgot to sign out. A page that is already open there can keep working for up
          to an hour before it asks to sign in again.
        </p>
        <button type="button" className="btn btn-outline-role rounded-pill px-4 py-2 fw-bold" onClick={handleSignOutOthers} disabled={signingOut}>
          {signingOut ? "Signing out..." : <><i className="bi bi-box-arrow-right me-2"></i>Sign out of my other devices</>}
        </button>
      </div>
    </div>
  );
}
