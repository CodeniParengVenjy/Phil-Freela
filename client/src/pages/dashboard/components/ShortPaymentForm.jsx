import { useState } from "react";
import { confirmShortPayment, formatPeso, formatReference, parseAmount } from "../../../lib/payments";
import { Busy } from "../../../components/Loaders";

// "Received less" (PLAN-short-payment.md): the freelancer opened their GCash and
// less arrived than the client recorded. They type what really arrived; the
// database saves the payment as confirmed with that amount, only that counts
// toward the price, and the client is told what is still unpaid. Shown in place
// of the answer buttons, on the project page and on a chat payment card.
//   payment: the payment being answered (status "sent")
//   onDone(problem): called after saving ("" when saved, else the message to show)
//   onCancel(): back to the answer buttons
export default function ShortPaymentForm({ payment, onDone, onCancel }) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const recorded = Number(payment.amount);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (working) return;
    const got = parseAmount(text);
    if (got === null) {
      setError("Enter how much arrived, like 700. If nothing arrived, use Not received.");
      return;
    }
    if (got >= recorded) {
      setError(`That is the whole ${formatPeso(recorded)}. Use Confirm received instead.`);
      return;
    }
    setWorking(true);
    setError("");
    const problem = await confirmShortPayment(payment.id, got);
    setWorking(false);
    if (problem) {
      setError(problem);
      return;
    }
    onDone("");
  };

  return (
    <form className="p-2 rounded-3 border border-warning border-opacity-50 mb-2" onSubmit={handleSubmit} noValidate data-short-form>
      <label htmlFor={`got-${payment.id}`} className="text-white fs-7 fw-semibold d-block mb-1">How much arrived in your GCash?</label>
      <p className="text-white-50 fs-8 mb-2">
        The client recorded {formatPeso(recorded)}
        {payment.reference_no ? <> with reference <span className="pay-mono text-white">{formatReference(payment.reference_no)}</span></> : null}.
        Only what arrived counts as paid, and the client is told what is still unpaid. You can't change your answer afterwards.
      </p>
      <div className="d-flex flex-wrap gap-2 align-items-start">
        <input
          id={`got-${payment.id}`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="form-control form-control-sm bg-secondary bg-opacity-25 border-secondary text-white"
          style={{ maxWidth: 160 }}
          placeholder="700.00"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={14}
          disabled={working}
          autoFocus
        />
        <button type="submit" className="btn btn-warning text-dark rounded-pill px-3 fs-7 fw-bold" disabled={working}>
          {working ? <Busy>Saving</Busy> : "Save what arrived"}
        </button>
        <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-3 fs-7" disabled={working} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {error && <p className="text-danger fs-8 mb-0 mt-2" role="alert">{error}</p>}
    </form>
  );
}
