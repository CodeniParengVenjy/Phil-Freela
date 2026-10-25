import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { checkReceiptFile, isValidReference, normalizeReference, parseAmount } from "../../../lib/payments";
import "../payments.css";

// "Record your payment": the amount, the GCash reference number and the receipt
// screenshot (required: it is the client's proof on record). Shown over the
// project page after the client has paid in the GCash app, and over a chat's
// payment card later (PLAN-gcash-payments.md). The parent mounts it only while
// it is open, so every opening starts empty.
//   submit({ amount, reference, receiptFile }) -> { error } or { id }; it saves
//           the payment (lib/payments.js). Its error sentence is shown here.
//   onRecorded(): called after a payment was recorded.
//   defaultAmount: what the amount box starts with ("" for a project; the
//           requested amount for a chat request).
//   hint: a small line under the amount (e.g. the job's budget).
export default function RecordPaymentDialog({ title = "Record your payment", subtitle, otherName, defaultAmount = "", hint, submit, onClose, onRecorded }) {
  const [amount, setAmount] = useState(defaultAmount);
  const [reference, setReference] = useState("");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);

  // Frees the temporary preview when it is replaced or the window closes.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // Escape closes the window, unless it is sending.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sending, onClose]);

  const handlePick = (event) => {
    const picked = event.target.files?.[0];
    event.target.value = ""; // so picking the same file again still works
    if (!picked) return;
    const problem = checkReceiptFile(picked);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending) return;
    const parsedAmount = parseAmount(amount);
    const cleanReference = normalizeReference(reference);
    if (parsedAmount === null) {
      setError("Enter the amount you sent: more than 0 and at most 1,000,000 pesos, up to 2 decimals.");
      return;
    }
    if (!isValidReference(cleanReference)) {
      setError("The GCash reference number is 13 digits. You can copy it from your GCash receipt.");
      return;
    }
    if (!file) {
      setError("Attach your receipt screenshot to continue.");
      return;
    }

    setSending(true);
    setError("");
    const result = await submit({ amount: parsedAmount, reference: cleanReference, receiptFile: file });
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onRecorded?.(result);
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
        aria-labelledby="record-payment-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 460, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <h5 id="record-payment-title" className="fw-bold mb-1">{title}</h5>
        {subtitle && <p className="text-secondary fs-7 mb-3 text-break">{subtitle}</p>}

        <label htmlFor="payAmount" className="form-label text-white-50 fw-semibold fs-7">Amount (₱)</label>
        <input
          id="payAmount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-1"
          placeholder="1,500.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          maxLength={14}
          disabled={sending}
        />
        <small className="text-secondary fs-8 d-block mb-3">{hint || "The amount you sent in GCash."}</small>

        <label htmlFor="payReference" className="form-label text-white-50 fw-semibold fs-7">GCash reference no.</label>
        <input
          id="payReference"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white pay-mono mb-1"
          placeholder="4021 358 091742"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          maxLength={20}
          disabled={sending}
        />
        <small className="text-secondary fs-8 d-block mb-3">13 digits, shown on your GCash receipt.</small>

        <span className="form-label text-white-50 fw-semibold fs-7 d-block">Receipt screenshot (required)</span>
        <div className="d-flex align-items-center gap-3 mb-1">
          {preview && <img src={preview} alt="Your receipt screenshot" className="pay-receipt-thumb" />}
          <div className="d-flex flex-column gap-1">
            <input type="file" ref={fileInputRef} accept="image/jpeg,image/png,image/webp" className="d-none" onChange={handlePick} />
            <div>
              <button type="button" className="btn btn-secondary rounded-pill px-4 py-2 text-white fw-bold fs-7" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                {file ? "Change screenshot" : "Add screenshot"}
              </button>
            </div>
            {file && <small className="text-white-50 fs-8 text-break">{file.name}</small>}
          </div>
        </div>
        <small className="text-secondary fs-8 d-block mb-2">
          JPG, PNG or WebP, 5 MB at most. Only you{otherName ? ` and ${otherName}` : " and the other person"} can open it.
        </small>
        {!file && <p className="text-warning fs-8 mb-2">Attach your receipt screenshot to continue.</p>}

        {error && <p className="text-danger fs-7 mb-3" role="alert">{error}</p>}

        <div className="d-flex gap-2 justify-content-end mt-3">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={sending || !file}>
            {sending ? "Sending..." : "Send record"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
