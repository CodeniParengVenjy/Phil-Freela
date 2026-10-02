import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../../lib/supabaseClient";
import { MAX_BOOKING_NOTE_LENGTH, createBooking } from "../../../lib/bookings";
import { todayInManila } from "../../../lib/projects";

// The Book popup. A client says what they need and the date they need it by;
// "Send booking" asks the freelancer (see lib/bookings.js). It uses the same
// look as the Hire popup (the role-confirm-* CSS classes).
// target: { freelancerId, freelancerName, service: { id, title } or null }, or
// null when closed. From a service card the service is already known; from the
// freelancer's page or a chat it is null, so the popup lists that freelancer's
// services to pick from. The parent gives it a key, so it starts empty each time.
export default function BookDialog({ target, onClose, onBooked }) {
  // The freelancer's services, for the pick list (null while loading).
  const [services, setServices] = useState(null);
  const [serviceId, setServiceId] = useState("");
  const [note, setNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  // No service given: load this freelancer's services. The database only
  // shows services that can be booked (verified freelancer, not blocked).
  useEffect(() => {
    if (!target || target.service) return undefined;
    let active = true;

    supabase
      .from("services")
      .select("id, title")
      .eq("freelancer_id", target.freelancerId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        setServices(data || []);
        if (data?.length === 1) setServiceId(data[0].id);
      });

    return () => {
      active = false;
    };
  }, [target]);

  // Escape closes the popup, unless sending is in progress.
  useEffect(() => {
    if (!target) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [target, sending, onClose]);

  if (!target) return null;

  const hasNoServices = !target.service && services !== null && services.length === 0;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    const { error: problem } = await createBooking(target.service?.id || serviceId, note, dueDate);
    setSending(false);
    if (problem) {
      setError(problem);
      return;
    }
    onBooked();
  };

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={sending ? undefined : onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="book-dialog-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 460, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="text-center">
          <div className="role-confirm-icon bg-role text-white rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3" style={{ width: 56, height: 56 }}>
            <i className="bi bi-calendar-check-fill fs-4"></i>
          </div>
          <h5 id="book-dialog-title" className="fw-bold mb-1 text-break">Book {target.freelancerName}</h5>
          {target.service && <p className="text-secondary fs-7 mb-4 text-break">for "{target.service.title}"</p>}
          {!target.service && <p className="text-secondary fs-7 mb-4">Pick a service and tell them what you need.</p>}
        </div>

        {/* Opened without a service (freelancer page, chat): pick one of theirs. */}
        {!target.service && services === null && <p className="text-secondary fs-7 mb-3">Loading services...</p>}
        {hasNoServices && (
          <p className="text-secondary fs-7 mb-3">
            {target.freelancerName} hasn't posted a service you can book yet. You can send them a message instead.
          </p>
        )}
        {!target.service && services?.length > 0 && (
          <>
            <label htmlFor="bookService" className="form-label text-white-50 fw-semibold fs-7">Service</label>
            <select
              id="bookService"
              className="form-select bg-secondary bg-opacity-25 border-secondary text-white mb-3"
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              required
            >
              <option value="">Choose a service</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          </>
        )}

        <label htmlFor="bookNote" className="form-label text-white-50 fw-semibold fs-7">What do you need? (optional)</label>
        <textarea
          id="bookNote"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white fs-7 mb-1"
          rows="3"
          maxLength={MAX_BOOKING_NOTE_LENGTH}
          placeholder="e.g. A 1-minute ad video for my coffee shop, with realistic transitions."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        ></textarea>
        <small className="text-secondary fs-8 d-block mb-3">{note.length}/{MAX_BOOKING_NOTE_LENGTH}</small>

        <label htmlFor="bookDueDate" className="form-label text-white-50 fw-semibold fs-7">Date needed</label>
        <input
          id="bookDueDate"
          type="date"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-3"
          min={todayInManila()}
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          required
        />

        <p className="text-secondary fs-8 mb-3">
          {target.freelancerName} gets your request and can accept or decline. If they accept, a project starts. Talk about the price in chat.
        </p>

        {error && <p className="text-danger fs-7 mb-3">{error}</p>}

        <div className="d-flex gap-2 justify-content-center">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={sending || hasNoServices}>
            {sending ? "Sending..." : "Send booking"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
