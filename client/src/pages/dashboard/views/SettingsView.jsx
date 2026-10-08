import { useEffect, useRef, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { EMAIL_KINDS, MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, MAX_USERNAME_LENGTH, NAME_COOLDOWN_DAYS, USERNAME_COOLDOWN_DAYS, cooldownEnds, fetchAvailableForWork, fetchDescription, fetchEmailMuted, fetchEmailWhenOffline, fetchNameChangeDates, saveAvailableForWork, saveDescription, saveDisplayName, saveEmailMuted, saveEmailWhenOffline, saveUsername } from "../../../lib/profile";
import { formatEndDate } from "../../../lib/suspensions";
import { checkAvatarFile, uploadAvatar } from "../../../lib/avatar";
import { deleteMyAccount, downloadAsFile, exportMyData } from "../../../lib/privacy";
import Avatar from "../../../components/Avatar";
import VerificationStatusCard from "../components/VerificationStatusCard";
import WatermarkSettingsForm from "../components/WatermarkSettingsForm";
import AppearanceForm from "../components/AppearanceForm";
import AccountSecurityForm from "../components/AccountSecurityForm";

const subNavItems = ["Profile Settings", "Account Security", "Watermark Settings", "Appearance", "Privacy & Notifications"];

export default function SettingsView() {
  const { displayName, setDisplayName, avatarPath, setAvatarPath, currentUserId, accountType, username, setUsername, showToast } = useOutletContext();
  const navigate = useNavigate();
  const [activeSubNav, setActiveSubNav] = useState("Profile Settings");
  // "Download your data" (feature 6): null = idle, so the button shows its
  // normal label until clicked.
  const [exporting, setExporting] = useState(false);
  // "Delete your account": typing the username unlocks the real button, so
  // nobody deletes an account with one accidental click.
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // null = not edited yet, so the box shows the saved name. (Copying it in
  // once at the start would keep "User", the placeholder shown while the
  // dashboard is still loading.)
  const [nameInput, setNameInput] = useState(null);
  const shownName = nameInput ?? displayName;
  // The username box works the same way. A name can change every 7 days and a
  // username every 30; nameDates holds when each last changed (null = loading).
  const [usernameInput, setUsernameInput] = useState(null);
  const shownUsername = usernameInput ?? username;
  const [nameDates, setNameDates] = useState(null);
  const nameLockedUntil = nameDates && cooldownEnds(nameDates.nameChangedAt, NAME_COOLDOWN_DAYS);
  const usernameLockedUntil = nameDates && cooldownEnds(nameDates.usernameChangedAt, USERNAME_COOLDOWN_DAYS);
  // The description saved in the database (null while loading), and the
  // box's text once it's edited (null = not edited, same idea as the name).
  const [savedDescription, setSavedDescription] = useState(null);
  const [descriptionInput, setDescriptionInput] = useState(null);
  const shownDescription = descriptionInput ?? savedDescription ?? "";
  // Save waits until the description has loaded, so an empty box can't be
  // saved over the real one.
  // "Email me when I'm offline": null while loading, then true/false.
  const [emailWhenOffline, setEmailWhenOffline] = useState(null);
  // The kinds of offline email turned off: null while loading, then a list
  // (empty = every kind is on).
  const [emailMuted, setEmailMuted] = useState(null);
  // "Available for work" (freelancers): null while loading, then true/false.
  const [availableForWork, setAvailableForWork] = useState(null);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [savingEmailSetting, setSavingEmailSetting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  // The picked picture, shown while it uploads.
  const [previewUrl, setPreviewUrl] = useState(null);
  const pictureInputRef = useRef(null);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    fetchDescription(currentUserId).then((text) => {
      if (active) setSavedDescription(text);
    });
    fetchNameChangeDates(currentUserId).then((dates) => {
      if (active) setNameDates(dates);
    });
    fetchEmailWhenOffline(currentUserId).then((on) => {
      if (active) setEmailWhenOffline(on);
    });
    fetchAvailableForWork(currentUserId).then((on) => {
      if (active) setAvailableForWork(on);
    });
    fetchEmailMuted(currentUserId).then((muted) => {
      if (active) setEmailMuted(muted);
    });
    return () => { active = false; };
  }, [currentUserId]);

  // Saved as soon as it's clicked, like the profile picture.
  const handleEmailSettingChange = async (event) => {
    const on = event.target.checked;
    setSavingEmailSetting(true);
    const problem = await saveEmailWhenOffline(currentUserId, on);
    setSavingEmailSetting(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setEmailWhenOffline(on);
    showToast(on ? "You'll get emails while you're offline." : "Offline emails turned off.");
  };

  // One kind of email ticked or unticked. Saved as soon as it's clicked.
  const handleEmailKindChange = async (kind, wanted) => {
    const next = wanted ? emailMuted.filter((value) => value !== kind.value) : [...emailMuted, kind.value];
    setSavingEmailSetting(true);
    const problem = await saveEmailMuted(currentUserId, next);
    setSavingEmailSetting(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setEmailMuted(next);
    showToast(wanted ? `You'll get emails about: ${kind.label.toLowerCase()}.` : `No more emails about: ${kind.label.toLowerCase()}.`);
  };

  // Saved as soon as it's clicked, like the email switch.
  const handleAvailabilityChange = async (event) => {
    const on = event.target.checked;
    setSavingAvailability(true);
    const problem = await saveAvailableForWork(currentUserId, on);
    setSavingAvailability(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setAvailableForWork(on);
    showToast(on ? "You're available for work again." : "You're marked as not available. Clients can't send new bookings.");
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      const data = await exportMyData(currentUserId);
      downloadAsFile(data, `philfreela-data-${username || currentUserId}.json`);
    } catch {
      showToast("Couldn't put your data together. Please try again.");
    }
    setExporting(false);
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteMyAccount();
      navigate("/login", { replace: true });
    } catch (error) {
      setDeleteError(error.message);
      setDeleting(false);
    }
  };

  // Frees the old preview's memory whenever it's replaced or the page closes.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // The picture is saved as soon as it's picked. (It used to wait for Save
  // Changes, so leaving the page first quietly dropped the new picture.)
  const handlePicturePick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // lets the same file be picked again later
    if (!file || !currentUserId) return;
    const problem = checkAvatarFile(file);
    if (problem) {
      showToast(problem);
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setUploadingPicture(true);
    const { path, error } = await uploadAvatar(currentUserId, file, avatarPath);
    setUploadingPicture(false);
    setPreviewUrl(null);
    if (error) {
      showToast(error);
      return;
    }
    setAvatarPath(path);
    showToast("Profile picture updated!");
  };

  // Saves the name and description to the database (not just the screen), so
  // they stay after a refresh and other users see them too.
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId || saving) return;

    setSaving(true);
    const nameProblem = await saveDisplayName(currentUserId, shownName);
    if (nameProblem) {
      setSaving(false);
      showToast(nameProblem);
      return;
    }
    setDisplayName(shownName.trim());
    setNameInput(null);

    // The username is only sent when it was changed.
    if (shownUsername.trim() !== username) {
      const usernameProblem = await saveUsername(currentUserId, shownUsername);
      if (usernameProblem) {
        setSaving(false);
        showToast(usernameProblem);
        return;
      }
      setUsername(shownUsername.trim());
      setUsernameInput(null);
    }
    // A change starts a new waiting time, so ask the database for the dates again.
    setNameDates(await fetchNameChangeDates(currentUserId));

    const descriptionProblem = await saveDescription(currentUserId, shownDescription);
    if (descriptionProblem) {
      setSaving(false);
      showToast(descriptionProblem);
      return;
    }
    setSavedDescription(shownDescription.trim());
    setDescriptionInput(null);
    setSaving(false);
    showToast("Settings saved successfully!");
  };

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
        <h3 className="text-white fw-bold mb-4"><i className="bi bi-gear-fill text-info me-2"></i> Settings</h3>

        <div className="row g-4">
          <div className="col-md-4">
            <div className="nav flex-column gap-2">
              {subNavItems.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`btn text-start fw-semibold py-2 px-3 rounded-3 ${activeSubNav === item ? "bg-role text-white" : "text-white-50 hover-role"}`}
                  onClick={() => setActiveSubNav(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="col-md-8 settings-panel border-start border-secondary border-opacity-25 ps-md-4">
            <h4 className="text-white fw-bold mb-3">{activeSubNav}</h4>

            {activeSubNav === "Profile Settings" ? (
              <>
                <VerificationStatusCard userId={currentUserId} />
                {/* Only freelancers take bookings, so only they have this switch. */}
                {accountType === "freelancer" && (
                  <div className="form-check form-switch mb-4">
                    <input
                      id="availableForWork"
                      type="checkbox"
                      role="switch"
                      className="form-check-input"
                      checked={availableForWork === true}
                      onChange={handleAvailabilityChange}
                      disabled={availableForWork === null || savingAvailability}
                    />
                    <label htmlFor="availableForWork" className="form-check-label text-white fw-semibold fs-7">Available for work</label>
                    <p className="text-secondary fs-8 mb-0 mt-1">
                      {availableForWork === null
                        ? "Loading..."
                        : availableForWork
                          ? "Clients can book your services. Switch this off when you have enough work or are away."
                          : "Your profile and services say \"Not available right now\" and clients can't send you new bookings. They can still message you, and the bookings and projects you already have go on as usual."}
                    </p>
                  </div>
                )}
                <form className="d-flex flex-column gap-4" onSubmit={handleSubmit}>
                  <div>
                    <label className="form-label text-white-50 fw-semibold fs-7 mb-2">Upload Profile Picture:</label>
                    <div className="d-flex align-items-center gap-4">
                      <Avatar path={avatarPath} previewUrl={previewUrl} name={displayName} size={90} className="border border-2 border-secondary" />
                      <div className="d-flex flex-column gap-2">
                        <input type="file" className="d-none" ref={pictureInputRef} accept="image/jpeg,image/png,image/webp,image/gif" onChange={handlePicturePick} />
                        <button type="button" className="btn btn-secondary rounded-pill px-4 py-2 text-white fw-bold fs-7" onClick={() => pictureInputRef.current?.click()} disabled={uploadingPicture || !currentUserId}>
                          {uploadingPicture ? "Uploading..." : "Upload Picture"}
                        </button>
                        <small className="text-secondary fs-8">JPG, PNG, WebP or GIF. Max 5 MB.</small>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="form-label text-white-50 fw-semibold fs-7" htmlFor="settingsName">Name:</label>
                    <input
                      id="settingsName"
                      type="text"
                      className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                      value={shownName}
                      onChange={(e) => setNameInput(e.target.value)}
                      maxLength={MAX_NAME_LENGTH}
                      disabled={Boolean(nameLockedUntil)}
                    />
                    <small className={`fs-8 ${nameLockedUntil ? "text-warning" : "text-secondary"}`}>
                      {nameLockedUntil
                        ? `You can change your name again on ${formatEndDate(nameLockedUntil)}.`
                        : `You can change your name once every ${NAME_COOLDOWN_DAYS} days.`}
                    </small>
                  </div>

                  <div>
                    <label className="form-label text-white-50 fw-semibold fs-7" htmlFor="settingsUsername">Username:</label>
                    <input
                      id="settingsUsername"
                      type="text"
                      className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                      value={shownUsername}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      maxLength={MAX_USERNAME_LENGTH}
                      disabled={Boolean(usernameLockedUntil)}
                    />
                    <small className={`fs-8 ${usernameLockedUntil ? "text-warning" : "text-secondary"}`}>
                      {usernameLockedUntil
                        ? `You can change your username again on ${formatEndDate(usernameLockedUntil)}.`
                        : `You can change your username once every ${USERNAME_COOLDOWN_DAYS} days.`}
                    </small>
                  </div>

                  <div>
                    <label className="form-label text-white-50 fw-semibold fs-7">Description:</label>
                    <textarea
                      className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                      rows={5}
                      placeholder="Tell others about yourself: your skills, experience, and the kind of work you do or need."
                      value={shownDescription}
                      onChange={(e) => setDescriptionInput(e.target.value)}
                      maxLength={MAX_DESCRIPTION_LENGTH}
                      disabled={savedDescription === null}
                    />
                    <small className="text-secondary fs-8">
                      {savedDescription === null
                        ? "Loading your description..."
                        : `${shownDescription.length}/${MAX_DESCRIPTION_LENGTH} characters. Everyone who views your profile can see this.`}
                    </small>
                  </div>

                  <div>
                    <button type="submit" className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white shadow-glow-role" disabled={saving || !currentUserId || savedDescription === null}>
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              </>
            ) : activeSubNav === "Watermark Settings" ? (
              // Only freelancers upload photos and videos, so only they have a watermark.
              accountType === "freelancer" && currentUserId ? (
                <WatermarkSettingsForm userId={currentUserId} username={username} fullName={displayName} showToast={showToast} />
              ) : (
                <p className="text-secondary fs-7">Only freelancers upload work, so there's nothing to set here.</p>
              )
            ) : activeSubNav === "Appearance" ? (
              currentUserId
                ? <AppearanceForm userId={currentUserId} accountType={accountType} showToast={showToast} />
                : <p className="text-secondary fs-7">Loading...</p>
            ) : activeSubNav === "Privacy & Notifications" ? (
              <>
                <div className="form-check form-switch">
                  <input
                    id="emailWhenOffline"
                    type="checkbox"
                    role="switch"
                    className="form-check-input"
                    checked={emailWhenOffline === true}
                    onChange={handleEmailSettingChange}
                    disabled={emailWhenOffline === null || savingEmailSetting}
                  />
                  <label htmlFor="emailWhenOffline" className="form-check-label text-white fw-semibold fs-7">Email me when I'm offline</label>
                  <p className="text-secondary fs-8 mb-0 mt-1">
                    {emailWhenOffline === null
                      ? "Loading..."
                      : "When you're not on PhilFreela, we'll email you about the things ticked below (new messages at most once per chat every 30 minutes). Messages themselves are never put in the email."}
                  </p>

                  {/* Which kinds of email. They only matter while the switch
                      above is on, so they are greyed out when it is off. */}
                  {emailMuted !== null && (
                    <fieldset className="mt-3" disabled={emailWhenOffline !== true || savingEmailSetting}>
                      <legend className="text-white-50 fw-semibold fs-8 mb-2">Email me about:</legend>
                      {EMAIL_KINDS.filter((kind) => !kind.clientsOnly || accountType === "client").map((kind) => (
                        <div className="form-check mb-1" key={kind.value}>
                          <input
                            id={`emailKind-${kind.value}`}
                            type="checkbox"
                            className="form-check-input"
                            checked={!emailMuted.includes(kind.value)}
                            onChange={(event) => handleEmailKindChange(kind, event.target.checked)}
                          />
                          <label htmlFor={`emailKind-${kind.value}`} className="form-check-label text-white fs-7">{kind.label}</label>
                        </div>
                      ))}
                    </fieldset>
                  )}
                </div>

                {/* Feature 6, Data Privacy Compliance (RA 10173): "review" and
                    "download" your own data. */}
                <hr className="border-secondary border-opacity-25 my-4" />
                <h6 className="text-white fw-bold mb-1">Your data</h6>
                <p className="text-secondary fs-8 mb-3">
                  Download everything PhilFreela has about your account -- your profile, posts, portfolio, and a summary of
                  your activity -- as one file. See our{" "}
                  <a href="/privacy" target="_blank" rel="noopener noreferrer" className="hover-orange">Privacy Policy</a>{" "}
                  for what this does and doesn't include.
                </p>
                <button type="button" className="btn btn-outline-role rounded-pill px-4 py-2 fw-bold" onClick={handleExportData} disabled={exporting || !currentUserId}>
                  {exporting ? "Preparing your file..." : <><i className="bi bi-download me-2"></i>Download your data</>}
                </button>

                {/* "Removal": deleting your own account. Typing the username
                    is the confirmation step, so this can't happen by accident. */}
                <hr className="border-secondary border-opacity-25 my-4" />
                <h6 className="text-danger fw-bold mb-1">Delete your account</h6>
                <p className="text-secondary fs-8 mb-3">
                  Permanently removes your profile, posts, portfolio, and messages. This can't be undone. Type your
                  username (<strong className="text-white">{username}</strong>) to confirm.
                </p>
                <div className="d-flex flex-column flex-sm-row gap-2" style={{ maxWidth: 420 }}>
                  <input
                    type="text"
                    className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                    placeholder="Type your username"
                    value={deleteConfirmText}
                    onChange={(event) => setDeleteConfirmText(event.target.value)}
                    disabled={deleting}
                  />
                  <button
                    type="button"
                    className="btn btn-danger rounded-pill px-4 py-2 fw-bold text-nowrap"
                    disabled={deleting || deleteConfirmText !== username}
                    onClick={handleDeleteAccount}
                  >
                    {deleting ? "Deleting..." : "Delete my account"}
                  </button>
                </div>
                {deleteError && <p className="text-danger fs-8 mt-2 mb-0">{deleteError}</p>}
              </>
            ) : (
              // The tab left is Account Security: how you sign in, changing
              // your password, and signing out your other devices.
              <AccountSecurityForm showToast={showToast} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
