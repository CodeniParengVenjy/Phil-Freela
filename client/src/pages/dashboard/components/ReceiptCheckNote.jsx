import { asSentence, receiptCheckLabel, receiptTime } from "../../../lib/payments";

// What the AI read on a recorded payment's receipt and what it thought of it
// (PLAN-receipt-ai.md), shown to both people on the project page and on a chat
// payment card: the date and time on the receipt, the initials GCash printed,
// and "no signs of a fake" or "look at it carefully" with the reasons. Shows
// nothing for a payment recorded before the receipt check existed.
//   payment: a row from the payments table
//   forFreelancer: the reasons are written for the person checking their GCash
export default function ReceiptCheckNote({ payment, forFreelancer }) {
  const label = receiptCheckLabel(payment);
  if (!label) return null;
  const reasons = payment.ai_verdict === "check" ? payment.ai_reasons || [] : [];
  return (
    <div className="fs-8 mb-2" data-receipt-check={payment.ai_verdict}>
      {(payment.paid_at || payment.receipt_initials) && (
        <p className="text-white-50 mb-1">
          On the receipt:
          {payment.receipt_initials && <> sent to <span className="text-white">{payment.receipt_initials}</span></>}
          {payment.receipt_initials && payment.paid_at && ","}
          {payment.paid_at && <> paid <span className="text-white">{receiptTime(payment.paid_at)}</span></>}
        </p>
      )}
      <p className={`text-${label.tone} mb-0`}>
        <i className={`bi ${label.icon} me-1`}></i>
        {label.text}
        {payment.ai_verdict === "check" && forFreelancer && payment.status === "sent" && " Make sure it is in your GCash before you confirm."}
      </p>
      {reasons.length > 0 && (
        <ul className={`text-${label.tone} mb-0 ps-3`}>
          {reasons.map((reason) => <li key={reason}>{asSentence(reason)}</li>)}
        </ul>
      )}
    </div>
  );
}
