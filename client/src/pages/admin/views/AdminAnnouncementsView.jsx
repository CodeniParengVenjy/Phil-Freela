import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { announcementAudiences, audienceLabel } from "../../../lib/announcements";

const emptyForm = { title: "", message: "", audience: "all" };

export default function AdminAnnouncementsView() {
  const { adminId, adminName } = useOutletContext();
  const [announcements, setAnnouncements] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, message, audience, created_at, author:admins!announcements_created_by_fkey(full_name)")
        .order("created_at", { ascending: false });

      if (!active) return;
      if (error) {
        setLoadError("Failed to load announcements.");
        return;
      }
      setAnnouncements(data);
    })();

    return () => { active = false; };
  }, []);

  const updateField = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  // Posts the announcement. The "admins can post announcements" database
  // rule only allows this for admins, recorded as themselves.
  const handlePost = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    const text = form.message.trim();
    if (!title || !text) {
      setMessage({ text: "Please enter a title and a message.", type: "error" });
      return;
    }

    setPosting(true);
    const { data, error } = await supabase
      .from("announcements")
      .insert({ title, message: text, audience: form.audience, created_by: adminId })
      .select("id, title, message, audience, created_at")
      .single();
    setPosting(false);

    if (error) {
      setMessage({ text: "Couldn't post the announcement.", type: "error" });
      return;
    }

    setAnnouncements((prev) => [{ ...data, author: { full_name: adminName } }, ...(prev || [])]);
    setForm(emptyForm);
    setMessage({ text: `Announcement sent to ${audienceLabel(form.audience).toLowerCase()}.`, type: "success" });
  };

  const handleDelete = async (announcement) => {
    if (!window.confirm(`Delete "${announcement.title}"? Users will no longer see it.`)) return;

    // .select("id") returns the deleted row, so an empty result means
    // nothing was deleted.
    const { data, error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", announcement.id)
      .select("id");
    if (error || !data?.length) {
      setMessage({ text: "Couldn't delete the announcement.", type: "error" });
      return;
    }

    setAnnouncements((prev) => prev.filter((a) => a.id !== announcement.id));
    setMessage({ text: "Announcement deleted.", type: "success" });
  };

  return (
    <section>
      <h1 className="h4 fw-bold mb-3">Announcements</h1>

      <form className="admin-card rounded-4 p-3 p-md-4 mb-4" noValidate onSubmit={handlePost}>
        <h2 className="h6 fw-bold text-white mb-3">New Announcement</h2>
        <div className="row g-3">
          <div className="col-12 col-md-8">
            <label htmlFor="announcementTitle" className="form-label text-white-50 fs-7 mb-1">Title</label>
            <input id="announcementTitle" type="text" className="form-control admin-input" maxLength={120} value={form.title} onChange={updateField("title")} required />
          </div>
          <div className="col-12 col-md-4">
            <label htmlFor="announcementAudience" className="form-label text-white-50 fs-7 mb-1">Send To</label>
            <select id="announcementAudience" className="form-select admin-input" value={form.audience} onChange={updateField("audience")}>
              {announcementAudiences.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <label htmlFor="announcementMessage" className="form-label text-white-50 fs-7 mb-1">Message</label>
            <textarea id="announcementMessage" className="form-control admin-input" rows={4} maxLength={1000} value={form.message} onChange={updateField("message")} required />
            <div className="text-white-50 fs-8 text-end mt-1">{form.message.length}/1000</div>
          </div>
        </div>
        <button type="submit" className="btn btn-admin-orange rounded-pill px-4 fw-bold mt-2" disabled={posting}>
          <i className="bi bi-megaphone-fill me-1"></i> {posting ? "Posting..." : "Post Announcement"}
        </button>
      </form>

      {message.text && (
        <p className={`admin-message ${message.type} fs-7 fw-semibold`} aria-live="polite">{message.text}</p>
      )}

      <h2 className="h6 fw-bold text-white mb-3">Sent Announcements</h2>

      {loadError && <div className="admin-card rounded-4 p-4 text-center text-white-50">{loadError}</div>}
      {!loadError && announcements === null && <div className="admin-card rounded-4 p-4 text-center text-white-50">Loading announcements...</div>}
      {!loadError && announcements?.length === 0 && (
        <div className="admin-card rounded-4 p-4 text-center text-white-50">
          <i className="bi bi-megaphone fs-1 d-block mb-2"></i>
          No announcements yet.
        </div>
      )}

      <div className="d-flex flex-column gap-3">
        {announcements?.map((announcement) => (
          <div key={announcement.id} className="admin-card rounded-4 p-3 p-md-4">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              <span className="badge admin-badge-orange fw-normal">{audienceLabel(announcement.audience)}</span>
              <span className="text-white-50 fs-8 ms-auto">{new Date(announcement.created_at).toLocaleString()}</span>
            </div>
            <h3 className="h6 fw-bold text-white mb-1 admin-description">{announcement.title}</h3>
            <p className="fs-7 text-white mb-2 admin-description">{announcement.message}</p>
            <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
              <span className="fs-8 text-white-50">Posted by {announcement.author?.full_name || "a removed admin"}</span>
              <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(announcement)}>
                <i className="bi bi-trash"></i> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
