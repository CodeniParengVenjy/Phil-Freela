import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { fetchIsVerified } from "../../../lib/verification";

const initialSkills = ["Critical Thinker", "Web Developer", "Creativity", "Video Editing"];

export default function ProfileView() {
  const { displayName, currentUserId, showToast, openPreview } = useOutletContext();
  const [skills, setSkills] = useState(initialSkills);
  // null while checking, then true/false (approved identity verification).
  const [verified, setVerified] = useState(null);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    fetchIsVerified(currentUserId).then((result) => {
      if (active) setVerified(result);
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
                <div className="profile-avatar-box rounded-circle bg-success d-flex align-items-center justify-content-center text-white border border-4 border-dark shadow-2xl mx-auto" style={{ width: 120, height: 120, fontSize: "3rem" }}>
                  <i className="bi bi-person-fill"></i>
                </div>
              </div>

              <h2 className="fw-bold text-white mb-4">{displayName}</h2>

              <div className="text-start bg-dark bg-opacity-50 p-4 rounded-3 border border-secondary border-opacity-25 mb-4">
                <h5 className="text-white fw-bold mb-2"><i className="bi bi-text-paragraph text-orange me-2"></i> Description</h5>
                <p className="text-light-50 fs-7 mb-2">
                  Passionate Filipino digital creative with over 5+ years of experience in video editing, high-converting social media ads, brand design, and modern web application development.
                </p>
                <p className="text-light-50 fs-7 mb-0">
                  Dedicated to delivering top-tier quality, fast turnarounds, and creative excellence for clients across the Philippines and worldwide.
                </p>
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

              <div className="text-start">
                <h5 className="text-white fw-bold mb-3"><i className="bi bi-grid-3x3-gap-fill text-orange me-2"></i> Portfolio</h5>
                <div className="row g-3">
                  <div className="col-6 col-md-4">
                    <div className="portfolio-item rounded-3 overflow-hidden position-relative hover-zoom border border-secondary border-opacity-25">
                      <img src="/images/Freelancers.png" alt="Portfolio 1" className="img-fluid w-100 object-fit-cover" style={{ height: 140 }} />
                      <div className="portfolio-overlay d-flex align-items-center justify-content-center">
                        <button className="btn btn-sm btn-warning fw-bold rounded-pill" onClick={() => openPreview("/images/Freelancers.png", "Portfolio Piece Preview")}>Preview</button>
                      </div>
                    </div>
                  </div>
                  <div className="col-6 col-md-4">
                    <div className="portfolio-item rounded-3 overflow-hidden position-relative hover-zoom border border-secondary border-opacity-25">
                      <img src="/images/Client.png" alt="Portfolio 2" className="img-fluid w-100 object-fit-cover" style={{ height: 140 }} />
                      <div className="portfolio-overlay d-flex align-items-center justify-content-center">
                        <button className="btn btn-sm btn-warning fw-bold rounded-pill" onClick={() => openPreview("/images/Client.png", "Portfolio Piece Preview")}>Preview</button>
                      </div>
                    </div>
                  </div>
                  <div className="col-6 col-md-4">
                    <div className="portfolio-item rounded-3 overflow-hidden position-relative hover-zoom border border-secondary border-opacity-25 bg-dark d-flex flex-column align-items-center justify-content-center p-3 text-center" style={{ height: 140 }}>
                      <i className="bi bi-file-earmark-code fs-1 text-info mb-1"></i>
                      <span className="fs-8 text-white-50">Web Store App</span>
                      <button className="btn btn-xs btn-outline-info rounded-pill mt-2 fs-8" onClick={() => openPreview("/images/Freelancers.png", "Portfolio Piece Preview")}>View Details</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
            <h5 className="text-white fw-bold mb-3"><i className="bi bi-bar-chart-line text-warning me-2"></i> Performance</h5>
            <div className="d-flex justify-content-between align-items-center py-2 border-bottom border-secondary border-opacity-25">
              <span className="text-secondary fs-7">Completed Orders</span>
              <span className="fw-bold text-white fs-6">67</span>
            </div>
            <div className="d-flex justify-content-between align-items-center py-2 border-bottom border-secondary border-opacity-25">
              <span className="text-secondary fs-7">On-time Delivery</span>
              <span className="fw-bold text-success fs-6">99%</span>
            </div>
            <div className="d-flex justify-content-between align-items-center py-2 border-bottom border-secondary border-opacity-25">
              <span className="text-secondary fs-7">Response Time</span>
              <span className="fw-bold text-info fs-6">1 hour</span>
            </div>
            <div className="d-flex justify-content-between align-items-center py-2">
              <span className="text-secondary fs-7">Member Since</span>
              <span className="fw-bold text-white fs-6">August 2026</span>
            </div>
          </div>

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
