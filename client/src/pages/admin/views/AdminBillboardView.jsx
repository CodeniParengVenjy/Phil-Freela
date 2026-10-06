import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { announcementAudiences, audienceLabel } from "../../../lib/announcements";
import {
  BILLBOARD_PICTURE_ACCEPT, MAX_BILLBOARD_MESSAGE, MAX_BILLBOARD_TITLE,
  billboardImageUrl, checkBillboardPicture, deleteBillboard, getAllBillboards, postBillboard, setBillboardActive
} from "../../../lib/billboards";

const emptyForm = { title: "", message: "", audience: "all" };

// Admin panel > Billboard: what shows on the board at the top of users'
// dashboards (a welcome message or an advertisement). An admin posts one with
// a headline, an optional message and picture, for everyone or one account
// type, and can switch it off or delete it later. The database rules only
// allow admins to do any of this (database/supabase_billboard_schema.sql).
export default function AdminBillboardView() {
  const { adminId, adminName } = useOutletContext();
  const [billboards, setBillboards] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(emptyForm);
  // The picked picture and a temporary link to preview it (both null = none).
  const [picture, setPicture] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const pictureInputRef = useRef(null);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [posting, setPosting] = useState(false);
  // The id of the billboard being switched or deleted, so its buttons wait.
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let active = true;
    getAllBillboards().then(({ data, error }) => {
      if (!active) return;
      if (error) setLoadError("Failed to load billboards.");
      else setBillboards(data);
    });
    return () => { active = false; };
  }, []);

  // Frees the preview's memory whenever it's replaced or the page closes.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const updateField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const clearPicture = () => {
    setPicture(null);
    setPreviewUrl(null);
  };

  const handlePicturePick = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // lets the same file be picked again later
    if (!file) return;
    const problem = checkBillboardPicture(file);
    if (problem) {
      setMessage({ text: problem, type: "error" });
      return;
    }
    setMessage({ text: "", type: "" });
    setPicture(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handlePost = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setMessage({ text: "Please enter a headline.", type: "error" });
      return;
    }

    setPosting(true);
    const { billboard, error } = await postBillboard(adminId, { title, message: form.message.trim(), audience: form.audience, picture });
    setPosting(false);
    if (error) {
      setMessage({ text: error, type: "error" });
      return;
    }

    setBillboards((prev) => [{ ...billboard, author: { full_name: adminName } }, ...(prev || [])]);
    setForm(emptyForm);
    clearPicture();
    setMessage({ text: `Billboard posted for ${audienceLabel(billboard.audience).toLowerCase()}. It's on their dashboard now.`, type: "success" });
  };

  const handleSwitch = async (billboard) => {
    const turnOn = !billboard.is_active;
    setBusyId(billboard.id);
    const saved = await setBillboardActive(billboard.id, turnOn);
    setBusyId(null);
    if (!saved) {
      setMessage({ text: "Couldn't change that billboard.", type: "error" });
      return;
    }
    setBillboards((prev) => prev.map((b) => (b.id === billboard.id ? { ...b, is_active: turnOn } : b)));
    setMessage({ text: turnOn ? "Billboard switched on." : "Billboard switched off. Users no longer see it.", type: "success" });
  };

  const handleDelete = async (billboard) => {
    if (!window.confirm(`Delete "${billboard.title}"? Users will no longer see it.`)) return;
    setBusyId(billboard.id);
    const deleted = await deleteBillboard(billboard);
    setBusyId(null);
    if (!deleted) {
      setMessage({ text: "Couldn't delete the billboard.", type: "error" });
      return;
    }
    setBillboards((prev) => prev.filter((b) => b.id !== billboard.id));
    setMessage({ text: "Billboard deleted.", type: "success" });
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-1">Billboard</h1>
      <p className="text-white-50 fs-7 mb-3">
        The board at the top of users' dashboards. Post a welcome message or an advertisement. When more than one is on, the newest five take turns.
      </p>

      <form className="admin-card rounded-4 p-3 p-md-4 mb-4" noValidate onSubmit={handlePost}>
        <h2 className="h6 fw-bold text-white mb-3">New Billboard</h2>
        <div className="row g-3">
          <div className="col-12 col-md-8">
            <label htmlFor="billboardTitle" className="form-label text-white-50 fs-7 mb-1">Headline</label>
            <input id="billboardTitle" type="text" className="form-control admin-input" maxLength={MAX_BILLBOARD_TITLE} value={form.title} onChange={updateField("title")} required />
          </div>
          <div className="col-12 col-md-4">
            <label htmlFor="billboardAudience" className="form-label text-white-50 fs-7 mb-1">Show To</label>
            <select id="billboardAudience" className="form-select admin-input" value={form.audience} onChange={updateField("audience")}>
              {announcementAudiences.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <label htmlFor="billboardMessage" className="form-label text-white-50 fs-7 mb-1">Message (optional)</label>
            <textarea id="billboardMessage" className="form-control admin-input" rows={3} maxLength={MAX_BILLBOARD_MESSAGE} value={form.message} onChange={updateField("message")} />
            <div className="text-white-50 fs-8 text-end mt-1">{form.message.length}/{MAX_BILLBOARD_MESSAGE}</div>
          </div>
          <div className="col-12">
            <span className="form-label d-block text-white-50 fs-7 mb-1">Picture (optional)</span>
            <input ref={pictureInputRef} type="file" className="d-none" accept={BILLBOARD_PICTURE_ACCEPT} onChange={handlePicturePick} aria-label="Billboard picture" />
            {/* Shown the way users will see it: wide, with the edges trimmed to fit. */}
            {previewUrl && <img src={previewUrl} alt="How the picture will look on the dashboard" className="admin-billboard-preview mb-2" />}
            <div className="d-flex flex-wrap align-items-center gap-2">
              <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => pictureInputRef.current?.click()} disabled={posting}>
                <i className="bi bi-image me-1"></i> {picture ? "Change picture" : "Choose a picture"}
              </button>
              {picture && (
                <button type="button" className="btn btn-outline-danger btn-sm rounded-pill px-3" onClick={clearPicture} disabled={posting}>
                  <i className="bi bi-x-lg me-1"></i> Remove
                </button>
              )}
              <span className="text-white-50 fs-8">A wide picture works best (about 4 times wider than it is tall). JPG, PNG or WebP, up to 10 MB.</span>
            </div>
          </div>
        </div>
        <button type="submit" className="btn btn-admin-orange rounded-pill px-4 fw-bold mt-3" disabled={posting}>
          <i className="bi bi-easel2-fill me-1"></i> {posting ? "Posting..." : "Post Billboard"}
        </button>
      </form>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      <h2 className="h6 fw-bold text-white mb-3">Posted Billboards</h2>

      {loadError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{loadError}</div>}
      {!loadError && billboards === null && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading billboards...</div>}
      {!loadError && billboards?.length === 0 && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50">
          <i className="bi bi-easel2 fs-1 d-block mb-2"></i>
          No billboards yet. Users see the usual welcome on their dashboard.
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {billboards?.map((billboard) => (
          <div key={billboard.id} className="admin-card rounded-4 p-3 p-md-4">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              <span className="badge admin-badge-orange fw-normal">{audienceLabel(billboard.audience)}</span>
              <span className={`badge fw-normal ${billboard.is_active ? "bg-success" : "bg-secondary"}`}>{billboard.is_active ? "On" : "Off"}</span>
              <span className="text-white-50 fs-8 ms-auto">{new Date(billboard.created_at).toLocaleString()}</span>
            </div>
            {billboard.image_path && <img src={billboardImageUrl(billboard.image_path)} alt="" className="admin-billboard-preview mb-2" />}
            <h3 className="h6 fw-bold text-white mb-1 admin-description">{billboard.title}</h3>
            {billboard.message && <p className="fs-7 text-white mb-2 admin-description">{billboard.message}</p>}
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <span className="fs-8 text-white-50">Posted by {billboard.author?.full_name || "a removed admin"}</span>
              <div className="d-flex flex-wrap gap-2">
                <button className="btn btn-outline-light btn-sm" onClick={() => handleSwitch(billboard)} disabled={busyId === billboard.id}>
                  <i className={`bi ${billboard.is_active ? "bi-eye-slash" : "bi-eye"}`}></i> {billboard.is_active ? "Switch off" : "Switch on"}
                </button>
                <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(billboard)} disabled={busyId === billboard.id}>
                  <i className="bi bi-trash"></i> Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
