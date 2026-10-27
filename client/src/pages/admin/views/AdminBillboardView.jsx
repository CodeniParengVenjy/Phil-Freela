import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { announcementAudiences, audienceLabel } from "../../../lib/announcements";
import {
  BILLBOARD_PICTURE_ACCEPT, MAX_BILLBOARD_MESSAGE, MAX_BILLBOARD_SPONSOR, MAX_BILLBOARD_TITLE,
  billboardImageUrl, billboardState, checkNewEnd, checkSponsorship, checkBillboardPicture, dayOf, deleteBillboard,
  formatDay, getAllBillboards, getBillboardLinks, lastDayOf, postBillboard, setBillboardActive, setBillboardEnd, todayInManila
} from "../../../lib/billboards";
import { confirmCheckout, onlinePaymentsReady, startBillboardLink } from "../../../lib/checkout";

// payOnline: the sponsor pays through a Xendit link instead of before posting.
const emptyForm = () => ({ title: "", message: "", audience: "all", startDay: todayInManila(), endDay: "", sponsorName: "", amount: "", paymentRef: "", payOnline: false });

// What each state looks like in the list.
const STATE_BADGES = {
  waiting: { label: "Waiting for payment", className: "bg-warning text-dark" },
  running: { label: "Running", className: "bg-success" },
  scheduled: { label: "Scheduled", className: "bg-primary" },
  ended: { label: "Ended", className: "bg-secondary" },
  off: { label: "Off", className: "bg-secondary" }
};

const pesos = (amount) => Number(amount).toLocaleString("en-PH", { style: "currency", currency: "PHP" });

