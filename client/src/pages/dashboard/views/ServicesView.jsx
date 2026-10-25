import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { categories } from "../../../lib/categories";
import { skillOptions } from "../../../lib/serviceSkills";
import { fetchIsVerified } from "../../../lib/verification";
import { useServiceRatings } from "../../../lib/useServiceRatings";
import { SLIDE_ACCEPT_WITH_DOCUMENTS, SLIDE_HINT_WITH_DOCUMENTS, SLIDES_SELECT, addPickedFiles, ownershipPassedMessage, underReviewMessage, uploadSlides } from "../../../lib/slides";
import SlidePicker from "../components/SlidePicker";
import { useFeatureStatus } from "../../../lib/featured";
import ServiceCard from "../components/ServiceCard";
import FeatureControl from "../components/FeatureControl";
import FeatureDialog from "../components/FeatureDialog";
import DeletePostDialog from "../components/DeletePostDialog";
import BlockedNotice from "../components/BlockedNotice";
import OwnershipCheckDialog from "../components/OwnershipCheckDialog";
import { isPostingBlocked } from "../../../lib/suspensions";

// description and skill are here so the Edit form can be filled in from the list.
const SERVICE_COLUMNS = "id, title, category, description, skill, price, image_url, media_type, created_at, updated_at";

