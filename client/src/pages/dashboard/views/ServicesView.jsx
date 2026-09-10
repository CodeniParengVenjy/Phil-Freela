import { useState } from "react";
import { useOutletContext } from "react-router-dom";

const categories = [
  { value: "video-editing", label: "Video Editing & Motion Graphics" },
  { value: "graphic-design", label: "Graphic Design & Poster/Logo" },
  { value: "web-development", label: "Web Development & React Apps" },
  { value: "copywriting", label: "Copywriting & Content Creation" }
];

const skillOptions = [
  { value: "critical-thinker", label: "Critical Thinker" },
  { value: "web-developer", label: "Web Developer" },
  { value: "creativity", label: "Creativity" },
  { value: "video-editor", label: "Video Editor" }
];

const initialServices = [
  { title: "Pro Video Editing & Motion Graphics", category: "Video Editing", info: "Starting at ₱3,500 • 67 Orders" }
];

export default function ServicesView() {
  const { showToast } = useOutletContext();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [skill, setSkill] = useState("");
  const [services, setServices] = useState(initialServices);

  const handleSubmit = (event) => {
    event.preventDefault();
    const categoryLabel = categories.find((c) => c.value === category)?.label || "Service";
    const newTitle = title.trim() || "New Service";

    setServices((prev) => [{ title: newTitle, category: categoryLabel, info: "Starting at ₱2,500 • Published Just Now" }, ...prev]);
    setTitle("");
    setCategory("");
    setDescription("");
    setSkill("");
    showToast(`Your new service "${newTitle}" is live!`);
  };

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        <div className="col-lg-8">
          <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
            <h3 className="text-white fw-bold mb-4"><i className="bi bi-plus-circle text-orange me-2"></i> Post a Service Offered</h3>

            <form className="d-flex flex-column gap-3" onSubmit={handleSubmit}>
              <div>
                <label className="form-label text-white fw-semibold fs-7">Service Title:</label>
                <input
                  type="text"
                  className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                  placeholder="e.g. Professional Video Editing for Ads & Reels"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label text-white fw-semibold fs-7">Select services category:</label>
                <select className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2" value={category} onChange={(e) => setCategory(e.target.value)} required>
                  <option value="" disabled>Select services...</option>
                  {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label text-white fw-semibold fs-7">Enter Services Description:</label>
                <textarea
                  className="form-control bg-secondary bg-opacity-25 border-secondary text-white p-3"
                  rows="5"
                  placeholder="Describe your service offer, turnaround time, deliverables..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                ></textarea>
              </div>

              <div>
                <label className="form-label text-white fw-semibold fs-7">Specify skills:</label>
                <select className="form-select bg-secondary bg-opacity-25 border-secondary text-white py-2" value={skill} onChange={(e) => setSkill(e.target.value)}>
                  <option value="" disabled>Specify skills...</option>
                  {skillOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 pt-2">
                <div>
                  <label className="form-label text-white fw-semibold fs-7 d-block">Upload your portfolio:</label>
                  <input type="file" className="form-control form-control-sm bg-dark border-secondary text-white" accept="image/*" />
                </div>

                <button type="submit" className="btn btn-gradient-orange btn-lg px-5 py-2 rounded-pill fw-bold text-white shadow-glow">
                  Upload & Publish
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
            <h5 className="text-white fw-bold mb-3"><i className="bi bi-grid-fill text-warning me-2"></i> Your Active Services</h5>

            <div className="d-flex flex-column gap-3">
              {services.map((s, i) => (
                <div key={i} className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25">
                  <h6 className="text-white fw-bold mb-1">{s.title}</h6>
                  <span className="badge bg-orange text-white fs-8 mb-2">{s.category}</span>
                  <p className="text-secondary fs-8 mb-0">{s.info}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
