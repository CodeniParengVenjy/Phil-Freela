import { useState } from "react";
import { Link } from "react-router-dom";
import { formatPeso, formatReference } from "../../../lib/payments";
import { MAX_REASON, MIN_REASON, PROMO_KINDS } from "../../../lib/promotions";

// One fee payment waiting for an admin: who sent it, what for, how much, the
// GCash reference and the receipt screenshot. The admin checks PhilFreela's own
// GCash and then approves, or rejects with a reason the person will read.
//
// Props:
//   request        a row from getWaitingRequests()
//   busy           true while this request is being answered
//   onApprove      (request) => void
//   onReject       (request, reason) => Promise<boolean>   true = it was rejected
//   onOpenReceipt  (request) => void
export default function PromotionRequestCard({ request, busy, onApprove, onReject, onOpenReceipt }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [copied, setCopied] = useState(false);

  const kind = PROMO_KINDS[request.kind];
  const person = request.person;
  // The offer or job post was taken away after it was paid for: it can't be
  // featured any more, so only Reject is left.
  const removed = (request.kind === "feature_service" && !request.service_id) || (request.kind === "feature_job" && !request.job_id);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(request.reference_no);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Some browsers refuse; the number is on the screen to select by hand.
    }
  };

  const handleSendRejection = async () => {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON) {
      setReasonError(`Write a reason of at least ${MIN_REASON} characters so the person knows what to fix.`);
      return;
    }
    setReasonError("");
    const done = await onReject(request, trimmed);
    if (done) setRejecting(false);
  };

  return (
    <div className="admin-card rounded-4 p-3 p-md-4">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span className="badge bg-info text-dark fw-normal">
          <i className={`bi ${kind.icon} me-1`}></i>{kind.label}
        </span>
        <span className="fw-bold text-white fs-5 ms-1">{formatPeso(request.amount)}</span>
        <span className="text-white-50 fs-8 ms-auto">Sent {new Date(request.created_at).toLocaleString()}</span>
      </div>

      <p className="mb-1 text-white admin-description">
        {request.kind === "pro"
          ? `${request.days} days of Premium`
          : <>{`${request.days} days for `}<strong>"{request.target_title || "a post"}"</strong></>}
      </p>
      <p className="mb-2 fs-7 text-white-50">
        From{" "}
        {person ? (
          <Link to={`/admin/users?search=${encodeURIComponent(person.username)}`} className="text-white fw-semibold">
            {person.full_name} <span className="text-white-50 fw-normal">@{person.username}</span>
          </Link>
        ) : (
          "a removed account"
        )}
      </p>

      {removed && (
        <p className="admin-message error fs-7 fw-semibold mb-2">
          {request.kind === "feature_job" ? "This job post was removed after it was paid for." : "This offer was removed after it was paid for."}
          {" "}It can't be approved. Reject it and say why.
        </p>
      )}

      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span className="text-white-50 fs-7">GCash reference</span>
        <code className="text-white fs-6">{formatReference(request.reference_no)}</code>
        <button type="button" className="btn btn-outline-light btn-sm" onClick={handleCopy}>
          <i className={`bi ${copied ? "bi-check2" : "bi-clipboard"}`}></i> {copied ? "Copied" : "Copy"}
        </button>
        <button type="button" className="btn btn-outline-light btn-sm" onClick={() => onOpenReceipt(request)}>
          <i className="bi bi-receipt"></i> View receipt
        </button>
      </div>

      {!removed && (
        <p className="fs-8 text-white-50 mb-2">
          <i className="bi bi-info-circle me-1"></i>
          Approve only after you see {formatPeso(request.amount)} with this reference in PhilFreela's GCash.
        </p>
      )}

      {rejecting ? (
        <div className="mt-2">
          <label htmlFor={`rejectReason-${request.id}`} className="form-label text-white-50 fs-7 mb-1">Reason (the person will read this)</label>
          <textarea
            id={`rejectReason-${request.id}`} className="form-control admin-input" rows={2} maxLength={MAX_REASON}
            value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy}
          />
          <div className="d-flex justify-content-between text-white-50 fs-8 mt-1">
            <span>{reasonError && <span className="text-danger fw-semibold">{reasonError}</span>}</span>
            <span>{reason.length}/{MAX_REASON}</span>
          </div>
          <div className="d-flex flex-wrap gap-2 mt-2">
            <button type="button" className="btn btn-outline-danger btn-sm rounded-pill px-3" onClick={handleSendRejection} disabled={busy}>
              <i className="bi bi-x-circle"></i> {busy ? "Sending..." : "Send rejection"}
            </button>
            <button type="button" className="btn btn-outline-light btn-sm rounded-pill px-3" onClick={() => { setRejecting(false); setReasonError(""); }} disabled={busy}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="d-flex flex-wrap gap-2 mt-2">
          <button type="button" className="btn btn-admin-orange btn-sm rounded-pill px-3 fw-bold" onClick={() => onApprove(request)} disabled={busy || removed}>
            <i className="bi bi-check-circle"></i> {busy ? "Working..." : "Approve"}
          </button>
          <button type="button" className="btn btn-outline-danger btn-sm rounded-pill px-3" onClick={() => setRejecting(true)} disabled={busy}>
            <i className="bi bi-x-circle"></i> Reject
          </button>
        </div>
      )}
    </div>
  );
}
