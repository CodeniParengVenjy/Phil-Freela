import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { fetchIsVerified } from "../../../lib/verification";
import { fetchDescription } from "../../../lib/profile";
import PortfolioSection from "../components/PortfolioSection";
import PerformanceBox from "../components/PerformanceBox";
import CompletedProjects from "../components/CompletedProjects";
import Avatar from "../../../components/Avatar";

const initialSkills = ["Critical Thinker", "Web Developer", "Creativity", "Video Editing"];

export default function ProfileView() {
  const { displayName, avatarPath, currentUserId, accountType, username, showToast } = useOutletContext();
  const [skills, setSkills] = useState(initialSkills);
  // null while checking, then true/false (approved identity verification).
  const [verified, setVerified] = useState(null);
  // undefined while loading, null if it couldn't load, "" if not written yet.
  const [description, setDescription] = useState(undefined);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    fetchIsVerified(currentUserId).then((result) => {
      if (active) setVerified(result);
    });
    fetchDescription(currentUserId).then((text) => {
      if (active) setDescription(text);
    });
    return () => { active = false; };
  }, [currentUserId]);

  const addSkill = () => {
    const skill = window.prompt("Enter a new skill (e.g., Motion Graphics, Photoshop, React):");
    if (skill && skill.trim()) {
      setSkills((prev) => [...prev, skill.trim()]);
      showToast(`Skill "${skill.trim()}" added to profile!`);
    }
  };

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        <div className="col-lg-8">
          <div className="profile-card-main glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25 text-center position-relative overflow-hidden">
            <div className="profile-banner-bg"></div>

            <div className="position-relative z-2">
              <div className="profile-avatar-container mx-auto mb-3">
                <Avatar path={avatarPath} name={displayName} size={120} className="border border-4 border-dark shadow-2xl" />
              </div>

              <h2 className="fw-bold text-white mb-4">{displayName}</h2>

              <div className="text-start bg-dark bg-opacity-50 p-4 rounded-3 border border-secondary border-opacity-25 mb-4">
                <h5 className="text-white fw-bold mb-2"><i className="bi bi-text-paragraph text-orange me-2"></i> Description</h5>
                {description === undefined && <p className="text-secondary fs-7 mb-0">Loading...</p>}
                {description === null && <p className="text-secondary fs-7 mb-0">Couldn't load your description.</p>}
                {description === "" && (
                  <p className="text-secondary fs-7 mb-0">
                    No description yet.{" "}
                    <Link to="/dashboard/settings" className="text-role fw-bold text-decoration-none">Add one in Settings</Link>
                  </p>
                )}
                {/* pre-line keeps the line breaks the user typed. */}
                {description && <p className="text-light-50 fs-7 mb-0 text-break" style={{ whiteSpace: "pre-line" }}>{description}</p>}
              </div>

              <div className="text-start mb-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h5 className="text-white fw-bold mb-0"><i className="bi bi-tools text-orange me-2"></i> Skills</h5>
                  <button className="btn btn-sm btn-outline-warning rounded-pill fs-8 fw-bold" onClick={addSkill}>+ Add Skill</button>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {skills.map((skill) => (
                    <span key={skill} className="badge bg-secondary bg-opacity-75 text-light px-3 py-2 rounded-pill fs-7">{skill}</span>
                  ))}
                </div>
              </div>

              {/* The projects the client marked Done, in the role you have now (Feature 5). */}
              {currentUserId && (
                <div className="text-start mb-4">
                  <CompletedProjects userId={currentUserId} role={accountType} />
                </div>
              )}

              {/* Only freelancers have a portfolio. */}
              {accountType === "freelancer" && currentUserId && (
                <div className="text-start">
                  <PortfolioSection freelancerId={currentUserId} ownerName={username} isOwner />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          {/* Real numbers from your projects, ratings and chats (Feature 5). */}
          <PerformanceBox userId={currentUserId} role={accountType} className="mb-4" />

          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
            <h5 className="text-white fw-bold mb-3"><i className="bi bi-shield-check text-success me-2"></i> Verifications</h5>
            {verified === null && <div className="text-secondary fs-7 mb-2">Checking identity...</div>}
            {verified === true && (
              <div className="d-flex align-items-center gap-2 mb-2 text-success fs-7">
                <i className="bi bi-check-circle-fill"></i> Identity Verified
              </div>
            )}
            {verified === false && (
              <div className="d-flex align-items-center gap-2 mb-2 text-secondary fs-7 flex-wrap">
                <i className="bi bi-shield-exclamation"></i> Identity not verified
                <Link to="/dashboard/verify-identity" className="text-role fw-bold text-decoration-none ms-1">Verify now</Link>
              </div>
            )}
            <div className="d-flex align-items-center gap-2 text-success fs-7">
              <i className="bi bi-check-circle-fill"></i> Email Authenticated
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
