import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { ID_TYPES, aiSuggestion, suggestionBadgeClass, suggestionLabels } from "../../../lib/verification";
import AiSummaryCard from "../components/AiSummaryCard";

const statusTabs = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" }
];

// Quick reasons for rejecting. The user sees the reason, plus the note if any.
const rejectReasons = [
  "The photo is blurry or hard to read",
  "The face doesn't match the ID",
  "The ID looks edited or fake",
  "The ID is expired",
  "Other"
];

// Private links to the photos stop working after 5 minutes.
const PHOTO_LINK_SECONDS = 300;

const idTypeLabel = (value) => ID_TYPES.find((t) => t.value === value)?.label || value;

// The photos of one verification, in the order they're shown.
function photoList(v) {
  return [
    { key: "id", label: v.id_type === "passport" ? "Passport photo page" : "Front of ID", path: v.id_photo_path },
    { key: "selfie", label: "Face scan: straight", path: v.selfie_path },
    v.id_back_path && { key: "back", label: "Back of ID", path: v.id_back_path },
    { key: "left", label: "Face scan: turned", path: v.selfie_left_path },
    { key: "right", label: "Face scan: turned", path: v.selfie_right_path }
  ].filter(Boolean);
}

export default function AdminVerificationsView() {
  const { adminId, refreshPendingVerifications } = useOutletContext();
  const [verifications, setVerifications] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [activeStatus, setActiveStatus] = useState("pending");
  const [message, setMessage] = useState({ text: "", type: "" });
  // The one request opened for review, and its photo links (path -> link).
  const [openId, setOpenId] = useState(null);
  const [photoUrls, setPhotoUrls] = useState({});
  const [photoError, setPhotoError] = useState("");
  // The open Approve/Reject pop-up: { kind, verification } (null = closed).
  const [action, setAction] = useState(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("identity_verifications")
      .select("id, user_id, id_type, id_photo_path, id_back_path, selfie_path, selfie_left_path, selfie_right_path, face_match, face_distance, liveness_passed, status, admin_note, reviewed_at, created_at, user:profiles!identity_verifications_user_id_fkey(full_name, username), reviewer:admins!identity_verifications_reviewed_by_fkey(full_name)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError("Failed to load verifications.");
        else setVerifications(data);
      });
    return () => { active = false; };
  }, []);

  // Makes short-lived private links for the opened request's photos. The
  // bucket is private: only admins can make these links (database rule).
  useEffect(() => {
    const opened = (verifications || []).find((v) => v.id === openId);
    if (!opened) return undefined;
    let active = true;

    const paths = photoList(opened).map((p) => p.path);
    supabase.storage
      .from("verification-docs")
      .createSignedUrls(paths, PHOTO_LINK_SECONDS)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setPhotoError("Couldn't load the photos.");
          return;
        }
        setPhotoError("");
        setPhotoUrls(Object.fromEntries(data.map((item) => [item.path, item.signedUrl])));
      });

    return () => { active = false; };
  }, [openId, verifications]);

  const countFor = (status) => (verifications || []).filter((v) => v.status === status).length;
  // Pending requests oldest first (first come, first served); the rest newest first.
  const visible = (verifications || [])
    .filter((v) => v.status === activeStatus)
    .sort((a, b) => (activeStatus === "pending" ? 1 : -1) * (new Date(a.created_at) - new Date(b.created_at)));

  const toggleOpen = (id) => {
    setPhotoUrls({});
    setPhotoError("");
    setOpenId((current) => (current === id ? null : id));
  };

  const openAction = (kind, verification) => {
    setAction({ kind, verification });
    setReason("");
    setNote("");
    setMessage({ text: "", type: "" });
  };

  // Approves or rejects. The "admins can review verifications" database rule
  // only allows this for admins, recorded as themselves, and only these
  // review fields can change (never the AI results or the photos).
  const confirmAction = async (event) => {
    event.preventDefault();
    const { kind, verification } = action;
    const status = kind === "approve" ? "approved" : "rejected";
    const extra = note.trim();
    // The user sees this reason on their Verify Identity page.
    const adminNote = kind === "reject" ? (extra ? `${reason}: ${extra}` : reason) : null;
    if (kind === "reject" && !reason) return;

    setBusy(true);
    const reviewedAt = new Date().toISOString();
    const { error } = await supabase
      .from("identity_verifications")
      .update({ status, admin_note: adminNote, reviewed_by: adminId, reviewed_at: reviewedAt })
      .eq("id", verification.id);
    setBusy(false);
    setAction(null);

    if (error) {
      setMessage({ text: "Couldn't update the verification.", type: "error" });
      return;
    }
    setVerifications((prev) => prev.map((v) => (v.id === verification.id
      ? { ...v, status, admin_note: adminNote, reviewed_at: reviewedAt, reviewer: { full_name: "You" } }
      : v)));
    setOpenId(null);
    setMessage({
      text: kind === "approve"
        ? `${verification.user?.full_name || "The user"} is now verified.`
        : `Verification rejected. ${verification.user?.full_name || "The user"} will see the reason and can try again.`,
      type: "success"
    });
    // Update the number on the sidebar's Verifications link.
    await refreshPendingVerifications();
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-3">Identity Verifications</h1>

      <div className="d-flex flex-wrap gap-2 mb-3">
        {statusTabs.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm rounded-pill px-3 fw-bold ${activeStatus === t.key ? "btn-admin-orange" : "btn-outline-light"}`}
            onClick={() => { setActiveStatus(t.key); setOpenId(null); setMessage({ text: "", type: "" }); }}
          >
            {t.label} <span className="ms-1 opacity-75">({verifications ? countFor(t.key) : "…"})</span>
          </button>
        ))}
      </div>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      {loadError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{loadError}</div>}
      {!loadError && verifications === null && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading verifications...</div>}
      {!loadError && verifications !== null && visible.length === 0 && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50">
          <i className="bi bi-person-vcard fs-1 d-block mb-2"></i>
          No {activeStatus} verifications.
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {visible.map((v) => {
          const suggestion = aiSuggestion(v);
          const isOpen = openId === v.id;

          return (
            <div key={v.id} className="admin-card rounded-4 p-3 p-md-4">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span className="badge admin-badge-orange fw-normal">{idTypeLabel(v.id_type)}</span>
                <span className={`badge fw-normal ${suggestionBadgeClass[suggestion.level]}`}>
                  {suggestion.icon} AI: {suggestionLabels[suggestion.level]}
                </span>
                <span className="text-white-50 fs-8 ms-auto">{new Date(v.created_at).toLocaleString()}</span>
              </div>

              <h2 className="h6 fw-bold text-white mb-1">
                {v.user ? <>{v.user.full_name} <span className="text-white-50 fw-normal">(@{v.user.username})</span></> : <span className="text-white-50 fst-italic">(deleted user)</span>}
              </h2>

              {v.status !== "pending" && (
                <p className="fs-8 text-white-50 mb-0">
                  <i className={`bi ${v.status === "approved" ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} me-1`}></i>
                  {v.status === "approved" ? "Approved" : "Rejected"} by {v.reviewer?.full_name || "an admin"}
                  {v.reviewed_at && ` on ${new Date(v.reviewed_at).toLocaleDateString()}`}
                  {v.admin_note && ` — ${v.admin_note}`}
                </p>
              )}

              <button className="btn btn-outline-light btn-sm mt-2" onClick={() => toggleOpen(v.id)}>
                <i className={`bi ${isOpen ? "bi-chevron-up" : "bi-eye"} me-1`}></i> {isOpen ? "Hide" : "Review"}
              </button>

              {isOpen && (
                <div className="mt-3 d-flex flex-column gap-3">
                  {photoError && <p className="admin-message error fs-7 mb-0">{photoError}</p>}
                  {/* The ID front next to the straight face scan, for comparing faces. */}
                  <div className="row g-2">
                    {photoList(v).map((photo, index) => (
                      <div key={photo.key} className={index < 2 ? "col-6" : "col-6 col-md-4"}>
                        <div className="bg-black rounded-3 overflow-hidden d-flex align-items-center justify-content-center" style={{ height: index < 2 ? 260 : 170 }}>
                          {photoUrls[photo.path] ? (
                            <a href={photoUrls[photo.path]} target="_blank" rel="noreferrer" title="Open full size">
                              <img src={photoUrls[photo.path]} alt={photo.label} style={{ maxWidth: "100%", maxHeight: index < 2 ? 260 : 170, objectFit: "contain" }} />
                            </a>
                          ) : (
                            <span className="text-white-50 fs-8">Loading...</span>
                          )}
                        </div>
                        <p className="text-white-50 fs-8 mb-0 mt-1">{photo.label}</p>
                      </div>
                    ))}
                  </div>

                  <AiSummaryCard verification={v} />

                  {v.status === "pending" && (
                    <div className="d-flex flex-wrap gap-2">
                      <button className="btn btn-success btn-sm fw-bold" onClick={() => openAction("approve", v)}>
                        <i className="bi bi-check-lg"></i> Approve
                      </button>
                      <button className="btn btn-outline-danger btn-sm fw-bold" onClick={() => openAction("reject", v)}>
                        <i className="bi bi-x-lg"></i> Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* One pop-up for Approve and Reject. */}
      {action && (
        <div className="admin-modal-backdrop" onClick={() => !busy && setAction(null)}>
          <form className="admin-card admin-modal rounded-4 p-4" onClick={(e) => e.stopPropagation()} onSubmit={confirmAction}>
            <h2 className="h5 fw-bold text-white mb-1">
              {action.kind === "approve" ? "Approve verification" : "Reject verification"}
              {action.verification.user && ` — ${action.verification.user.full_name}`}
            </h2>

            {action.kind === "approve" ? (
              <p className="text-secondary fs-7 mb-3">They'll get the Verified badge on their profile. Make sure the ID looks real and matches the face scan.</p>
            ) : (
              <>
                <p className="text-secondary fs-7 mb-3">The user will see the reason and can send new photos.</p>
                <label htmlFor="rejectReason" className="form-label text-white-50 fs-7 mb-1">Reason (shown to the user)</label>
                <select id="rejectReason" className="form-select admin-input mb-3" value={reason} onChange={(e) => setReason(e.target.value)} required>
                  <option value="" disabled>Choose a reason</option>
                  {rejectReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <label htmlFor="rejectNote" className="form-label text-white-50 fs-7 mb-1">
                  {reason === "Other" ? "Explain (required)" : "Extra note (optional)"}
                </label>
                <textarea
                  id="rejectNote"
                  className="form-control admin-input mb-3"
                  rows={3}
                  maxLength={400}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  required={reason === "Other"}
                />
              </>
            )}

            <div className="d-flex justify-content-end gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => setAction(null)} disabled={busy}>
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${action.kind === "approve" ? "btn-success" : "btn-danger"} btn-sm rounded-pill px-3 fw-bold`}
                disabled={busy || (action.kind === "reject" && (!reason || (reason === "Other" && !note.trim())))}
              >
                {action.kind === "approve" ? "Approve" : "Reject"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
