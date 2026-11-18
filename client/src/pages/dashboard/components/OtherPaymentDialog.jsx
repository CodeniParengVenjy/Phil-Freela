import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PAYMENT_METHODS, checkReceiptFile, isValidTransactionNumber, uploadReceipt } from "../../../lib/payments";
import { currencyInfo, formatMoney, moneyRule, parseMoney } from "../../../lib/money";
import "../payments.css";
import { Busy } from "../../../components/Loaders";
import { closeOnBackdrop } from "../../../lib/backdrop";

const round = (value, decimals) => Math.round(value * 10 ** decimals) / 10 ** decimals;

// "Record your payment" for a price in another currency (PLAN-currencies.md, Step 5).
// GCash and its AI receipt check are only for pesos, so here the client types what
// they sent and how: the amount, an optional tip, the way (PayPal, Wise, bank...),
// the transaction number, and a screenshot as proof. The database checks the same
// rules as for GCash (what is left to pay, the tip rule); the freelancer checks that
// the money arrived and answers. The parent mounts it only while it is open.
//   currency: the project's (or the chat request's) currency
//   userId: the client, for the screenshot's private folder
//   submit({ amount, tip, method, reference, receiptPath }) -> { error } or { id }
//   onRecorded(): called after a payment was recorded
//   maxAmount: on a one-time project with an agreed price, what is left to pay
//   requestedAmount: on a chat card, what was asked for (starts in the Amount box)
//   tipOnly: the project is fully paid, so the whole amount is a tip
export default function OtherPaymentDialog({
  currency, userId, subtitle, otherName, maxAmount = null, requestedAmount = null, tipOnly = false, submit, onClose, onRecorded
}) {
  const { code: currencyCode, decimals } = currencyInfo(currency);
  const money = (value) => formatMoney(value, currency);
  const [amountText, setAmountText] = useState(requestedAmount != null ? String(requestedAmount) : maxAmount != null && !tipOnly ? String(maxAmount) : "");
  const [tipText, setTipText] = useState("");
  const [method, setMethod] = useState("");
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

  const total = parseMoney(amountText, currency);
  const tip = tipOnly ? total : tipText.trim() === "" ? 0 : parseMoney(tipText, currency);
  const price = total !== null && tip !== null ? round(total - tip, decimals) : null;

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
  const findProblem = () => {
    if (total === null) return moneyRule(currency);
    if (tip === null) return `Enter the tip as an amount in ${currencyCode}, or leave the Tip box empty.`;
    if (tip > total) return `The tip can't be more than the ${money(total)} you sent.`;
    if (maxAmount !== null && !tipOnly && price > maxAmount) {
      return `Only ${money(maxAmount)} is left to pay. Put the extra ${money(round(total - maxAmount, decimals))} in the Tip box.`;
    }
    if (maxAmount !== null && !tipOnly && tip > 0 && price < maxAmount) {
      return `A tip can be added only when you pay everything that is left (${money(maxAmount)}).`;
    }
    if (!method) return "Pick how you sent the money.";
    if (!isValidTransactionNumber(reference)) return "Type the transaction number of your payment: 4 to 60 letters or numbers.";
    if (!file) return "Add a screenshot of the payment to continue.";
    return "";
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending) return;
    const problem = findProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setSending(true);
    setError("");
    const uploaded = await uploadReceipt(userId, file);
    if (uploaded.error) {
      setSending(false);
      setError(uploaded.error);
      return;
    }
    const outcome = await submit({ amount: total, tip, method, reference, receiptPath: uploaded.path });
    setSending(false);
    if (outcome.error) {
      setError(outcome.error);
      return;
    }
    onRecorded?.(outcome);
  };

  // How the amount compares with what is left to pay.
  const leftAfter = maxAmount !== null && !tipOnly && price !== null && price < maxAmount ? round(maxAmount - price, decimals) : null;
  const inputClass = "form-control bg-secondary bg-opacity-25 border-secondary text-white";

  return createPortal(
    <div
      className="role-confirm-backdrop"
      style={{
        position: "fixed", inset: 0, zIndex: 1300,
        background: "rgba(0,0,0,0.65)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem"
      }}
      {...closeOnBackdrop(sending ? undefined : onClose)}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="other-payment-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 460, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
        data-other-payment
      >
        <h5 id="other-payment-title" className="fw-bold mb-1">{tipOnly ? "Record your tip" : "Record your payment"}</h5>
        {subtitle && <p className="text-secondary fs-7 mb-3 text-break">{subtitle}</p>}

        <label htmlFor="otherAmount" className="form-label text-white-50 fw-semibold fs-7">
          {tipOnly ? "Tip you sent" : "Amount you sent"} ({currencyCode})
        </label>
        <input
          id="otherAmount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className={`${inputClass} mb-1`}
          placeholder={decimals === 0 ? "e.g. 5000" : "e.g. 50.00"}
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          maxLength={16}
          disabled={sending}
        />
        {maxAmount !== null && !tipOnly && <small className="text-secondary fs-8 d-block mb-2">Left to pay: {money(maxAmount)}.</small>}

        {!tipOnly && (
          <>
            <label htmlFor="otherTip" className="form-label text-white-50 fw-semibold fs-7 mt-2">Of this, a tip (optional)</label>
            <input
              id="otherTip"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className={`${inputClass} mb-1`}
              placeholder={decimals === 0 ? "0" : "0.00"}
              value={tipText}
              onChange={(event) => setTipText(event.target.value)}
              maxLength={16}
              disabled={sending}
            />
            {tip > 0 && price !== null && price >= 0 && (
              <p className="text-white fs-7 mb-1" data-pay-split>
                For the {requestedAmount === null ? "project" : "request"}: <strong>{money(price)}</strong> <span className="text-white-50">+ {money(tip)} tip</span>
              </p>
            )}
            {leftAfter !== null && <small className="text-warning fs-8 d-block mb-1">{money(leftAfter)} will still be left to pay. You can pay the rest later.</small>}
          </>
        )}

        <label htmlFor="otherMethod" className="form-label text-white-50 fw-semibold fs-7 mt-2">Sent with</label>
        <select
          id="otherMethod"
          className="form-select bg-secondary bg-opacity-25 border-secondary text-white mb-2"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          disabled={sending}
        >
          <option value="" disabled>Pick how you sent it...</option>
          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        <label htmlFor="otherReference" className="form-label text-white-50 fw-semibold fs-7">Transaction number</label>
        <input
          id="otherReference"
          type="text"
          autoComplete="off"
          className={`${inputClass} mb-1 pay-mono`}
          placeholder="e.g. 8MC58520K7463920H"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          maxLength={70}
          disabled={sending}
        />
        <small className="text-secondary fs-8 d-block mb-3">The ID PayPal, Wise or your bank shows for this payment.</small>

        <span className="form-label text-white-50 fw-semibold fs-7 d-block">Screenshot of the payment</span>
        <div className="d-flex align-items-center gap-3 mb-1">
          {preview && <img src={preview} alt="Your payment screenshot" className="pay-receipt-thumb" />}
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
        <small className="text-secondary fs-8 d-block mb-3">
          JPG, PNG or WebP, 5 MB at most. Only you{otherName ? ` and ${otherName}` : " and the other person"} can open it.
          There is no AI check for payments outside GCash: {otherName || "the freelancer"} checks that the money arrived and answers.
        </small>

        {error && <p className="text-danger fs-7 mb-3 mt-2" role="alert">{error}</p>}

        <div className="d-flex gap-2 justify-content-end mt-3">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={sending}>
            {sending ? <Busy kind="send">Sending</Busy> : "Send record"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
