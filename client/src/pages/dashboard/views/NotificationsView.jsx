import { useNavigate } from "react-router-dom";

export default function NotificationsView() {
  const navigate = useNavigate();

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
        <h3 className="text-white fw-bold mb-4"><i className="bi bi-bell-fill text-warning me-2"></i> Notifications</h3>

        <div className="d-flex flex-column gap-3">
          <div className="p-3 p-md-4 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between gap-3 hover-lift">
            <div className="d-flex align-items-center gap-3">
              <div className="avatar-circle bg-success text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center" style={{ width: 52, height: 52 }}>
                <i className="bi bi-person-fill fs-3"></i>
              </div>
              <div>
                <h5 className="text-white fw-bold mb-1">Greetings to new users</h5>
                <p className="text-secondary fs-7 mb-0">PhilFreela • Welcome to the platform! Complete your profile to get discovered.</p>
              </div>
            </div>
            <button className="btn btn-secondary rounded-pill px-4 py-2 fw-bold text-white fs-7">View</button>
          </div>

          <div className="p-3 p-md-4 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between gap-3 hover-lift">
            <div className="d-flex align-items-center gap-3">
              <div className="avatar-circle bg-orange text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center" style={{ width: 52, height: 52 }}>
                <i className="bi bi-briefcase-fill fs-3"></i>
              </div>
              <div>
                <h5 className="text-white fw-bold mb-1">New Job Invitation</h5>
                <p className="text-secondary fs-7 mb-0">Jack Doe invited you to apply for "Cafe Logo Designer".</p>
              </div>
            </div>
            <button className="btn btn-gradient-orange rounded-pill px-4 py-2 fw-bold text-white fs-7" onClick={() => navigate("/dashboard/messages")}>View</button>
          </div>
        </div>
      </div>
    </section>
  );
}