export default function ServicesView() {
  const { currentUserId, showToast, suspension } = useOutletContext();
  // Suspended for a posting violation (e.g. spam): the form is replaced by a notice.
  const postingBlocked = isPostingBlocked(suspension);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [skill, setSkill] = useState("");
  const [price, setPrice] = useState("");
  // The photos and videos picked for the slideshow: [{ key, file }].
  const [slideItems, setSlideItems] = useState([]);
  const [slidesError, setSlidesError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // "Checking ownership: 2 of 5..." while the slides are being sent.
  const [progress, setProgress] = useState("");
  const [services, setServices] = useState(null);
  // The service waiting in the "Delete this service?" pop-up (null = closed).
  const [serviceToDelete, setServiceToDelete] = useState(null);
  // Which offers are Featured now or have a payment waiting, and the offer in
  // the "Feature this post" pay window (null = closed).
  const featured = useFeatureStatus(currentUserId);
  const [serviceToFeature, setServiceToFeature] = useState(null);
  // What clients rated each of your offers, for the "★ 4.5 (2)" on its row.
  const ratings = useServiceRatings((services || []).map((s) => s.id));
  // Only freelancers with a verified identity can offer services (the
  // database enforces this too). null while checking.
  const [isVerified, setIsVerified] = useState(null);
  // The "Check a file I found" popup (Check Ownership).
  const [checkingOwnership, setCheckingOwnership] = useState(false);

  // Edit mode: /dashboard/services?edit=<service id> (the pencil buttons link
  // here). The form is filled in from that service and "Save changes" updates
  // it instead of posting a new one. Only your own services are in the list,
  // so someone else's id finds nothing and the form stays the normal one.
  const [searchParams, setSearchParams] = useSearchParams();
  const editId = searchParams.get("edit");
  const editing = (editId && services?.find((s) => s.id === editId)) || null;
  const formTop = useRef(null);
  // Which service the form was last filled in from.
  const [filledFromId, setFilledFromId] = useState(null);
  if (editing && filledFromId !== editing.id) {
    // Filled in while rendering (React allows this for state of this same
    // component), so the form never shows the old text for a moment.
    setFilledFromId(editing.id);
    setTitle(editing.title);
    setCategory(editing.category);
    setDescription(editing.description);
    setSkill(editing.skill || "");
    setPrice(editing.price ? String(editing.price) : "");
    setSlideItems([]);
    setSlidesError("");
  } else if (!editing && filledFromId) {
    // Edit mode ended (the address no longer has ?edit=), so the same service can be edited again later.
    setFilledFromId(null);
  }

  // Bring the form into view when edit mode starts (it is above the list on a phone).
  useEffect(() => {
    if (filledFromId) formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [filledFromId]);

  // Leaves edit mode and empties the form (Cancel, or after saving).
  const stopEditing = () => {
    setTitle("");
    setCategory("");
    setDescription("");
    setSkill("");
    setPrice("");
    setSearchParams({}, { replace: true });
  };

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
    // Services also take documents (PDF, DOCX, TXT; step 8).
    const result = await addPickedFiles(slideItems, files, true);
    setSlideItems(result.items);
    setSlidesError(result.error);
  };

  const handleRemoveSlide = (key) => {
    setSlideItems((prev) => prev.filter((item) => item.key !== key));
    setSlidesError("");
  };

  // Protected <-> Promo. A promo (an ad, like "Are you looking for a video
  // editor?") gets no visible watermark; it still gets the invisible code.
  const handleTogglePromo = (key) => {
    setSlideItems((prev) => prev.map((item) => (item.key === key ? { ...item, promo: !item.promo } : item)));
  };

  // Edit mode: saves the changed text of the service being edited. Its photos,
  // videos and documents are left as they are.
  const handleSaveEdit = async () => {
    setSubmitting(true);
    // .single() fails when no row was updated (for example when the database
    // refuses because the account is blocked from posting), so that is an error here too.
    const { data, error } = await supabase
      .from("services")
      .update({
        title: title.trim(),
        category,
        description: description.trim(),
        skill: skill || null,
        price: price ? Number(price) : null
      })
      .eq("id", editing.id)
      .select(SERVICE_COLUMNS)
      .single();
    setSubmitting(false);

    if (error) {
      showToast("Couldn't save your changes. Please try again.");
      return;
    }
    // Keep the slides the list already had; the update only returns the columns.
    setServices((prev) => prev.map((s) => (s.id === data.id ? { ...s, ...data } : s)));
    stopEditing();
    showToast(`"${data.title}" was updated.`);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!currentUserId) return;
    if (editing) {
      await handleSaveEdit();
      return;
    }
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

    // 2. Send the photos, videos and documents one at a time through the AI service.
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

    // Files held back for an admin (steps 5-9), and how many passed the
    // ownership check that ran on each one as it was uploaded.
    const heldBack = underReviewMessage(slides);
    const passed = ownershipPassedMessage(slides);
    if (failed.length) {
      setSlidesError(`Your service is live, but ${failed.length === 1 ? "1 file" : `${failed.length} files`} couldn't be added. ${failed.join(" ")} ${heldBack}`.trim());
      showToast([`"${service.title}" is live, but some files couldn't be added.`, passed].filter(Boolean).join(" "));
    } else {
      setSlidesError(heldBack);
      const live = heldBack ? `"${service.title}" is live.` : `Your new service "${service.title}" is live!`;
      showToast([live, passed, heldBack].filter(Boolean).join(" "));
    }
  };

  return (
    <section className="dashboard-view active-view">
      <div className="row g-4">
        <div className="col-lg-8">
          <div ref={formTop} className="glass-card rounded-4 p-4 p-md-5 border border-secondary border-opacity-25">
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
              <h3 className="text-white fw-bold mb-0">
                <i className={`bi ${editing ? "bi-pencil-square" : "bi-plus-circle"} text-orange me-2`}></i> {editing ? "Edit Your Service" : "Post a Service Offered"}
              </h3>
              <button type="button" className="btn btn-sm btn-outline-info rounded-pill px-3 fs-8 fw-bold" onClick={() => setCheckingOwnership(true)}>
                <i className="bi bi-shield-check me-1"></i> Check a file I found
              </button>
            </div>

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

            {isVerified && postingBlocked && <BlockedNotice suspension={suspension} what="post services" />}

            {isVerified && !postingBlocked && (
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
                  <small className="text-secondary fs-8 d-block mt-1">Bad words are hidden automatically.</small>
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

                {editing && (
                  <p className="text-secondary fs-8 mb-0">
                    <i className="bi bi-images text-info me-1"></i>The photos, videos and documents of this service stay as they are.
                  </p>
                )}

                {!editing && (
                <div>
                  <label className="form-label text-white fw-semibold fs-7">Upload photos, videos or documents for a slideshow (optional):</label>
                  <SlidePicker
                    items={slideItems}
                    onAdd={handleAddSlides}
                    onRemove={handleRemoveSlide}
                    onTogglePromo={handleTogglePromo}
                    hint={SLIDE_HINT_WITH_DOCUMENTS}
                    error={slidesError}
                    disabled={submitting}
                    accept={SLIDE_ACCEPT_WITH_DOCUMENTS}
                    addLabel="Add photos, videos or documents"
                  />
                  {slideItems.length > 0 && (
                    <p className="text-secondary fs-8 mb-0 mt-1">
                      <i className="bi bi-shield-check text-info me-1"></i>Protected files get your watermark (Settings &gt; Watermark Settings).
                      Tap it to switch a file to <strong className="text-warning">Promo</strong> if it's an ad, like "Are you looking for a video editor?".
                    </p>
                  )}
                </div>
                )}

                <div className="d-flex flex-wrap justify-content-end gap-2 pt-2">
                  {editing && (
                    <button type="button" className="btn btn-outline-secondary text-white-50 btn-lg px-4 py-2 rounded-pill fw-bold" disabled={submitting} onClick={stopEditing}>
                      Cancel
                    </button>
                  )}
                  <button type="submit" className="btn btn-gradient-orange btn-lg px-5 py-2 rounded-pill fw-bold text-white shadow-glow" disabled={submitting}>
                    {editing ? (submitting ? "Saving..." : "Save changes") : submitting ? progress || "Publishing..." : "Upload & Publish"}
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
              {services?.map((s) => (
                <ServiceCard
                  key={s.id}
                  service={s}
                  editTo={`/dashboard/services?edit=${s.id}`}
                  onDelete={setServiceToDelete}
                  rating={ratings.get(s.id)}
                  footer={(
                    <FeatureControl
                      until={featured.until.get(s.id)}
                      waiting={featured.waiting.has(s.id)}
                      // Clients only see offers from verified freelancers, so featuring one before that is a waste.
                      canFeature={isVerified === true && !postingBlocked}
                      onFeature={() => setServiceToFeature({ kind: "service", id: s.id, title: s.title })}
                    />
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {checkingOwnership && <OwnershipCheckDialog onClose={() => setCheckingOwnership(false)} />}

      {serviceToFeature && (
        <FeatureDialog
          target={serviceToFeature}
          userId={currentUserId}
          until={featured.until.get(serviceToFeature.id)}
          onClose={() => setServiceToFeature(null)}
          onSent={() => {
            setServiceToFeature(null);
            featured.reload();
            showToast("Payment sent. An admin will check it, and you'll get a notification.");
          }}
        />
      )}

      <DeletePostDialog
        key={serviceToDelete?.id}
        kind="service"
        post={serviceToDelete}
        showToast={showToast}
        onCancel={() => setServiceToDelete(null)}
        onDeleted={(service) => {
          setServices((prev) => prev.filter((s) => s.id !== service.id));
          setServiceToDelete(null);
          // Deleting the one being edited also closes its form.
          if (service.id === editing?.id) stopEditing();
        }}
      />
    </section>
  );
}
