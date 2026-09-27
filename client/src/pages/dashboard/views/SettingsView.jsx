import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { MAX_NAME_LENGTH, saveDisplayName } from "../../../lib/profile";
import VerificationStatusCard from "../components/VerificationStatusCard";
import WatermarkSettingsForm from "../components/WatermarkSettingsForm";

const subNavItems = ["Profile Settings", "Account Security", "Watermark Settings", "Privacy & Notifications"];

export default function SettingsView() {
  const { displayName, setDisplayName, currentUserId, accountType, username, showToast } = useOutletContext();
  const [activeSubNav, setActiveSubNav] = useState("Profile Settings");
  // null = not edited yet, so the box shows the saved name. (Copying it in
  // once at the start would keep "User", the placeholder shown while the
  // dashboard is still loading.)
  const [nameInput, setNameInput] = useState(null);
  const shownName = nameInput ?? displayName;
  const [saving, setSaving] = useState(false);

  // Saves the name to the database (not just the screen), so it stays
  // after a refresh and other users see it too.
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId || saving) return;

    setSaving(true);
    const problem = await saveDisplayName(currentUserId, shownName);
    setSaving(false);
    if (problem) {
      showToast(problem);
      return;
    }
    setDisplayName(shownName.trim());
    setNameInput(null);
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

          <div className="col-md-8 border-start border-secondary border-opacity-25 ps-md-4">
            <h4 className="text-white fw-bold mb-3">{activeSubNav}</h4>

            {activeSubNav === "Profile Settings" ? (
              <>
                <VerificationStatusCard userId={currentUserId} />
                <form className="d-flex flex-column gap-4" onSubmit={handleSubmit}>
                  <div>
                    <label className="form-label text-white-50 fw-semibold fs-7 mb-2">Upload Profile Picture:</label>
                    <div className="d-flex align-items-center gap-4">
                      <div className="avatar-circle bg-secondary text-white fw-bold d-flex align-items-center justify-content-center border border-2 border-secondary" style={{ width: 90, height: 90 }}>
                        <i className="bi bi-person fs-1"></i>
                      </div>
                      <div className="d-flex flex-column gap-2">
                        <input type="file" className="d-none" id="avatarFileInput" accept="image/*" />
                        <button type="button" className="btn btn-secondary rounded-pill px-4 py-2 text-white fw-bold fs-7" onClick={() => document.getElementById("avatarFileInput")?.click()}>Upload Picture</button>
                        <small className="text-secondary fs-8">JPG, PNG or GIF. Max 5MB.</small>
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