// Admin panel > Billboard: what shows on the board at the top of users'
// dashboards (a welcome message or an advertisement). A super admin posts one
// with a headline, an optional message and picture, for everyone or one
// account type. A business that paid for the space is a "sponsor": its name
// shows on the board, and it runs from a first day to a last day and then
// stops by itself. The admin can switch a billboard off, move its last day
// (to extend a sponsorship) or delete it. The database rules decide who may do
// what (database/supabase_billboard_schema.sql, supabase_promotions_schema.sql).
// A sponsor can also pay online (PLAN-premium.md): the billboard is posted
// with its price and waits, the page makes a Xendit payment link to send to
// the sponsor, and the billboard shows from its first day once Xendit
// confirms the payment (the webhook, or "Check payment" here).
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
  // The billboard whose last day is being changed, and the day typed so far.
  const [editingEnd, setEditingEnd] = useState(null);
  // The newest payment link of each billboard (billboard id -> link).
  const [links, setLinks] = useState(() => new Map());
  // Whether the server can make payment links (null while asking).
  const [online, setOnline] = useState(null);

  useEffect(() => {
    let active = true;
    getAllBillboards().then(({ data, error }) => {
      if (!active) return;
      if (error) setLoadError("Failed to load billboards.");
      else setBillboards(data);
    });
    getBillboardLinks().then((found) => {
      if (active) setLinks(found);
    });
    onlinePaymentsReady().then((ready) => {
      if (active) setOnline(ready);
    });
    return () => { active = false; };
  }, []);

  const setLink = (billboardId, link) => setLinks((prev) => new Map(prev).set(billboardId, link));
  const updateBillboard = (id, changes) => setBillboards((prev) => prev.map((b) => (b.id === id ? { ...b, ...changes } : b)));

  // Makes a payment link for a billboard's sponsor. Returns "" or a message.
  const makeLink = async (billboard) => {
    const result = await startBillboardLink(billboard.id);
    if (result.error) return result.error;
    setLink(billboard.id, { id: result.checkout, status: "open", checkout_url: result.url, amount: billboard.amount, created_at: new Date().toISOString() });
    updateBillboard(billboard.id, { awaiting_payment: true });
    return "";
  };

  const handleMakeLink = async (billboard) => {
    setBusyId(billboard.id);
    const problem = await makeLink(billboard);
    setBusyId(null);
    setMessage(problem
      ? { text: problem, type: "error" }
      : { text: "Payment link made. Copy it and send it to the sponsor; the billboard shows once they pay.", type: "success" });
  };

  const handleCopyLink = async (link) => {
    try {
      await navigator.clipboard.writeText(link.checkout_url);
      setMessage({ text: "Payment link copied. Send it to the sponsor.", type: "success" });
    } catch {
      setMessage({ text: `Couldn't copy the link. Here it is: ${link.checkout_url}`, type: "error" });
    }
  };

  // Asks Xendit whether the sponsor has paid (the webhook usually tells the site by itself).
  const handleCheckLink = async (billboard, link) => {
    setBusyId(billboard.id);
    const result = await confirmCheckout(link.id, { billboard: true });
    setBusyId(null);
    if (result.error) {
      setMessage({ text: result.error, type: "error" });
      return;
    }
    if (result.status === "paid") {
      setLink(billboard.id, { ...link, status: "paid", paid_at: link.paid_at || new Date().toISOString() });
      updateBillboard(billboard.id, { awaiting_payment: false });
      setMessage({ text: `Paid. The billboard shows from ${formatDay(billboard.starts_at)}.`, type: "success" });
    } else if (result.status === "open") {
      setMessage({ text: "Not paid yet. The billboard stays hidden until the sponsor pays.", type: "success" });
    } else {
      setLink(billboard.id, { ...link, status: result.status });
      setMessage({ text: "That payment link has expired. Make a new link to send to the sponsor.", type: "error" });
    }
  };

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
    // The sponsor and the days are checked here first with plain messages
    // (the database repeats the same rules).
    const payOnline = form.payOnline && online === true;
    const sponsorship = checkSponsorship({ ...form, payOnline });
    if (sponsorship.error) {
      setMessage({ text: sponsorship.error, type: "error" });
      return;
    }

    setPosting(true);
    const { billboard, error } = await postBillboard(adminId, {
      title, message: form.message.trim(), audience: form.audience, picture,
      sponsorName: sponsorship.sponsorName, amount: sponsorship.amount, paymentRef: sponsorship.paymentRef,
      startsAt: sponsorship.startsAt, endsAt: sponsorship.endsAt, awaitingPayment: payOnline
    });
    if (error) {
      setPosting(false);
      setMessage({ text: error, type: "error" });
      return;
    }

    setBillboards((prev) => [{ ...billboard, author: { full_name: adminName } }, ...(prev || [])]);
    setForm(emptyForm());
    clearPicture();
    if (payOnline) {
      const problem = await makeLink(billboard);
      setPosting(false);
      setMessage(problem
        ? { text: `Billboard saved, waiting for payment, but the payment link couldn't be made: ${problem} Press "Make payment link" on it to try again.`, type: "error" }
        : { text: "Billboard saved. Copy the payment link below and send it to the sponsor: it shows on the dashboards from its first day once they pay.", type: "success" });
      return;
    }
    setPosting(false);
    const when = sponsorship.startsAt ? `It starts showing on ${formatDay(sponsorship.startsAt)}.` : "It's on their dashboard now.";
    setMessage({ text: `Billboard posted for ${audienceLabel(billboard.audience).toLowerCase()}. ${when}`, type: "success" });
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

  // Saves the last day typed in the card (empty = no end, for a billboard with no sponsor).
  const handleSaveEnd = async (billboard, day) => {
    const checked = checkNewEnd(billboard, day);
    if (checked.error) {
      setMessage({ text: checked.error, type: "error" });
      return;
    }
    setBusyId(billboard.id);
    const saved = await setBillboardEnd(billboard.id, checked.endsAt);
    setBusyId(null);
    if (!saved) {
      setMessage({ text: "Couldn't change the last day.", type: "error" });
      return;
    }
    setBillboards((prev) => prev.map((b) => (b.id === billboard.id ? { ...b, ends_at: checked.endsAt } : b)));
    setEditingEnd(null);
    setMessage({ text: checked.endsAt ? `The last day is now ${formatDay(new Date(checked.endsAt).getTime() - 1)}.` : "The end date was removed.", type: "success" });
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

          {/* The days are whole days in Manila time; the last day is shown in full. */}
          <div className="col-6 col-md-3">
            <label htmlFor="billboardStart" className="form-label text-white-50 fs-7 mb-1">First Day</label>
            <input id="billboardStart" type="date" className="form-control admin-input" min={todayInManila()} value={form.startDay} onChange={updateField("startDay")} />
          </div>
          <div className="col-6 col-md-3">
            <label htmlFor="billboardEnd" className="form-label text-white-50 fs-7 mb-1">Last Day</label>
            <input id="billboardEnd" type="date" className="form-control admin-input" min={form.startDay || todayInManila()} value={form.endDay} onChange={updateField("endDay")} />
          </div>
          <div className="col-12 col-md-6 d-flex align-items-end">
            <span className="text-white-50 fs-8">Required for a sponsor. With no sponsor, leave the last day empty to keep it up until you switch it off.</span>
          </div>

          <div className="col-12">
            <div className="border border-secondary border-opacity-25 rounded-3 p-3">
              <h3 className="h6 fw-bold text-white mb-1">Sponsor (optional)</h3>
              <p className="text-white-50 fs-8 mb-3">For a business that pays to be on the billboard. Users see "Sponsored by" and its name.</p>
              <div className="d-flex flex-wrap gap-3 mb-2" role="radiogroup" aria-label="How the sponsor pays">
                <div className="form-check">
                  <input id="billboardPaidAlready" className="form-check-input" type="radio" name="billboardPay" checked={!form.payOnline} onChange={() => setForm((prev) => ({ ...prev, payOnline: false }))} />
                  <label htmlFor="billboardPaidAlready" className="form-check-label text-white fs-7">Already paid (GCash or cash)</label>
                </div>
                <div className="form-check">
                  <input id="billboardPayLink" className="form-check-input" type="radio" name="billboardPay" checked={form.payOnline} onChange={() => setForm((prev) => ({ ...prev, payOnline: true }))} disabled={online !== true} />
                  <label htmlFor="billboardPayLink" className="form-check-label text-white fs-7">Send a payment link (GCash, Maya or QR Ph on Xendit)</label>
                </div>
              </div>
              <p className="text-white-50 fs-8 mb-3">
                {online === false
                  ? "Payment links need the updated payment server (pro-checkout). Until it is deployed, record a sponsor who already paid."
                  : form.payOnline
                    ? "The billboard is saved with this price and stays hidden until the sponsor pays through the link."
                    : "The amount and the reference are only for your records."}
              </p>
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <label htmlFor="billboardSponsor" className="form-label text-white-50 fs-7 mb-1">Sponsor's Name</label>
                  <input id="billboardSponsor" type="text" className="form-control admin-input" maxLength={MAX_BILLBOARD_SPONSOR} value={form.sponsorName} onChange={updateField("sponsorName")} />
                </div>
                <div className="col-6 col-md-3">
                  <label htmlFor="billboardAmount" className="form-label text-white-50 fs-7 mb-1">{form.payOnline ? "Price (₱)" : "Paid (₱)"}</label>
                  <input id="billboardAmount" type="text" inputMode="decimal" className="form-control admin-input" placeholder="e.g. 2000" value={form.amount} onChange={updateField("amount")} />
                </div>
                {!form.payOnline && (
                  <div className="col-6 col-md-3">
                    <label htmlFor="billboardRef" className="form-label text-white-50 fs-7 mb-1">GCash Reference</label>
                    <input id="billboardRef" type="text" inputMode="numeric" className="form-control admin-input" placeholder="13 digits" maxLength={17} value={form.paymentRef} onChange={updateField("paymentRef")} />
                  </div>
                )}
              </div>
            </div>
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
          <i className="bi bi-easel2-fill me-1"></i> {posting ? "Posting..." : form.payOnline ? "Save and make payment link" : "Post Billboard"}
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
        {billboards?.map((billboard) => {
          const state = billboardState(billboard);
          const badge = STATE_BADGES[state];
          // The dates are worth a line for a sponsor, a billboard with an end, or one that has not started.
          const showDates = billboard.sponsor_name || billboard.ends_at || state === "scheduled";
          const editing = editingEnd?.id === billboard.id ? editingEnd : null;
          // Paid online, or waiting for it: the link line replaces the "Paid" line.
          const link = links.get(billboard.id);
          const byLink = Boolean(link || billboard.awaiting_payment);
          return (
            <div key={billboard.id} className="admin-card rounded-4 p-3 p-md-4">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                <span className="badge admin-badge-orange fw-normal">{audienceLabel(billboard.audience)}</span>
                <span className={`badge fw-normal ${badge.className}`}>{badge.label}</span>
                {/* text-wrap lets a long business name wrap instead of stretching the page on a phone. */}
                {billboard.sponsor_name && <span className="badge bg-info text-dark fw-normal text-wrap text-start mw-100">Sponsored by {billboard.sponsor_name}</span>}
                <span className="text-white-50 fs-8 ms-auto">{new Date(billboard.created_at).toLocaleString()}</span>
              </div>
              {billboard.image_path && <img src={billboardImageUrl(billboard.image_path)} alt="" className="admin-billboard-preview mb-2" />}
              <h3 className="h6 fw-bold text-white mb-1 admin-description">{billboard.title}</h3>
              {billboard.message && <p className="fs-7 text-white mb-2 admin-description">{billboard.message}</p>}
              {showDates && (
                <p className="fs-8 text-white-50 mb-1">
                  <i className="bi bi-calendar-event me-1"></i>
                  From {formatDay(billboard.starts_at)} {billboard.ends_at ? `to ${formatDay(new Date(billboard.ends_at).getTime() - 1)}` : "with no end date"}
                </p>
              )}
              {byLink && (
                <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                  <span className="fs-8 text-white-50">
                    <i className="bi bi-link-45deg me-1"></i>
                    {link?.status === "paid"
                      ? `Paid online ${pesos(link.amount)} on ${formatDay(link.paid_at)}${link.test_mode ? " (test payment)" : ""}`
                      : link?.status === "open"
                        ? `Payment link for ${pesos(link.amount)}, not paid yet`
                        : link
                          ? `The payment link for ${pesos(link.amount)} expired without a payment`
                          : `No payment link yet (price ${billboard.amount ? pesos(billboard.amount) : "not set"})`}
                  </span>
                  {link?.status === "open" && link.checkout_url && (
                    <>
                      <button className="btn btn-outline-light btn-sm" onClick={() => handleCopyLink(link)} disabled={busyId === billboard.id}>
                        <i className="bi bi-clipboard"></i> Copy link
                      </button>
                      <button className="btn btn-outline-light btn-sm" onClick={() => handleCheckLink(billboard, link)} disabled={busyId === billboard.id}>
                        <i className="bi bi-arrow-repeat"></i> Check payment
                      </button>
                    </>
                  )}
                  {billboard.awaiting_payment && link?.status !== "open" && (
                    <button className="btn btn-admin-orange btn-sm" onClick={() => handleMakeLink(billboard)} disabled={busyId === billboard.id || online !== true}>
                      <i className="bi bi-link-45deg"></i> {link ? "Make a new link" : "Make payment link"}
                    </button>
                  )}
                </div>
              )}
              {!byLink && (billboard.amount || billboard.payment_ref) && (
                <p className="fs-8 text-white-50 mb-1">
                  <i className="bi bi-cash-coin me-1"></i>
                  Paid {billboard.amount ? pesos(billboard.amount) : "(amount not recorded)"}{billboard.payment_ref ? ` · GCash reference ${billboard.payment_ref}` : ""}
                </p>
              )}

              {editing && (
                <div className="d-flex flex-wrap align-items-end gap-2 my-2">
                  <div>
                    <label htmlFor={`billboardEnd-${billboard.id}`} className="form-label text-white-50 fs-8 mb-1">New last day</label>
                    <input
                      id={`billboardEnd-${billboard.id}`} type="date" className="form-control admin-input form-control-sm"
                      min={dayOf(billboard.starts_at)}
                      value={editing.day} onChange={(event) => setEditingEnd({ id: billboard.id, day: event.target.value })}
                    />
                  </div>
                  <button className="btn btn-admin-orange btn-sm" onClick={() => handleSaveEnd(billboard, editing.day)} disabled={busyId === billboard.id}>Save</button>
                  <button className="btn btn-outline-light btn-sm" onClick={() => setEditingEnd(null)} disabled={busyId === billboard.id}>Cancel</button>
                  {!billboard.sponsor_name && billboard.ends_at && (
                    <button className="btn btn-outline-light btn-sm" onClick={() => handleSaveEnd(billboard, "")} disabled={busyId === billboard.id}>Remove end date</button>
                  )}
                </div>
              )}

              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mt-2">
                <span className="fs-8 text-white-50">Posted by {billboard.author?.full_name || "a removed admin"}</span>
                <div className="d-flex flex-wrap gap-2">
                  <button className="btn btn-outline-light btn-sm" onClick={() => setEditingEnd({ id: billboard.id, day: lastDayOf(billboard.ends_at) })} disabled={busyId === billboard.id}>
                    <i className="bi bi-calendar-plus"></i> Change last day
                  </button>
                  <button className="btn btn-outline-light btn-sm" onClick={() => handleSwitch(billboard)} disabled={busyId === billboard.id}>
                    <i className={`bi ${billboard.is_active ? "bi-eye-slash" : "bi-eye"}`}></i> {billboard.is_active ? "Switch off" : "Switch on"}
                  </button>
                  <button className="btn btn-outline-danger btn-sm" onClick={() => handleDelete(billboard)} disabled={busyId === billboard.id}>
                    <i className="bi bi-trash"></i> Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
