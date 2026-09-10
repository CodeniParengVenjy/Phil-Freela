import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";

const jobs = [
  { name: "Jack Doe", title: "Hiring a logo designer for our cafe business", rating: "5.0", tag: "Graphic Designer", icon: "bi-person-fill", avatar: "bg-success" },
  { name: "Peter Cruz", title: "We are looking for poster maker for billboard ads", rating: "5.0", tag: "Graphic Designer", icon: "bi-person", avatar: "bg-secondary" },
  { name: "Coffee Company", title: "Hiring a video editor for advertisement", rating: "5.0", tag: "Video Editor", icon: "bi-building", avatar: "bg-secondary" },
  { name: "Justin Lopez", title: "Hiring a logo designer for our cafe business", rating: "5.0", tag: "Web Developer", icon: "bi-person", avatar: "bg-secondary" },
  { name: "Alex's Craft", title: "I am looking for Web Developer for clothing store", rating: "5.0", tag: null, icon: "bi-shop", avatar: "bg-secondary" }
];

export default function MessagesView() {
  const { openChat } = useOutletContext();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return jobs.filter((job) => `${job.name} ${job.title} ${job.tag ?? ""}`.toLowerCase().includes(q));
  }, [query]);

  return (
    <section className="dashboard-view active-view">
      <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25 mb-4">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
          <div>
            <h3 className="text-white fw-bold mb-1"><i className="bi bi-briefcase text-orange me-2"></i> Client Job Openings</h3>
            <p className="text-secondary fs-7 mb-0">Browse recent project listings from clients and connect directly.</p>
          </div>

          <div className="position-relative search-nav-box" style={{ minWidth: 280 }}>
            <i className="bi bi-search search-icon text-secondary"></i>
            <input
              type="search"
              className="form-control nav-search-input"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="d-flex flex-column gap-3">
          {filtered.map((job) => (
            <div key={job.name + job.title} className="job-item-card p-3 p-md-4 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 d-flex align-items-center justify-content-between gap-3 hover-lift">
              <div className="d-flex align-items-center gap-3">
                <div className={`avatar-circle ${job.avatar} text-white fw-bold flex-shrink-0 d-flex align-items-center justify-content-center`} style={{ width: 52, height: 52 }}>
                  <i className={`bi ${job.icon} fs-3`}></i>
                </div>
                <div>
                  <h5 className="text-white fw-bold mb-1">{job.title}</h5>
                  <div className="d-flex align-items-center gap-2 fs-7 mb-2">
                    <span className="text-white-50">{job.name}</span>
                    <span className="text-warning"><i className="bi bi-star-fill"></i> {job.rating}</span>
                    {job.tag && <span className="badge bg-black text-light px-3 py-1 rounded-pill">{job.tag}</span>}
                  </div>
                </div>
              </div>
              <button className="btn btn-dark border border-secondary text-orange hover-bg-orange rounded-3 px-3 py-2" onClick={() => openChat(job.name)}>
                <i className="bi bi-chat-dots-fill fs-5"></i>
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
