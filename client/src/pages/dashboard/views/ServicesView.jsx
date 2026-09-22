import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { categories } from "../../../lib/categories";
import MediaDropzone from "../components/MediaDropzone";
import ServiceCard from "../components/ServiceCard";

const skillOptions = [
  { value: "critical-thinker", label: "Critical Thinker" },
  { value: "web-developer", label: "Web Developer" },
  { value: "creativity", label: "Creativity" },
  { value: "video-editor", label: "Video Editor" }
];

// Upload rules. The Supabase bucket enforces the same limits on the server.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/webm";

// Returns a message when the file is not allowed, or "" when it is fine.
function checkMediaFile(file) {
  if (IMAGE_TYPES.includes(file.type)) {
    return file.size > MAX_IMAGE_BYTES ? "Photos must be 5 MB or smaller." : "";
  }
  if (VIDEO_TYPES.includes(file.type)) {
    return file.size > MAX_VIDEO_BYTES ? "Videos must be 50 MB or smaller." : "";
  }
  return "Only JPG, PNG or WebP photos, or MP4 or WebM videos, are allowed.";
}

export default function ServicesView() {
  const { currentUserId, showToast } = useOutletContext();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [skill, setSkill] = useState("");
  const [price, setPrice] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaError, setMediaError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [services, setServices] = useState(null);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    supabase
      .from("services")
      .select("id, title, category, price, image_url, media_type, created_at")
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

  // Called by the drop zone with the picked or dropped file (null = removed).
  const handleMediaSelect = (file) => {
    if (!file) {
      setMediaFile(null);
      setMediaError("");
      return;
    }
    const problem = checkMediaFile(file);
    if (problem) {
      setMediaError(problem);
      setMediaFile(null);
      return;
    }
    setMediaError("");
    setMediaFile(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId) return;
    setSubmitting(true);

    let mediaUrl = null;
    let mediaType = "image";
    if (mediaFile) {
      mediaType = VIDEO_TYPES.includes(mediaFile.type) ? "video" : "image";
      // Name the file by time + extension only, so odd characters in the
      // original file name can't break the upload.
      const extension = mediaFile.type.split("/")[1];
      const path = `${currentUserId}/${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("marketplace-images").upload(path, mediaFile);
      if (uploadError) {
        setSubmitting(false);
        showToast(`Couldn't upload that ${mediaType}. Please try again.`);
        return;
      }
      mediaUrl = supabase.storage.from("marketplace-images").getPublicUrl(path).data.publicUrl;
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
        image_url: mediaUrl,
        media_type: mediaType
      })
      .select("id, title, category, price, image_url, media_type, created_at")
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
    setMediaFile(null);
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

              <div>
                <label className="form-label text-white fw-semibold fs-7">Upload a photo or video (optional):</label>
                <MediaDropzone
                  file={mediaFile}
                  onSelect={handleMediaSelect}
                  accept={MEDIA_ACCEPT}
                  hint="Photos (JPG, PNG, WebP) up to 5 MB. Videos (MP4, WebM) up to 50 MB."
                  error={mediaError}
                />
              </div>

              <div className="d-flex justify-content-end pt-2">
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
              {services?.map((s) => <ServiceCard key={s.id} service={s} />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
