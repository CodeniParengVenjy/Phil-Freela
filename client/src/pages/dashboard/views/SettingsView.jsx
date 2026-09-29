import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { MAX_NAME_LENGTH, saveDisplayName } from "../../../lib/profile";
import { checkAvatarFile, uploadAvatar } from "../../../lib/avatar";
import Avatar from "../../../components/Avatar";
import VerificationStatusCard from "../components/VerificationStatusCard";
import WatermarkSettingsForm from "../components/WatermarkSettingsForm";

const subNavItems = ["Profile Settings", "Account Security", "Watermark Settings", "Privacy & Notifications"];

export default function SettingsView() {
  const { displayName, setDisplayName, avatarPath, setAvatarPath, currentUserId, accountType, username, showToast } = useOutletContext();
  const [activeSubNav, setActiveSubNav] = useState("Profile Settings");
  // null = not edited yet, so the box shows the saved name. (Copying it in
  // once at the start would keep "User", the placeholder shown while the
  // dashboard is still loading.)
  const [nameInput, setNameInput] = useState(null);
  const shownName = nameInput ?? displayName;
  const [saving, setSaving] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);
  // The picked picture, shown while it uploads.
  const [previewUrl, setPreviewUrl] = useState(null);
  const pictureInputRef = useRef(null);

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

  // Saves the name to the database (not just the screen), so it stays after
  // a refresh and other users see it too.
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
                    <label className="form-label text-white-50 fw-semibold fs-7">Display Name:</label>
                    <input
                      type="text"
                      className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                      value={shownName}
                      onChange={(e) => setNameInput(e.target.value)}
                      maxLength={MAX_NAME_LENGTH}
                    />
                  </div>

                  <div>
                    <button type="submit" className="btn btn-gradient-role rounded-pill px-5 py-2 fw-bold text-white shadow-glow-role" disabled={saving || !currentUserId}>
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
            ) : (
              <p className="text-secondary fs-7">This section isn't wired up yet.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
