import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { categories } from "../../../lib/categories";
import { fetchIsVerified } from "../../../lib/verification";
import { SLIDE_HINT, SLIDES_SELECT, addPickedFiles, uploadSlides } from "../../../lib/slides";
import SlidePicker from "../components/SlidePicker";
import ServiceCard from "../components/ServiceCard";

const skillOptions = [
  { value: "critical-thinker", label: "Critical Thinker" },
  { value: "web-developer", label: "Web Developer" },
  { value: "creativity", label: "Creativity" },
  { value: "video-editor", label: "Video Editor" }
];

const SERVICE_COLUMNS = "id, title, category, price, image_url, media_type, created_at";

export default function ServicesView() {
  const { currentUserId, showToast } = useOutletContext();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [skill, setSkill] = useState("");
  const [price, setPrice] = useState("");
  // The photos and videos picked for the slideshow: [{ key, file }].
  const [slideItems, setSlideItems] = useState([]);
  const [slidesError, setSlidesError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // "Uploading 2 of 5..." while the slides are being sent.
  const [progress, setProgress] = useState("");
  const [services, setServices] = useState(null);
  // Only freelancers with a verified identity can offer services (the
  // database enforces this too). null while checking.
  const [isVerified, setIsVerified] = useState(null);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;
    fetchIsVerified(currentUserId).then((result) => {
      if (active) setIsVerified(result);
    });
    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    let active = true;

    supabase
      .from("services")
      .select(`${SERVICE_COLUMNS}, ${SLIDES_SELECT}`)
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

  // Called by the picker with newly picked or dropped files.
  const handleAddSlides = async (files) => {
    const result = await addPickedFiles(slideItems, files);
    setSlideItems(result.items);
    setSlidesError(result.error);
  };

  const handleRemoveSlide = (key) => {
    setSlideItems((prev) => prev.filter((item) => item.key !== key));
    setSlidesError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId) return;
    setSubmitting(true);

    // 1. Save the service itself. Its photos and videos are added next.
    const { data: service, error } = await supabase
      .from("services")
      .insert({
        freelancer_id: currentUserId,
        title: title.trim(),
        category,
        description: description.trim(),
        skill: skill || null,
        price: price ? Number(price) : null
      })
      .select(SERVICE_COLUMNS)
      .single();

    if (error) {
      setSubmitting(false);
      showToast("Couldn't publish that service. Please try again.");
      return;
    }

    // 2. Send the photos and videos one at a time through the AI service.
    // If one fails, the service keeps the ones that worked.
    const { slides, failed } = await uploadSlides({ serviceId: service.id }, slideItems, currentUserId, setProgress);

    setSubmitting(false);
    setProgress("");
    setServices((prev) => [{ ...service, slides }, ...(prev || [])]);
    setTitle("");
    setCategory("");
    setDescription("");
    setSkill("");
    setPrice("");
    setSlideItems([]);

    if (failed.length) {
      setSlidesError(`Your service is live, but ${failed.length === 1 ? "1 file" : `${failed.length} files`} couldn't be added. ${failed.join(" ")}`);
      showToast(`"${service.title}" is live, but some files couldn't be added.`);
    } else {
      setSlidesError("");
      showToast(`Your new service "${service.title}" is live!`);
    }
  };

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        <div className="col-lg-8">
          <div className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
            <h3 className="text-white fw-bold mb-4"><i className="bi bi-plus-circle text-orange me-2"></i> Post a Service Offered</h3>

            {isVerified === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}

            {isVerified === false && (
              <div className="text-center py-4">
                <i className="bi bi-shield-lock text-warning" style={{ fontSize: "2.75rem" }}></i>
                <h5 className="text-white fw-bold mt-3 mb-2">Verify your identity to post services</h5>
                <p className="text-secondary fs-7 mb-4 mx-auto" style={{ maxWidth: 460 }}>
                  To keep clients safe, only freelancers with a verified identity can offer services.
                  It takes a few minutes: a photo of your government ID and a quick face scan.
                </p>
                <Link to="/dashboard/verify-identity" className="btn btn-gradient-orange rounded-pill px-4 fw-bold text-white">
                  <i className="bi bi-patch-check me-1"></i> Verify now
                </Link>
              </div>
            )}

            {isVerified && (
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
                  <label className="form-label text-white fw-semibold fs-7">Upload photos or videos for a slideshow (optional):</label>
                  <SlidePicker
                    items={slideItems}
                    onAdd={handleAddSlides}
                    onRemove={handleRemoveSlide}
                    hint={SLIDE_HINT}
                    error={slidesError}
                    disabled={submitting}
                  />
                </div>

                <div className="d-flex justify-content-end pt-2">
                  <button type="submit" className="btn btn-gradient-orange btn-lg px-5 py-2 rounded-pill fw-bold text-white shadow-glow" disabled={submitting}>
                    {submitting ? progress || "Publishing..." : "Upload & Publish"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="col-lg-4">
          <div className="glass-card rounded-4 p-4 border border-secondary border-opacity-25">
            <h5 className="text-white fw-bold mb-3"><i className="bi bi-grid-fill text-warning me-2"></i> Your Active Services</h5>

            {services === null && <p className="text-secondary fs-7 mb-0">Loading...</p>}
            {services !== null && services.length === 0 && <p className="text-secondary fs-7 mb-0">You haven't posted a service yet.</p>}
            {isVerified === false && services?.length > 0 && (
              <p className="text-warning fs-8 mb-3">
                <i className="bi bi-eye-slash me-1"></i>Clients can't see these until your identity is verified.
              </p>
            )}

            <div className="d-flex flex-column gap-3">
              {services?.map((s) => <ServiceCard key={s.id} service={s} />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
