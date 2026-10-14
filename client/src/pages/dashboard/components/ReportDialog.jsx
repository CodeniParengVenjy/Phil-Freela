import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MAX_SCREENSHOTS, checkScreenshot, reasonsFor, reportReasons, sendReport } from "../../../lib/reports";
import { messageSummary } from "../../../lib/reportMessages";

// For "Stolen work", the reporter must say where the original is, in at
// least this many characters (so "x" or "idk" isn't enough for an admin).
const MIN_PROOF_LENGTH = 10;

// "Report" popup for a user, service, job post, portfolio project, profile
// picture, cover photo or a comment on an offer. The report is saved to the
// reports table, where admins review it on the admin Reports page.
//   target: { type: "user" | "service" | "job_post" | "portfolio_item" | "profile_picture" | "cover_photo" | "service_review", id, name } or null (closed)
//           From a call it also has callId and callKind ("voice" / "video").
//           A picture also has reportedPath (see sendReport in lib/reports.js).
//           From a chat it also has chat: { messages, ticked, meId } (see
//           lib/reportMessages.js): the messages to list, the ids ticked to
//           start with, and the signed-in person's id (to tell "You" apart).
//   onDone(message): called after sending, e.g. to show a toast
export default function ReportDialog({ target, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  // The picked screenshots: [{ file, preview }] (preview = a temporary link
  // for the thumbnail, freed when it's removed or the popup closes).
  const [screenshots, setScreenshots] = useState([]);
  // The chat messages the person changed the ticks of (a Set of ids); null =
  // untouched, so the ticks the popup opened with are used.
  const [changedPicks, setChangedPicks] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const messageListRef = useRef(null);

  // Closing starts the next report fresh (and frees the thumbnails).
  const close = () => {
    screenshots.forEach((s) => URL.revokeObjectURL(s.preview));
    setReason("");
    setDetails("");
    setScreenshots([]);
    setChangedPicks(null);
    setError("");
    onClose();
  };

  // Escape closes the popup, unless it's sending. (No dependency list: it
  // re-attaches after every render, so it always uses the latest close.)
  useEffect(() => {
    if (!target) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending) close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  // When the popup opens from a chat, scroll the message list so the last
  // ticked message is at the bottom (the newest ones, or the one that was
  // right-clicked with the messages before it).
  useEffect(() => {
    const list = messageListRef.current;
    const ticked = list?.querySelectorAll("[data-ticked='true']");
    if (!list || !ticked?.length) return;
    const last = ticked[ticked.length - 1].getBoundingClientRect();
    list.scrollTop += last.bottom - list.getBoundingClientRect().bottom + 8;
  }, [target]);

  if (!target) return null;

  // "Stolen work" needs proof: where the original is (see lib/reports.js).
  const needsDetails = Boolean(reportReasons.find((r) => r.value === reason)?.needsDetails);

  // The chat messages listed (only when reporting from a chat) and which are ticked.
  const chat = target.chat?.messages.length ? target.chat : null;
  const picks = changedPicks ?? new Set(chat?.ticked);
  const togglePick = (id) => {
    const next = new Set(picks);
    if (!next.delete(id)) next.add(id);
    setChangedPicks(next);
  };

  const addScreenshots = (event) => {
    const picked = [...event.target.files];
    event.target.value = ""; // so picking the same file again still works
    const room = MAX_SCREENSHOTS - screenshots.length;
    const problem = picked.map(checkScreenshot).find(Boolean);
    if (problem) {
      setError(problem);
      return;
    }
    setError(picked.length > room ? `You can add up to ${MAX_SCREENSHOTS} screenshots.` : "");
    setScreenshots((prev) => [
      ...prev,
      ...picked.slice(0, room).map((file) => ({ file, preview: URL.createObjectURL(file) }))
    ]);
  };

  const removeScreenshot = (index) => {
    URL.revokeObjectURL(screenshots[index].preview);
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!reason) {
      setError("Please pick a reason.");
      return;
    }
    if (needsDetails && details.trim().length < MIN_PROOF_LENGTH) {
      setError("Please say where the original is: paste a link, or say whose work it is.");
      return;
    }

    setSending(true);
    setError("");
    const { error: sendError } = await sendReport({
      target,
      reason,
      details: details.trim(),
      screenshots: screenshots.map((s) => s.file),
      // The ticked chat messages, in chat order.
      messageIds: chat ? chat.messages.filter((m) => picks.has(m.id)).map((m) => m.id) : []
    });
    setSending(false);

    if (sendError) {
      // 23505 = the "one pending report per target" rule. 23514 = the
      // database doesn't know this reason or kind of target yet (the stolen
      // work update, database/supabase_stolen_work_schema.sql, hasn't been
      // run). 42501 on a picture = the database refused it because the person
      // has changed that picture since it was opened. P0001 = the database
      // refused the chat messages and says why in plain words (for example one
      // was unsent while the popup was open). Other database errors get a
      // general message; upload problems explain themselves.
      const isPicture = target.type === "profile_picture" || target.type === "cover_photo";
      setError(sendError.code === "23505"
        ? "You already reported this. An admin will review it soon."
        : sendError.code === "23514" ? "This kind of report isn't switched on yet. Please try again later."
          : sendError.code === "42501" && isPicture ? "This picture has changed since you opened it. Please reload the page and report it again."
            : sendError.code === "P0001" ? sendError.message
              : sendError.code ? "Couldn't send the report. Please try again." : sendError.message);
      return;
    }

    onDone?.("Thanks for reporting. An admin will review it.");
    close();
  };

  return createPortal(
    <div
      style={{
        // Above the call window (calls.css), so it also works during a call.
        position: "fixed", inset: 0, zIndex: 1500,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={sending ? undefined : close}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        className="bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 440, width: "100%", maxHeight: "100%", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="d-flex align-items-center gap-2 mb-1">
          <i className="bi bi-flag-fill text-danger"></i>
          <h5 id="report-dialog-title" className="fw-bold mb-0 text-truncate">Report {target.name ? `"${target.name}"` : "this"}</h5>
        </div>
        {target.callId && (
          <p className="text-warning fs-7 mb-1">
            <i className={`bi ${target.callKind === "video" ? "bi-camera-video-fill" : "bi-telephone-fill"} me-1`}></i>
            Reporting from your {target.callKind === "video" ? "video" : "voice"} call. The call keeps going.
          </p>
        )}
        <p className="text-secondary fs-7 mb-3">Your report is private. Only admins will see it.</p>

        <label className="form-label text-white-50 fs-7 mb-2">Why are you reporting this?</label>
        <div className="d-flex flex-column gap-2 mb-3">
          {reasonsFor(target.type).map((r) => (
            <label key={r.value} className="d-flex align-items-center gap-2 fs-7 cursor-pointer">
              <input
                type="radio"
                name="report-reason"
                className="form-check-input m-0"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              {r.label}
            </label>
          ))}
        </div>

        <label htmlFor="report-details" className="form-label text-white-50 fs-7 mb-1">
          {needsDetails ? "Where is the original?" : "Details (optional)"}
        </label>
        <textarea
          id="report-details"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white fs-7 mb-3"
          rows={3}
          maxLength={1000}
          placeholder={needsDetails ? "Paste a link to the original, or say whose work it is..." : "Tell us what happened..."}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />

        {/* From a chat: the messages to send with the report. Admins can't read
            chats, so only the ticked ones are copied for them (lib/reportMessages.js). */}
        {chat && (
          <div className="mb-3">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
              <span id="report-messages-label" className="form-label text-white-50 fs-7 mb-0">Messages to send with your report</span>
              <span className="fs-8 text-white-50 flex-shrink-0">{picks.size} of {chat.messages.length} selected</span>
            </div>
            <p className="text-secondary fs-8 mb-2">
              Admins can't read your chats, so tick the messages that show the problem. Only admins will see the ones you tick, not {target.name || "the other person"}.
              A photo, voice message or file is sent as a label only: add a screenshot below to show it.
            </p>
            <div
              ref={messageListRef}
              role="group"
              aria-labelledby="report-messages-label"
              className="border border-secondary border-opacity-25 rounded-3"
              style={{ maxHeight: 220, overflowY: "auto" }}
            >
              {chat.messages.map((m) => {
                const mine = m.sender_id === chat.meId;
                const { icon, label, text } = messageSummary(m);
                return (
                  <label
                    key={m.id}
                    data-ticked={picks.has(m.id)}
                    className={`d-flex align-items-start gap-2 px-2 py-2 fs-7 cursor-pointer border-bottom border-secondary border-opacity-25 ${picks.has(m.id) ? "bg-secondary bg-opacity-25" : ""}`}
                  >
                    <input
                      type="checkbox"
                      className="form-check-input m-0 mt-1 flex-shrink-0"
                      checked={picks.has(m.id)}
                      disabled={sending}
                      onChange={() => togglePick(m.id)}
                    />
                    <span className="min-w-0">
                      <span className="d-block fs-8 text-white-50">
                        <strong className={mine ? "" : "text-role"}>{mine ? "You" : target.name || "Them"}</strong>
                        {" · "}
                        {new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {label && (
                        <span className="d-block"><i className={`bi ${icon} me-1`}></i>{label}</span>
                      )}
                      {text && (
                        <span
                          className="text-break"
                          style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                        >
                          {!label && icon && <i className={`bi ${icon} me-1`}></i>}{text}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="d-flex gap-3 mt-1">
              <button type="button" className="btn btn-link btn-sm p-0 fs-8 text-decoration-none text-role" disabled={sending} onClick={() => setChangedPicks(new Set(chat.messages.map((m) => m.id)))}>
                Select all
              </button>
              <button type="button" className="btn btn-link btn-sm p-0 fs-8 text-decoration-none text-role" disabled={sending} onClick={() => setChangedPicks(new Set())}>
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Screenshots as proof (optional). Only admins can open them. */}
        <label className="form-label text-white-50 fs-7 mb-1">Screenshots (optional, up to {MAX_SCREENSHOTS})</label>
        <div className="d-flex flex-wrap gap-2 mb-3">
          {screenshots.map((s, index) => (
            <div key={s.preview} className="position-relative">
              <img src={s.preview} alt={`Screenshot ${index + 1}`} className="rounded-3 border border-secondary border-opacity-50" style={{ width: 72, height: 72, objectFit: "cover" }} />
              <button
                type="button"
                className="btn btn-sm btn-danger rounded-circle position-absolute top-0 end-0 p-0 d-flex align-items-center justify-content-center"
                style={{ width: 22, height: 22, transform: "translate(35%, -35%)" }}
                aria-label={`Remove screenshot ${index + 1}`}
                disabled={sending}
                onClick={() => removeScreenshot(index)}
              >
                <i className="bi bi-x fs-6"></i>
              </button>
            </div>
          ))}
          {screenshots.length < MAX_SCREENSHOTS && (
            <label
              className={`d-flex flex-column align-items-center justify-content-center rounded-3 border border-secondary border-opacity-50 text-white-50 fs-8 ${sending ? "opacity-50" : "cursor-pointer"}`}
              style={{ width: 72, height: 72, "--bs-border-style": "dashed" }}
            >
              <i className="bi bi-image fs-5"></i>
              Add
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={sending} onChange={addScreenshots} />
            </label>
          )}
        </div>

        {error && <p className="text-danger fs-7 mb-3">{error}</p>}

        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 fw-bold" onClick={close} disabled={sending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger rounded-pill px-4 fw-bold" disabled={sending}>
            {sending ? "Sending..." : "Send Report"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
