import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { changePassword, checkPasswordChange, getSignInInfo, signOutOtherDevices } from "../../../lib/accountSecurity";
import { fetchAdminProfile, saveAdminProfile } from "../../../lib/adminProfile";
import { MAX_NAME_LENGTH, MAX_USERNAME_LENGTH, NAME_COOLDOWN_DAYS, USERNAME_COOLDOWN_DAYS, cooldownEnds } from "../../../lib/profile";
import { formatEndDate } from "../../../lib/suspensions";

const emptyPasswords = { current: "", next: "", confirm: "" };

// The admin's own page: who they are, name and username (with waiting times),
// password, and signing out their other devices.
export default function AdminProfileView() {
  const { adminId, isSuperAdmin, reloadAdmin } = useOutletContext();
  // null while loading, then the admin's row (see lib/adminProfile.js).
  const [profile, setProfile] = useState(null);
  // null while loading, then { email, hasPassword, lastSignIn }.
  const [info, setInfo] = useState(null);
  // What is typed in the two boxes; null = not edited, so the box shows the saved value.
  const [nameInput, setNameInput] = useState(null);
  const [usernameInput, setUsernameInput] = useState(null);
  const [profileMessage, setProfileMessage] = useState({ text: "", type: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwords, setPasswords] = useState(emptyPasswords);
  const [showPasswords, setShowPasswords] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState({ text: "", type: "" });
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    fetchAdminProfile(adminId).then((row) => active && setProfile(row));
    getSignInInfo().then((found) => active && setInfo(found));
    return () => { active = false; };
  }, [adminId]);

  if (!profile || !info) {
    return <p className="text-white-50 fs-7">Loading...</p>;
  }

  const shownName = nameInput ?? profile.full_name;
  const shownUsername = usernameInput ?? profile.username;
  const nameLockedUntil = cooldownEnds(profile.name_changed_at, NAME_COOLDOWN_DAYS);
  const usernameLockedUntil = cooldownEnds(profile.username_changed_at, USERNAME_COOLDOWN_DAYS);
  const nothingToSave = shownName.trim() === profile.full_name && shownUsername.trim() === profile.username;

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    if (savingProfile || nothingToSave) return;

    setSavingProfile(true);
    const problem = await saveAdminProfile(shownName, shownUsername);
    if (problem) {
      setSavingProfile(false);
      setProfileMessage({ text: problem, type: "error" });
      return;
    }
    // Read the new dates back (a change starts a new waiting time) and tell
    // the top bar about the new name.
    setProfile(await fetchAdminProfile(adminId));
    setNameInput(null);
    setUsernameInput(null);
    setSavingProfile(false);
    setProfileMessage({ text: "Profile saved.", type: "success" });
    reloadAdmin();
  };

  const updatePassword = (field) => (event) => setPasswords((prev) => ({ ...prev, [field]: event.target.value }));

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (savingPassword) return;
    const problem = checkPasswordChange(passwords.current, passwords.next, passwords.confirm);
    if (problem) {
      setPasswordMessage({ text: problem, type: "error" });
      return;
    }

    setSavingPassword(true);
    setPasswordMessage({ text: "", type: "" });
    const failed = await changePassword(info.email, passwords.current, passwords.next);
    setSavingPassword(false);
    if (failed) {
      setPasswordMessage({ text: failed, type: "error" });
      return;
    }
    // Emptied, so the passwords don't stay on the screen.
    setPasswords(emptyPasswords);
    setShowPasswords(false);
    setPasswordMessage({ text: "Password changed. Your other devices were signed out.", type: "success" });
  };

  const handleSignOutOthers = async () => {
    setSigningOut(true);
    const failed = await signOutOtherDevices();
    setSigningOut(false);
    setPasswordMessage(failed ? { text: failed, type: "error" } : { text: "Your other devices were signed out.", type: "success" });
  };

  const passwordType = showPasswords ? "text" : "password";

  return (
    <section>
      <h1 className="h4 fw-bold mb-3">My Profile</h1>

      <div className="row g-3">
        <div className="col-12 col-xl-6">
          <div className="admin-card rounded-4 p-4 h-100">
            <h2 className="h6 fw-bold text-white mb-3">About you</h2>
            <dl className="row fs-7 mb-3">
              <dt className="col-sm-4 text-white-50 fw-semibold">Email</dt>
              <dd className="col-sm-8 text-white text-break">{info.email || "None"}</dd>
              <dt className="col-sm-4 text-white-50 fw-semibold">Role</dt>
              <dd className="col-sm-8 text-white">
                <span className={`badge ${isSuperAdmin ? "admin-badge-orange" : "bg-secondary"} fw-normal`}>{isSuperAdmin ? "Super admin" : "Admin"}</span>
              </dd>
              <dt className="col-sm-4 text-white-50 fw-semibold">Last sign-in</dt>
              <dd className="col-sm-8 text-white mb-0">{info.lastSignIn ? new Date(info.lastSignIn).toLocaleString() : "Unknown"}</dd>
            </dl>

            <form className="d-flex flex-column gap-3" noValidate onSubmit={handleSaveProfile}>
              <div>
                <label htmlFor="profileName" className="form-label text-white-50 fw-semibold fs-7 mb-1">Name</label>
                <input
                  id="profileName"
                  type="text"
                  className="form-control admin-input"
                  value={shownName}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={MAX_NAME_LENGTH}
                  disabled={Boolean(nameLockedUntil) || savingProfile}
                />
                <small className={`fs-8 ${nameLockedUntil ? "text-warning" : "text-white-50"}`}>
                  {nameLockedUntil
                    ? `You can change your name again on ${formatEndDate(nameLockedUntil)}.`
                    : `You can change your name once every ${NAME_COOLDOWN_DAYS} days.`}
                </small>
              </div>
              <div>
                <label htmlFor="profileUsername" className="form-label text-white-50 fw-semibold fs-7 mb-1">Username</label>
                <input
                  id="profileUsername"
                  type="text"
                  className="form-control admin-input"
                  value={shownUsername}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  maxLength={MAX_USERNAME_LENGTH}
                  disabled={Boolean(usernameLockedUntil) || savingProfile}
                />
                <small className={`fs-8 ${usernameLockedUntil ? "text-warning" : "text-white-50"}`}>
                  {usernameLockedUntil
                    ? `You can change your username again on ${formatEndDate(usernameLockedUntil)}.`
                    : `You can change your username once every ${USERNAME_COOLDOWN_DAYS} days.`}
                </small>
              </div>
              {profileMessage.text && (
                <p className={`admin-message ${profileMessage.type} fs-7 fw-semibold mb-0`} aria-live="polite">{profileMessage.text}</p>
              )}
              <div>
                <button type="submit" className="btn btn-warning btn-sm rounded-pill px-4 fw-bold" disabled={savingProfile || nothingToSave}>
                  {savingProfile ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="col-12 col-xl-6">
          <div className="admin-card rounded-4 p-4 h-100">
            <h2 className="h6 fw-bold text-white mb-1">Change password</h2>
            <form className="d-flex flex-column gap-3 mb-4" noValidate onSubmit={handleChangePassword}>
              <p className="text-white-50 fs-8 mb-0">At least 8 characters, with an uppercase letter, a lowercase letter and a number.</p>
              <div>
                <label htmlFor="adminCurrentPassword" className="form-label text-white-50 fw-semibold fs-7 mb-1">Current password</label>
                <input id="adminCurrentPassword" type={passwordType} className="form-control admin-input" autoComplete="current-password" value={passwords.current} onChange={updatePassword("current")} disabled={savingPassword} />
              </div>
              <div>
                <label htmlFor="adminNewPassword" className="form-label text-white-50 fw-semibold fs-7 mb-1">New password</label>
                <input id="adminNewPassword" type={passwordType} className="form-control admin-input" autoComplete="new-password" value={passwords.next} onChange={updatePassword("next")} disabled={savingPassword} />
              </div>
              <div>
                <label htmlFor="adminConfirmPassword" className="form-label text-white-50 fw-semibold fs-7 mb-1">Type the new password again</label>
                <input id="adminConfirmPassword" type={passwordType} className="form-control admin-input" autoComplete="new-password" value={passwords.confirm} onChange={updatePassword("confirm")} disabled={savingPassword} />
              </div>
              <div className="form-check">
                <input id="adminShowPasswords" type="checkbox" className="form-check-input" checked={showPasswords} onChange={(e) => setShowPasswords(e.target.checked)} />
                <label htmlFor="adminShowPasswords" className="form-check-label text-white-50 fs-7">Show passwords</label>
              </div>
              {passwordMessage.text && (
                <p className={`admin-message ${passwordMessage.type} fs-7 fw-semibold mb-0`} aria-live="polite">{passwordMessage.text}</p>
              )}
              <div>
                <button type="submit" className="btn btn-warning btn-sm rounded-pill px-4 fw-bold" disabled={savingPassword}>
                  {savingPassword ? "Changing..." : "Change Password"}
                </button>
              </div>
            </form>

            <hr className="border-secondary border-opacity-25" />
            <h2 className="h6 fw-bold text-white mb-1">Other devices</h2>
            <p className="text-white-50 fs-8 mb-3">
              Signs your account out of every other phone, computer and browser, and keeps you signed in here. Use it if you
              signed in on a shared computer and forgot to sign out.
            </p>
            <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={handleSignOutOthers} disabled={signingOut}>
              <i className="bi bi-box-arrow-right me-1"></i>{signingOut ? "Signing out..." : "Sign out of my other devices"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
