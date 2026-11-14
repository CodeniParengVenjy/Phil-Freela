import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { MAX_PAYMENT_NOTE_LENGTH, getMyGcash, getMyPaymentDetails, requestPayment } from "../../../lib/payments";
import { DEFAULT_CURRENCY, currencyInfo, moneyRule, parseMoney } from "../../../lib/money";
import CurrencySelect from "../../../components/CurrencySelect";
import { Busy } from "../../../components/Loaders";

// "Request payment" in a chat (PLAN-gcash-payments.md): the freelancer asks the
// other person to pay, with an amount, its currency (PLAN-currencies.md) and a short
// note. The database writes a payment card into the chat. For pesos the other person
// sees the initials of the freelancer's GCash name and the GCash number on that card;
// for any other currency they see the freelancer's "other payment details" (PayPal,
// Wise, bank...). Nobody else does. The parent mounts it only while it is open, so
// every opening starts empty.
//   userId: the freelancer (to check that they have saved where to be paid)
//   otherName: the person asked to pay
//   onSent(): called after the request was sent
export default function RequestPaymentDialog({ userId, conversationId, otherName, onClose, onSent }) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [note, setNote] = useState("");
  // undefined while loading, then whether GCash details / other payment details are saved.
  const [hasGcash, setHasGcash] = useState(undefined);
  const [hasOther, setHasOther] = useState(undefined);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const isPeso = currency === "PHP";
  const hasDetails = isPeso ? hasGcash : hasOther;

  useEffect(() => {
    let active = true;
    getMyGcash(userId).then(({ data, error: problem }) => {
      if (active) setHasGcash(problem ? undefined : Boolean(data));
    });
    getMyPaymentDetails(userId).then(({ data, error: problem }) => {
      if (active) setHasOther(problem ? undefined : Boolean(data));
    });
    return () => {
      active = false;
    };
  }, [userId]);

  // Escape closes the window, unless it is sending.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sending, onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (sending) return;
    const parsedAmount = parseMoney(amount, currency);
    if (parsedAmount === null) {
      setError(moneyRule(currency));
      return;
    }
    setSending(true);
    setError("");
    const result = await requestPayment({ conversationId, amount: parsedAmount, note: note.trim(), currency });
    setSending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSent?.(result);
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
        aria-labelledby="request-payment-title"
        className="role-confirm-card bg-dark text-white border border-secondary border-opacity-25 rounded-4 p-4"
        style={{ maxWidth: 460, width: "100%", maxHeight: "92vh", overflowY: "auto" }}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        noValidate
      >
        <h5 id="request-payment-title" className="fw-bold mb-1">Request payment</h5>
        <p className="text-secondary fs-7 mb-3 text-break">from {otherName} in this chat</p>

        {hasDetails === false && (
          <p className="text-warning fs-7 mb-3" data-request-setup-missing>
            <i className="bi bi-exclamation-triangle me-1"></i>
            {isPeso
              ? `Add your GCash details first, so ${otherName} can see where to pay. `
              : `Add your payment details for other currencies first (PayPal, Wise, bank...), so ${otherName} can see where to pay. `}
            <Link to="/dashboard/settings?tab=GCash%20Payment" className="text-role fw-bold text-decoration-none">Settings, GCash Payment</Link>
          </p>
        )}

        <label htmlFor="requestCurrency" className="form-label text-white-50 fw-semibold fs-7">Currency</label>
        <CurrencySelect id="requestCurrency" value={currency} onChange={setCurrency} disabled={sending} className="mb-3" ariaLabel="Currency of the request" />

        <label htmlFor="requestAmount" className="form-label text-white-50 fw-semibold fs-7">Amount ({currencyInfo(currency).code})</label>
        <input
          id="requestAmount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-3"
          placeholder={currencyInfo(currency).decimals === 0 ? "5000" : "400.00"}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          maxLength={16}
          disabled={sending}
        />

        <label htmlFor="requestNote" className="form-label text-white-50 fw-semibold fs-7">Note (optional)</label>
        <input
          id="requestNote"
          type="text"
          autoComplete="off"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-1"
          placeholder="Poster design, first half"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={MAX_PAYMENT_NOTE_LENGTH}
          disabled={sending}
        />
        <small className="text-secondary fs-8 d-block mb-3">{note.length}/{MAX_PAYMENT_NOTE_LENGTH}</small>

        <p className="text-secondary fs-8 mb-3">
          <i className="bi bi-shield-lock me-1"></i>
          {isPeso
            ? `${otherName} will see your GCash number and the initials of your name on the card.`
            : `${otherName} will see your payment details for other currencies on the card, and pays with PayPal, Wise, a bank transfer or a remittance.`}
          {" "}Nobody else can see them. Only one request can be open in a chat at a time.
        </p>

        {error && <p className="text-danger fs-7 mb-3" role="alert">{error}</p>}

        <div className="d-flex gap-2 justify-content-end">
          <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={sending || hasDetails === false}>
            {sending ? <Busy kind="send">Sending</Busy> : "Send request"}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
