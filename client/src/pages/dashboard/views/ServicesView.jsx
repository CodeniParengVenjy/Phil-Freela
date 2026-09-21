import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";

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

export default function ServicesView() {
  const { currentUserId, showToast } = useOutletContext();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [skill, setSkill] = useState("");
  const [price, setPrice] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [services, setServices] = useState(null);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    supabase
      .from("services")
      .select("id, title, category, price, image_url, created_at")
      .eq("freelancer_id", currentUserId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        setServices(error ? [] : data);
      });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId) return;
    setSubmitting(true);

    let imageUrl = null;
    if (imageFile) {
      const path = `${currentUserId}/${Date.now()}-${imageFile.name}`;
      const { error: uploadError } = await supabase.storage.from("marketplace-images").upload(path, imageFile);
      if (uploadError) {
        setSubmitting(false);
        showToast("Couldn't upload that image. Please try again.");
        return;
      }
      imageUrl = supabase.storage.from("marketplace-images").getPublicUrl(path).data.publicUrl;
    }

    const { data, error } = await supabase
      .from("services")
      .insert({
        freelancer_id: currentUserId,
        title: title.trim(),
        category,
        description: description.trim(),
        skill: skill || null,
        price: price ? Number(price) : null,
        image_url: imageUrl
      })
      .select("id, title, category, price, image_url, created_at")
      .single();

    setSubmitting(false);
    if (error) {
      showToast("Couldn't publish that service. Please try again.");
      return;
    }

    setServices((prev) => [data, ...(prev || [])]);
    setTitle("");
    setCategory("");
    setDescription("");
    setSkill("");
    setPrice("");
    setImageFile(null);
    showToast(`Your new service "${data.title}" is live!`);
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

              <div>
                <label className="form-label text-white fw-semibold fs-7">Starting Price (₱):</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2"
                  placeholder="e.g. 2500"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>

              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 pt-2">
                <div>
                  <label className="form-label text-white fw-semibold fs-7 d-block">Upload a photo (optional):</label>
                  <input
                    type="file"
                    className="form-control form-control-sm bg-dark border-secondary text-white"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  />
                </div>

                <button type="submit" className="btn btn-gradient-orange btn-lg px-5 py-2 rounded-pill fw-bold text-white shadow-glow" disabled={submitting}>
                  {submitting ? "Publishing..." : "Upload & Publish"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
            <h5 className="text-white fw-bold mb-3"><i className="bi bi-grid-fill text-warning me-2"></i> Your Active Services</h5>

            {services === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}
            {services !== null && services.length === 0 && <p className="text-secondary fs-7 mb-0">You haven't posted a service yet.</p>}

            <div className="d-flex flex-column gap-3">
              {services?.map((s) => {
                const categoryLabel = categories.find((c) => c.value === s.category)?.label || s.category;
                return (
                  <div key={s.id} className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 d-flex gap-3 align-items-center">
                    {s.image_url && (
                      <img src={s.image_url} alt="" className="rounded-3 flex-shrink-0" style={{ width: 56, height: 56, objectFit: "cover" }} />
                    )}
                    <div className="flex-grow-1">
                      <h6 className="text-white fw-bold mb-1">{s.title}</h6>
                      <span className="badge bg-orange text-white fs-8 mb-2">{categoryLabel}</span>
                      <p className="text-secondary fs-8 mb-0">
                        {s.price ? `Starting at ₱${Number(s.price).toLocaleString()}` : "Price on request"} • {new Date(s.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
