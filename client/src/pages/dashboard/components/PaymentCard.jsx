import { useEffect, useState } from "react";
import {
  cancelPaymentRequest, confirmPayment, formatGcashNumber, formatPeso, formatReference, getRequestPayDetails,
  isShortPayment, markNotReceived, openReceipt, paymentBadge, readReceiptScreenshot, recordChatPayment
} from "../../../lib/payments";
import ReceiptCheckNote from "./ReceiptCheckNote";
import RecordPaymentDialog from "./RecordPaymentDialog";
import ShortPaymentForm from "./ShortPaymentForm";
import "../payments.css";
import { Loader, Busy } from "../../../components/Loaders";

const when = (value) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// A payment request card in a chat (PLAN-gcash-payments.md). One card changes as
// the payment moves: Requested, Payment sent, Confirmed (or Received less,
// PLAN-short-payment.md), Not received, Cancelled. The payer can add a tip.
//   payment: the row from the payments table
//   currentUserId: who is looking. The freelancer is payment.freelancer_id (asked
//     for the money); the person asked to pay is payment.client_id.
//   otherName: the other person in the chat
//   onChanged(): called after anything changed here, so the chat reads the payment again
//   onReport(payment): the Report button on a payment answered "Not received" or "Received less"
export default function PaymentCard({ payment, currentUserId, otherName, showToast, onChanged, onReport }) {
  const iAmPayer = payment.client_id === currentUserId;
  const status = paymentBadge(payment);
  const short = isShortPayment(payment);
  const tip = Number(payment.tip_amount || 0);
  const [details, setDetails] = useState(undefined);
  const [detailsError, setDetailsError] = useState("");
  const [recording, setRecording] = useState(false);
  // The two-step question before an answer or a cancel: "confirm" | "short" | "not_received" | "cancel" | null.
  const [asking, setAsking] = useState(null);
  const [working, setWorking] = useState(false);

  // Where to pay: only the person asked to pay, only while the request waits.
  const waitingForPayer = iAmPayer && payment.status === "requested";
  useEffect(() => {
    if (!waitingForPayer) return undefined;
    let active = true;
    getRequestPayDetails(payment.id).then(({ data, error }) => {
      if (!active) return;
      if (error) setDetailsError(error);
      else setDetails(data);
    });
    return () => {
      active = false;
    };
  }, [waitingForPayer, payment.id]);

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(details.gcash_number);
      showToast("GCash number copied.");
    } catch {
      showToast("Couldn't copy it here. Select the number and copy it by hand.");
    }
  };

  // The record window: the AI reads the screenshot for this request, then the
  // payment is recorded from that reading (PLAN-receipt-ai.md).
  const handleRead = (file) => readReceiptScreenshot({ paymentId: payment.id, file });
  const handleRecord = ({ checkId, tip: tipPart }) => recordChatPayment({ paymentId: payment.id, checkId, tip: tipPart });

  // "Received less" was saved.
  const handleShortDone = () => {
    setAsking(null);
    onChanged();
    showToast("Saved. They were told what arrived.");
  };

  const handleRecorded = () => {
    setRecording(false);
    onChanged();
    showToast(`Payment recorded. ${otherName} was told and will check their GCash.`);
  };

  const handleAnswer = async (kind) => {
    setWorking(true);
    const problem = kind === "confirm" ? await confirmPayment(payment.id)
      : kind === "not_received" ? await markNotReceived(payment.id)
        : await cancelPaymentRequest(payment.id);
    setWorking(false);
    setAsking(null);
    onChanged();
    if (problem) {
      showToast(problem);
      return;
    }
    showToast(kind === "confirm" ? "Payment confirmed. They were told."
      : kind === "not_received" ? "Saved. They were told it didn't arrive."
        : "Request cancelled.");
  };

  const handleViewReceipt = async () => {
    const problem = await openReceipt(payment.receipt_path);
    if (problem) showToast(problem);
  };

  // The question that comes before an answer: it can't be undone.
  const questionText = {
    confirm: `Is ${formatPeso(payment.amount)} in your GCash with this reference? You can't change your answer afterwards.`,
    not_received: "Say that this payment did not arrive? You can't change your answer afterwards.",
    cancel: "Cancel this request? Nobody has paid it yet."
  };
  const yesText = { confirm: "Yes, I received it", not_received: "Yes, it didn't arrive", cancel: "Yes, cancel it" };

  return (
    <div
      className={`align-self-${iAmPayer ? "start" : "end"} w-100 max-w-500 p-3 rounded-4 border border-secondary border-opacity-50 bg-dark text-white`}
      data-payment-card={payment.status}
    >
      <div className="d-flex align-items-center justify-content-between gap-2 mb-1">
        <span className="fs-9 fw-bold text-uppercase text-white-50" style={{ letterSpacing: "0.06em" }}>Payment request</span>
        <span className={`badge rounded-pill px-3 py-2 ${status.className}`}>{status.label}</span>
      </div>
      <div className="fs-3 fw-bold lh-1">
        {formatPeso(payment.amount)}
        {tip > 0 && <span className="text-white-50 fw-normal fs-8 ms-2">incl. {formatPeso(tip)} tip</span>}
      </div>
      {payment.note && <p className="text-white-50 fs-7 mb-0 mt-1 text-break">{payment.note}</p>}

      {/* The person asked to pay: where to send it. */}
      {waitingForPayer && (
        <div className="mt-3">
          {detailsError && <p className="text-danger fs-7 mb-2">{detailsError}</p>}
          {!detailsError && details === undefined && <Loader size="sm" label="Loading where to pay" className="mb-2" />}
          {!detailsError && details === null && (
            <p className="text-white-50 fs-7 mb-2">{otherName} hasn't saved their GCash details, so there is nowhere to send the money. Message them.</p>
          )}
          {details && (
            <div className="p-3 rounded-3 bg-secondary bg-opacity-10 border border-secondary border-opacity-25 mb-2">
              <div>
                <span className="text-secondary fs-8 d-block">Send to</span>
                <strong className="text-white d-block text-break" data-pay-initials>{details.initials}</strong>
                <span className="pay-mono text-white fs-5 d-block">{formatGcashNumber(details.gcash_number)}</span>
                <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 py-1 fs-8 fw-bold mt-2" onClick={copyNumber}>
                  <i className="bi bi-clipboard me-1"></i> Copy number
                </button>
              </div>
            </div>
          )}
          <p className="text-secondary fs-8 mb-2">
            Pay in your GCash app, then tap I've paid. GCash hides part of the name when you send: the first letters should match
            these initials{details ? ` (${details.initials})` : ""}. If they don't, don't send. Only pay people you trust:
            PhilFreela can't check or refund this payment.
          </p>
          <button type="button" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" onClick={() => setRecording(true)} disabled={!details}>
            <i className="bi bi-check2-circle me-1"></i> I've paid
          </button>
        </div>
      )}

      {/* The freelancer waits, and can take the request back. */}
      {!iAmPayer && payment.status === "requested" && (
        <div className="mt-3">
          <p className="text-white-50 fs-7 mb-2">Waiting for {otherName} to pay.</p>
          {asking === "cancel" ? null : (
            <button type="button" className="btn btn-link text-white-50 text-decoration-underline p-0 fs-8" onClick={() => setAsking("cancel")}>
              Cancel request
            </button>
          )}
        </div>
      )}

      {/* What was recorded. */}
      {payment.reference_no && (
        <p className="text-white-50 fs-8 mb-0 mt-3">
          Reference <span className="pay-mono text-white">{formatReference(payment.reference_no)}</span>
          {" · "}Recorded {when(payment.created_at)}
          {payment.status === "confirmed" && payment.answered_at && <>{" · "}Confirmed {when(payment.answered_at)}</>}
        </p>
      )}
      {payment.reference_no && (
        <div className="mt-2">
          <ReceiptCheckNote payment={payment} forFreelancer={!iAmPayer} />
        </div>
      )}
      {payment.status === "sent" && iAmPayer && <p className="text-white-50 fs-7 mb-0 mt-2">Waiting for {otherName} to check their GCash and confirm.</p>}
      {payment.status === "confirmed" && !short && (
        <p className="text-success fs-7 mb-0 mt-2"><i className="bi bi-check-circle-fill me-1"></i>{iAmPayer ? `${otherName} confirmed this payment.` : "You confirmed this payment."}</p>
      )}
      {short && (
        <p className="text-warning fs-7 mb-0 mt-2" data-short-note>
          <i className="bi bi-exclamation-triangle-fill me-1"></i>
          {iAmPayer
            ? `${otherName} checked their GCash: only ${formatPeso(payment.received_amount)} arrived, not ${formatPeso(payment.amount)}. Message them to sort it out.`
            : `You said only ${formatPeso(payment.received_amount)} arrived, not ${formatPeso(payment.amount)}.`}
        </p>
      )}
      {payment.status === "not_received" && (
        <p className="text-danger fs-7 mb-0 mt-2">
          <i className="bi bi-exclamation-circle-fill me-1"></i>
          {iAmPayer
            ? `${otherName} says this payment didn't arrive. Message them to sort it out, or ask them to send a new request.`
            : "You said this payment didn't arrive."}
        </p>
      )}
      {payment.status === "cancelled" && (
        <p className="text-white-50 fs-7 mb-0 mt-2">{iAmPayer ? `${otherName} cancelled this request.` : "You cancelled this request."}</p>
      )}

      {/* "Received less": what really arrived. */}
      {asking === "short" && (
        <div className="mt-3">
          <ShortPaymentForm payment={payment} onDone={handleShortDone} onCancel={() => setAsking(null)} />
        </div>
      )}

      {/* The two-step question. */}
      {asking && asking !== "short" && (
        <div className="p-2 rounded-3 border border-secondary border-opacity-50 mt-3">
          <p className="text-white fs-7 mb-2">{questionText[asking]}</p>
          <div className="d-flex flex-wrap gap-2">
            <button
              type="button"
              className={`btn rounded-pill px-3 fs-7 fw-bold text-white ${asking === "confirm" ? "btn-success" : "btn-danger"}`}
              disabled={working}
              onClick={() => handleAnswer(asking)}
            >
              {working ? <Busy>Saving</Busy> : yesText[asking]}
            </button>
            <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-3 fs-7" disabled={working} onClick={() => setAsking(null)}>
              {asking === "cancel" ? "Keep it" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* The freelancer's answer to a payment that was sent. */}
      {!asking && !iAmPayer && payment.status === "sent" && (
        <div className="mt-3">
          <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-success text-white rounded-pill px-3 fs-7 fw-bold" onClick={() => setAsking("confirm")}>
              <i className="bi bi-check-lg me-1"></i> Confirm received
            </button>
            <button type="button" className="btn btn-dark border border-warning text-warning rounded-pill px-3 fs-7 fw-bold" onClick={() => setAsking("short")}>
              <i className="bi bi-dash-circle me-1"></i> Received less
            </button>
            <button type="button" className="btn btn-dark border border-danger text-danger rounded-pill px-3 fs-7 fw-bold" onClick={() => setAsking("not_received")}>
              <i className="bi bi-x-lg me-1"></i> Not received
            </button>
          </div>
          <small className="text-secondary fs-8 d-block mt-2">Open your GCash history first. Confirm only when the amount and reference match. If less arrived, use Received less.</small>
        </div>
      )}

      {(payment.receipt_path || ((payment.status === "not_received" || short) && onReport)) && (
        <div className="d-flex flex-wrap gap-2 mt-3">
          {payment.receipt_path && (
            <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-8 fw-bold" onClick={handleViewReceipt}>
              <i className="bi bi-receipt me-1"></i> View receipt
            </button>
          )}
          {(payment.status === "not_received" || short) && onReport && (
            <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-3 fs-8" onClick={() => onReport(payment)}>
              <i className="bi bi-flag me-1"></i> Report
            </button>
          )}
        </div>
      )}

      {recording && (
        <RecordPaymentDialog
          subtitle={`Paid to ${otherName} in the GCash app`}
          otherName={otherName}
          requestedAmount={Number(payment.amount)}
          read={handleRead}
          submit={handleRecord}
          onClose={() => setRecording(false)}
          onRecorded={handleRecorded}
        />
      )}
    </div>
  );
}
