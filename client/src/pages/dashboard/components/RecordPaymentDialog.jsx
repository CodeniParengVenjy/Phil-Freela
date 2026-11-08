import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { checkReceiptFile, formatPeso, isValidReference, MAX_PAYMENT_AMOUNT, normalizeReference, parseAmount } from "../../../lib/payments";
import "../payments.css";
import { Busy } from "../../../components/Loaders";

// "Record your payment": the amount, an optional tip, the GCash reference number
// and the receipt screenshot (required: it is the client's proof on record).
// Shown over the project page after the client has paid in the GCash app, and
// over a chat's payment card (PLAN-gcash-payments.md, PLAN-short-payment.md).
// The parent mounts it only while it is open, so every opening starts empty.
//   submit({ amount, tip, reference, receiptFile }) -> { error } or { id }; it
//           saves the payment (lib/payments.js). amount is everything sent in
//           GCash (price + tip). Its error sentence is shown here.
//   onRecorded(): called after a payment was recorded.
//   defaultAmount: what the amount box starts with ("" when nothing is known;
//           what is left to pay on a project; the requested amount on a chat card).
//   maxAmount: on a one-time project with an agreed price, what is left to pay.
//           The amount can't be more (the extra goes in the tip box), and a tip
//           is only allowed when the amount pays all of it. The database checks
//           the same thing; checking here too saves a wasted receipt upload.
//   requestedAmount: on a chat card, what was asked for (only a warning).
//   tipOnly: the project is fully paid, so this payment can only be a tip.
//   hint: a small line under the amount (e.g. the job's budget).
export default function RecordPaymentDialog({
  title = "Record your payment", subtitle, otherName, defaultAmount = "", maxAmount = null, requestedAmount = null,
  tipOnly = false, hint, submit, onClose, onRecorded
}) {
  const [amount, setAmount] = useState(defaultAmount);
  const [tipText, setTipText] = useState("");
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

  // What is typed, read as amounts (null = not a valid amount yet). An empty tip
  // box means no tip.
  const price = tipOnly ? 0 : parseAmount(amount);
  const tip = tipText.trim() === "" ? 0 : parseAmount(tipText);
  const total = price !== null && tip !== null ? Math.round((price + tip) * 100) / 100 : null;

  // A small line under the amount while typing: how it compares with what is
  // left to pay (project) or what was asked for (chat card).
  let amountNote = null;
  if (!tipOnly && price !== null) {
    if (maxAmount !== null && price > maxAmount) {
      amountNote = { text: `Only ${formatPeso(maxAmount)} is left to pay. Put anything extra in the Tip box.` };
    } else if (maxAmount !== null && price < maxAmount) {
      amountNote = { text: `${formatPeso(Math.round((maxAmount - price) * 100) / 100)} will still be left to pay. You can pay the rest later.` };
    } else if (requestedAmount !== null && price < requestedAmount) {
      amountNote = { text: `That is less than the ${formatPeso(requestedAmount)} requested.` };
    } else if (requestedAmount !== null && price > requestedAmount) {
      amountNote = { text: `That is more than the ${formatPeso(requestedAmount)} requested. If the extra is a tip, put it in the Tip box.` };
    }
  }

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

  // The same rules as the database, in plain words. "" when everything is fine.
  const findProblem = (cleanReference) => {
    if (price === null) return "Enter the amount you sent: more than 0, up to 2 decimals.";
    if (tip === null) return "Enter the tip as an amount, like 100, or leave the Tip box empty.";
    if (tipOnly && tip <= 0) return "This project is fully paid. Enter the tip you sent.";
    if (total > MAX_PAYMENT_AMOUNT) return "The total can be at most 1,000,000 pesos.";
    if (maxAmount !== null && price > maxAmount) return `Only ${formatPeso(maxAmount)} is left to pay. Put anything extra in the Tip box.`;
    if (maxAmount !== null && tip > 0 && price < maxAmount) return `A tip can be added only when you pay everything that is left (${formatPeso(maxAmount)}).`;
    if (!isValidReference(cleanReference)) return "The GCash reference number is 13 digits. You can copy it from your GCash receipt.";
    if (!file) return "Attach your receipt screenshot to continue.";
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending) return;
    const cleanReference = normalizeReference(reference);
    const problem = findProblem(cleanReference);
    if (problem) {
      setError(problem);
      return;
    }

    setSending(true);
    setError("");
    const result = await submit({ amount: total, tip, reference: cleanReference, receiptFile: file });
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
        <h5 id="record-payment-title" className="fw-bold mb-1">{tipOnly ? "Record your tip" : title}</h5>
        {subtitle && <p className="text-secondary fs-7 mb-3 text-break">{subtitle}</p>}

        {!tipOnly && (
          <div className="mb-3">
            <label htmlFor="payAmount" className="form-label text-white-50 fw-semibold fs-7">
              {maxAmount !== null ? "For the project (₱)" : "Amount (₱)"}
            </label>
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
            <small className="text-secondary fs-8 d-block">{hint || "The amount you sent in GCash."}</small>
            {amountNote && <small className="text-warning fs-8 d-block mt-1" data-amount-note>{amountNote.text}</small>}
          </div>
        )}

        <label htmlFor="payTip" className="form-label text-white-50 fw-semibold fs-7">
          {tipOnly ? "Tip (₱)" : "Tip (₱, optional)"}
        </label>
        <input
          id="payTip"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-1"
          placeholder={tipOnly ? "100.00" : "0.00"}
          value={tipText}
          onChange={(event) => setTipText(event.target.value)}
          maxLength={14}
          disabled={sending}
        />
        <small className="text-secondary fs-8 d-block mb-3">
          {tipOnly
            ? `A thank-you on top of the agreed price, sent to ${otherName || "them"} in GCash.`
            : "Extra you sent on top, as a thank-you. Leave it empty for no tip."}
        </small>

        {!tipOnly && tip > 0 && total !== null && (
          <p className="text-white fs-7 mb-3" data-pay-total>
            Total you sent in GCash: <strong>{formatPeso(total)}</strong>{" "}
            <span className="text-white-50">({formatPeso(price)} + {formatPeso(tip)} tip)</span>
          </p>
        )}

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
            {sending ? <Busy kind="send">Sending</Busy> : "Send record"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
