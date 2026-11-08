import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { asSentence, checkReceiptFile, formatPeso, formatReference, parseAmount, receiptTime } from "../../../lib/payments";
import "../payments.css";
import { Busy } from "../../../components/Loaders";

const round = (value) => Math.round(value * 100) / 100;

// "Record your payment" (PLAN-gcash-payments.md, PLAN-short-payment.md,
// PLAN-receipt-ai.md). The client adds the screenshot of their GCash receipt and
// PhilFreela's AI reads it: the amount sent, the reference number, the date and
// the initials of the person paid. Nobody types the amount or the reference. The
// AI also looks for signs of a fake:
//   ok / check   the reading is shown and the payment can be sent ("check" tells
//                the freelancer to look carefully, with the reasons)
//   blocked      it can't be sent: the reasons are shown
//   unreadable   blurry or cut off: add a clear, full screenshot
// The client only says which part of the amount was a tip.
// The parent mounts it only while it is open, so every opening starts empty.
//   read(file) -> { data } or { error }: asks the AI service (lib/payments.js
//           readReceiptScreenshot) for this project or chat request.
//   submit({ checkId, tip }) -> { error } or { id }: records it (lib/payments.js).
//   onRecorded(): called after a payment was recorded.
//   maxAmount: on a one-time project with an agreed price, what is left to pay.
//           Anything above it must be the tip, and a tip is only allowed when the
//           payment pays all of it (the database checks the same).
//   requestedAmount: on a chat card, what was asked for (only a note).
//   tipOnly: the project is fully paid, so the whole amount is a tip.
export default function RecordPaymentDialog({
  title = "Record your payment", subtitle, otherName, maxAmount = null, requestedAmount = null,
  tipOnly = false, read, submit, onClose, onRecorded
}) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [reading, setReading] = useState(false);
  // The AI's answer for the current screenshot (null until it has read one).
  const [result, setResult] = useState(null);
  const [tipText, setTipText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);
  // Which screenshot the newest reading belongs to, so an older, slower answer
  // never replaces the answer for a screenshot picked after it.
  const readTurn = useRef(0);

  // Frees the temporary preview when it is replaced or the window closes.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // Escape closes the window, unless it is busy.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending && !reading) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sending, reading, onClose]);

  const sendable = result?.verdict === "ok" || result?.verdict === "check";
  // The amount the AI read is everything sent in GCash; the tip is part of it.
  const total = sendable ? Number(result.amount) : null;
  const tip = !sendable ? null : tipOnly ? total : tipText.trim() === "" ? 0 : parseAmount(tipText);
  const price = total !== null && tip !== null ? round(total - tip) : null;

  // "Add screenshot": the AI reads it right away.
  const handlePick = async (event) => {
    const picked = event.target.files?.[0];
    event.target.value = ""; // so picking the same file again still works
    if (!picked) return;
    const problem = checkReceiptFile(picked);
    if (problem) {
      setError(problem);
      return;
    }
    const turn = readTurn.current + 1;
    readTurn.current = turn;
    setError("");
    setResult(null);
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
    setReading(true);
    const { data, error: readError } = await read(picked);
    if (readTurn.current !== turn) return;
    setReading(false);
    if (readError) {
      setError(readError);
      return;
    }
    setResult(data);
    // More than is left to pay on the project: the extra can only be a tip, so
    // the Tip box starts with it.
    const sent = Number(data.amount);
    if (!tipOnly && maxAmount !== null && (data.verdict === "ok" || data.verdict === "check") && sent > maxAmount) {
      setTipText(round(sent - maxAmount).toFixed(2));
    } else {
      setTipText("");
    }
  };

  // The same rules as the database, in plain words. "" when everything is fine.
  const findProblem = () => {
    if (!file) return "Add the screenshot of your GCash receipt to continue.";
    if (!sendable) return "This receipt can't be sent. Add a clear screenshot of the right receipt.";
    if (tip === null) return "Enter the tip as an amount, like 100, or leave the Tip box empty.";
    if (tip > total) return `The tip can't be more than the ${formatPeso(total)} you sent.`;
    if (maxAmount !== null && !tipOnly && price > maxAmount) {
      return `Only ${formatPeso(maxAmount)} is left to pay. Put the extra ${formatPeso(round(total - maxAmount))} in the Tip box.`;
    }
    if (maxAmount !== null && !tipOnly && tip > 0 && price < maxAmount) {
      return `A tip can be added only when you pay everything that is left (${formatPeso(maxAmount)}).`;
    }
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending || reading) return;
    const problem = findProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError("");
    const outcome = await submit({ checkId: result.check_id, tip });
    setSending(false);
    if (outcome.error) {
      setError(outcome.error);
      return;
    }
    onRecorded?.(outcome);
  };

  // A small line under the reading: how the amount compares with what is left to
  // pay (project) or what was asked for (chat card).
  let amountNote = "";
  if (sendable && !tipOnly && price !== null) {
    if (maxAmount !== null && price < maxAmount) {
      amountNote = `${formatPeso(round(maxAmount - price))} will still be left to pay. You can pay the rest later.`;
    } else if (requestedAmount !== null && total > requestedAmount && tip === 0) {
      amountNote = `That is more than the ${formatPeso(requestedAmount)} requested. If the extra is a tip, put it in the Tip box.`;
    }
  }

  // What the AI read, and its verdict.
  const renderReading = () => {
    if (reading) {
      return (
        <p className="text-white-50 fs-7 mb-3" role="status">
          <Busy kind="ai">Reading your receipt</Busy>
        </p>
      );
    }
    if (!result) return null;
    if (result.verdict === "blocked" || result.verdict === "unreadable") {
      const blocked = result.verdict === "blocked";
      return (
        <div className={`p-3 rounded-3 border mb-3 ${blocked ? "border-danger" : "border-warning"}`} role="alert" data-receipt-verdict={result.verdict}>
          <p className={`fw-bold fs-7 mb-1 ${blocked ? "text-danger" : "text-warning"}`}>
            <i className={`bi ${blocked ? "bi-shield-x" : "bi-image"} me-1`}></i>
            {blocked ? "This receipt can't be sent" : "The receipt couldn't be read"}
          </p>
          <ul className="text-white-50 fs-8 mb-1 ps-3">
            {result.reasons.map((reason) => <li key={reason}>{asSentence(reason)}</li>)}
          </ul>
          <p className="text-secondary fs-8 mb-0">
            {blocked
              ? `If you think this is a mistake, add a clear, full screenshot of the receipt, or message ${otherName || "the other person"}.`
              : "Take a new screenshot of the whole receipt in your GCash app and add it here."}
          </p>
        </div>
      );
    }
    return (
      <div className="p-3 rounded-3 bg-secondary bg-opacity-10 border border-secondary border-opacity-25 mb-3" data-receipt-verdict={result.verdict}>
        <span className="text-secondary fs-8 d-block mb-2"><i className="bi bi-stars me-1"></i>What PhilFreela's AI read on your receipt</span>
        <dl className="pay-reading mb-2">
          <dt className="text-white-50">Amount sent</dt>
          <dd className="text-white fw-bold fs-5" data-read-amount>{formatPeso(total)}</dd>
          {result.initials && (
            <>
              <dt className="text-white-50">Sent to</dt>
              <dd className="text-white">{result.initials}</dd>
            </>
          )}
          <dt className="text-white-50">Reference no.</dt>
          <dd className="text-white pay-mono" data-read-reference>{formatReference(result.reference)}</dd>
          <dt className="text-white-50">Date</dt>
          <dd className="text-white">{receiptTime(result.paid_at)}</dd>
        </dl>
        {result.verdict === "ok" ? (
          <p className="text-success fs-8 mb-0"><i className="bi bi-shield-check me-1"></i>No signs of a fake. {otherName || "The freelancer"} still checks their GCash before confirming.</p>
        ) : (
          <div className="text-warning fs-8">
            <p className="mb-1"><i className="bi bi-exclamation-triangle-fill me-1"></i>It can be sent, but {otherName || "the freelancer"} will be asked to look at it carefully:</p>
            <ul className="mb-0 ps-3">
              {result.reasons.map((reason) => <li key={reason}>{asSentence(reason)}</li>)}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      onClick={sending || reading ? undefined : onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-payment-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 460, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <h5 id="record-payment-title" className="fw-bold mb-1">{tipOnly ? "Record your tip" : title}</h5>
        {subtitle && <p className="text-secondary fs-7 mb-3 text-break">{subtitle}</p>}

        <span className="form-label text-white-50 fw-semibold fs-7 d-block">Screenshot of your GCash receipt</span>
        <div className="d-flex align-items-center gap-3 mb-1">
          {preview && <img src={preview} alt="Your receipt screenshot" className="pay-receipt-thumb" />}
          <div className="d-flex flex-column gap-1">
            <input type="file" ref={fileInputRef} accept="image/jpeg,image/png,image/webp" className="d-none" onChange={handlePick} />
            <div>
              <button type="button" className="btn btn-secondary rounded-pill px-4 py-2 text-white fw-bold fs-7" onClick={() => fileInputRef.current?.click()} disabled={sending || reading}>
                {file ? "Change screenshot" : "Add screenshot"}
              </button>
            </div>
            {file && <small className="text-white-50 fs-8 text-break">{file.name}</small>}
          </div>
        </div>
        <small className="text-secondary fs-8 d-block mb-3">
          The whole receipt, straight from your GCash app: the AI reads the amount, the reference number and the date from it.
          JPG, PNG or WebP, 5 MB at most. Only you{otherName ? ` and ${otherName}` : " and the other person"} can open it.
        </small>

        {renderReading()}

        {sendable && tipOnly && (
          <p className="text-white-50 fs-7 mb-3">This project is fully paid, so the whole {formatPeso(total)} is recorded as a tip for {otherName || "them"}.</p>
        )}

        {sendable && !tipOnly && (
          <>
            <label htmlFor="payTip" className="form-label text-white-50 fw-semibold fs-7">Of this, a tip (₱, optional)</label>
            <input
              id="payTip"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-1"
              placeholder="0.00"
              value={tipText}
              onChange={(event) => setTipText(event.target.value)}
              maxLength={14}
              disabled={sending}
            />
            <small className="text-secondary fs-8 d-block mb-2">If part of what you sent is a thank-you on top, enter that part. Leave it empty for no tip.</small>
            {tip > 0 && price !== null && price >= 0 && (
              <p className="text-white fs-7 mb-2" data-pay-split>
                For the {maxAmount !== null || requestedAmount === null ? "project" : "request"}: <strong>{formatPeso(price)}</strong>{" "}
                <span className="text-white-50">+ {formatPeso(tip)} tip</span>
              </p>
            )}
            {amountNote && <small className="text-warning fs-8 d-block mb-2" data-amount-note>{amountNote}</small>}
          </>
        )}

        {error && <p className="text-danger fs-7 mb-3 mt-2" role="alert">{error}</p>}

        <div className="d-flex gap-2 justify-content-end mt-3">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={sending || reading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={sending || reading || !sendable}>
            {sending ? <Busy kind="send">Sending</Busy> : "Send record"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
