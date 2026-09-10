import { useState } from "react";
import { useOutletContext } from "react-router-dom";

const initialResumes = [
  { name: "Peter Cruz", icon: "bi-person-fill", avatar: "bg-success" },
  { name: "Dennis Sandehas", icon: "bi-person", avatar: "bg-secondary" }
];

const initialProjects = [
  { name: "Dennis Sandehas", icon: "bi-person-fill", avatar: "bg-success", state: "Ongoing" },
  { name: "Coffee Company", icon: "bi-building", avatar: "bg-secondary", state: "Done" }
];

export default function ProjectsView() {
  const { openPreview, showToast } = useOutletContext();
  const [resumes] = useState(initialResumes);
  const [projects, setProjects] = useState(initialProjects);

  const toggleState = (name) => {
    setProjects((prev) => prev.map((p) => {
      if (p.name !== name) return p;
      const nextState = p.state === "Ongoing" ? "Done" : "Ongoing";
      showToast(nextState === "Done" ? "Project status updated to Done 🟢" : "Project status updated to Ongoing 🟡");
      return { ...p, state: nextState };
    }));
  };

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        <div className="col-lg-6">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100">
            <h4 className="text-white fw-bold mb-3"><i className="bi bi-file-earmark-person-fill text-info me-2"></i> Applications & Resumes</h4>
            <p className="text-secondary fs-7 mb-4">Candidates who submitted resumes for your listings.</p>

            <div className="d-flex flex-column gap-3">
              {resumes.map((r) => (
                <div key={r.name} className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between gap-3 hover-lift">
                  <div className="d-flex align-items-center gap-3">
                    <div className={`avatar-circle ${r.avatar} text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center`} style={{ width: 48, height: 48 }}>
                      <i className={`bi ${r.icon} fs-4`}></i>
                    </div>
                    <div>
                      <h6 className="text-white fw-bold mb-0">{r.name}</h6>
                      <p className="text-warning fs-7 mb-0">Has sent a resume</p>
                    </div>
                  </div>
                  <button className="btn btn-secondary rounded-pill px-4 py-2 fw-bold text-white fs-7" onClick={() => openPreview("/images/Client.png", `${r.name} - Resume Preview`)}>View</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 h-100">
            <h4 className="text-white fw-bold mb-3"><i className="bi bi-kanban-fill text-warning me-2"></i> Active Projects Tracker</h4>
            <p className="text-secondary fs-7 mb-4">Track ongoing client contracts and project statuses.</p>

            <div className="d-flex flex-column gap-3">
              {projects.map((p) => (
                <div key={p.name} className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between gap-3 hover-lift">
                  <div className="d-flex align-items-center gap-3">
                    <div className={`avatar-circle ${p.avatar} text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center`} style={{ width: 48, height: 48 }}>
                      <i className={`bi ${p.icon} fs-4`}></i>
                    </div>
                    <div>
                      <h6 className="text-white fw-bold mb-1">{p.name}</h6>
                      <div className="d-flex align-items-center gap-2 fs-7">
                        <span className="text-white-50">State: <strong className={p.state === "Ongoing" ? "text-warning" : "text-success"}>{p.state}</strong></span>
                        <i className={`bi bi-circle-fill fs-8 ${p.state === "Ongoing" ? "text-warning" : "text-success"}`}></i>
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-dark border border-secondary rounded-pill px-4 py-2 fw-bold text-white fs-7" onClick={() => toggleState(p.name)}>Toggle State</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
