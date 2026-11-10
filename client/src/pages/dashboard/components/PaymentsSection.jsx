import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { priceText } from "../../../lib/projectPrice";
import {
  confirmPayment, formatGcashNumber, formatPeso, formatReference, getMyGcash, getPayDetails, isShortPayment, listProjectPayments,
  markNotReceived, openReceipt, paymentBadge, projectMoney, readReceiptScreenshot, recordPayment, watchProjectPayments
} from "../../../lib/payments";
import ReceiptCheckNote from "./ReceiptCheckNote";
import ReceiptReady from "./ReceiptReady";
import RecordPaymentDialog from "./RecordPaymentDialog";
import ShortPaymentForm from "./ShortPaymentForm";
import "../payments.css";
import { Loader, Busy } from "../../../components/Loaders";

const when = (value) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// The Payments section of the project page (PLAN-gcash-payments.md). PhilFreela
// never touches the money: the client pays in the GCash app and records it here,
// the freelancer checks their own GCash and answers. Both people use it:
//  - client: where to pay (the initials of the freelancer's GCash name and their
//    number), "I've paid",
//    and the list of payments
//  - freelancer: the list, with Confirm received / Received less / Not received
//    on a payment that is waiting for their answer
//  - both, on a one-time project with an agreed price: the balance ("Paid ₱700
//    of ₱1,500, ₱800 left"), PLAN-short-payment.md. The client can add a tip.
// Props: project (a row from getProject), iAmClient, currentUserId, otherName,
// otherId, showToast, openChat, onReport(payment) (the Report link on a
// payment answered "Not received" or "Received less"; left out = no link), and onPaymentsChange(list)
// (optional: told each time the list is read, so the project page can unlock the
// sent work as soon as a payment is confirmed).
export default function PaymentsSection({ project, iAmClient, currentUserId, otherName, otherId, showToast, openChat, onReport, onPaymentsChange }) {
  const projectId = project.id;
  // The latest onPaymentsChange, read by the list loader below without
  // starting the live subscription again every time the page draws.
  const onPaymentsChangeRef = useRef(onPaymentsChange);
  useEffect(() => {
    onPaymentsChangeRef.current = onPaymentsChange;
  });
  // undefined while loading, then the list (newest first).
  const [payments, setPayments] = useState(undefined);
  const [paymentsError, setPaymentsError] = useState("");
  // Goes up after something changed here, so the list is read again.
  const [reloadKey, setReloadKey] = useState(0);
  // The client's view of where to pay: undefined while loading, null when the
  // freelancer has saved no details yet, else { initials, gcash_number } (the
  // database never sends the full name).
  const [details, setDetails] = useState(undefined);
  const [detailsError, setDetailsError] = useState("");
  // The freelancer's own check: have they saved GCash details? (undefined = loading)
  const [mineSaved, setMineSaved] = useState(undefined);
  // The record window: false (closed), "pay" (a payment) or "tip" (a tip alone,
  // once the project is fully paid).
  const [recording, setRecording] = useState(false);
  // The answer the freelancer is about to give: { id, kind: "confirm" | "short" | "not_received" }.
  const [asking, setAsking] = useState(null);
  const [working, setWorking] = useState(false);

  // The list, read again whenever something changes (also live, when the other
  // person answers).
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data, error } = await listProjectPayments(projectId);
      if (!active) return;
      if (error) {
        setPaymentsError(error);
        return;
      }
      setPaymentsError("");
      setPayments(data);
      onPaymentsChangeRef.current?.(data);
    };
    load();
    const stop = watchProjectPayments(projectId, load);
    return () => {
      active = false;
      stop();
    };
  }, [projectId, reloadKey]);

  // Where to pay (client only).
  useEffect(() => {
    if (!iAmClient) return undefined;
    let active = true;
    getPayDetails(projectId).then(({ data, error }) => {
      if (!active) return;
      if (error) setDetailsError(error);
      else setDetails(data);
    });
    return () => {
      active = false;
    };
  }, [iAmClient, projectId]);

  // The freelancer is told when nobody can pay them yet.
  useEffect(() => {
    if (iAmClient || !currentUserId) return undefined;
    let active = true;
    getMyGcash(currentUserId).then(({ data, error }) => {
      if (active) setMineSaved(error ? undefined : Boolean(data));
    });
    return () => {
      active = false;
    };
  }, [iAmClient, currentUserId]);

  // The project's agreed price (the Price box above), shown as a hint ("" while
  // there is none).
  const agreedPrice = project.price_status === "agreed" ? priceText(project.agreed_amount, project.price_basis) : "";
  // The balance: null when the project has no agreed one-time price (or the
  // list is still loading). The same rule as the database.
  const money = projectMoney(project, payments);

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(details.gcash_number);
      showToast("GCash number copied.");
    } catch {
      showToast("Couldn't copy it here. Select the number and copy it by hand.");
    }
  };

  // The record window: the AI reads the screenshot for this project, then the
  // payment is recorded from that reading (PLAN-receipt-ai.md).
  const handleRead = (file) => readReceiptScreenshot({ projectId, file });
  const handleRecord = ({ checkId, tip }) => recordPayment({ projectId, checkId, tip });

  const handleRecorded = () => {
    setRecording(false);
    setReloadKey((n) => n + 1);
    showToast(`Payment recorded. ${otherName} was told and will check their GCash.`);
  };

  // "Received less" was saved (or refused).
  const handleShortDone = (problem) => {
    setAsking(null);
    setReloadKey((n) => n + 1);
    showToast(problem || "Saved. The client was told what arrived and what is still unpaid.");
  };

  const handleAnswer = async (payment, kind) => {
    setWorking(true);
    const problem = kind === "confirm" ? await confirmPayment(payment.id) : await markNotReceived(payment.id);
    setWorking(false);
    setAsking(null);
    setReloadKey((n) => n + 1);
    if (problem) {
      showToast(problem);
      return;
    }
    showToast(kind === "confirm" ? "Payment confirmed. The client was told. The PDF receipt is ready under the payment." : "Saved. The client was told it didn't arrive.");
  };

  const handleViewReceipt = async (payment) => {
    const problem = await openReceipt(payment.receipt_path);
    if (problem) showToast(problem);
  };

  // Where to pay, for the client.
  const renderPayBox = () => {
    if (detailsError) return <p className="text-danger fs-7 mb-3">{detailsError}</p>;
    if (details === undefined) return <Loader size="sm" label="Loading where to pay" className="mb-3" />;
    if (details === null) {
      return (
        <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 mb-3">
          <p className="text-white-50 fs-7 mb-2">
            <i className="bi bi-info-circle me-1"></i>
            {otherName} hasn't added their GCash details yet, so there is nowhere to send the money. Message them and ask them to add it in Settings.
          </p>
          {otherId && openChat && (
            <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-7 fw-bold" onClick={() => openChat(otherId)}>
              <i className="bi bi-chat-dots-fill me-1"></i> Message {otherName}
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25 mb-3">
        <h5 className="text-white fw-bold fs-6 mb-3">Pay via GCash</h5>
        <div>
          <span className="text-secondary fs-8 d-block">Send to</span>
          <strong className="text-white d-block text-break" data-pay-initials>{details.initials}</strong>
          <span className="pay-mono text-white fs-5 d-block">{formatGcashNumber(details.gcash_number)}</span>
          <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 py-1 fs-8 fw-bold mt-2" onClick={copyNumber}>
            <i className="bi bi-clipboard me-1"></i> Copy number
          </button>
        </div>
        <p className="text-secondary fs-8 mt-3 mb-2">
          Pay in your GCash app, then come back and record it here. GCash hides part of the name when you send: the first
          letters should match these initials ({details.initials}). If they don't, don't send. Message {otherName} first.
        </p>
        {agreedPrice && <p className="text-secondary fs-8 mb-2">Agreed price: {agreedPrice}.</p>}
        {renderPayAction()}
      </div>
    );
  };

  // The client's button under "Pay via GCash". With a balance it depends on what
  // is left: pay the rest, wait for the freelancer, or (fully paid) a tip alone.
  const renderPayAction = () => {
    if (!money) {
      return (
        <>
          <p className="text-secondary fs-8 mb-2">Want to add a tip? Send it in the same GCash payment and put it in the Tip box when you record it.</p>
          <button type="button" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" onClick={() => setRecording("pay")}>
            <i className="bi bi-check2-circle me-1"></i> I've paid
          </button>
        </>
      );
    }
    if (money.fullyPaid) {
      return (
        <>
          <p className="text-success fs-7 mb-2"><i className="bi bi-check-circle-fill me-1"></i>Fully paid. Thank you!</p>
          <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 py-1 fs-8 fw-bold" onClick={() => setRecording("tip")}>
            <i className="bi bi-gift me-1"></i> Record a tip
          </button>
        </>
      );
    }
    if (money.leftForNew === 0) {
      return (
        <p className="text-white-50 fs-7 mb-0">
          <i className="bi bi-hourglass-split me-1"></i>
          The rest ({formatPeso(money.waiting)}) is recorded and waiting for {otherName} to check their GCash.
        </p>
      );
    }
    return (
      <>
        <p className="text-white fs-7 mb-1">Left to pay: <strong data-left-to-pay>{formatPeso(money.leftForNew)}</strong></p>
        <p className="text-secondary fs-8 mb-2">
          You can pay it all at once or in parts. Want to add a tip? Send it with the last payment and put it in the Tip box.
        </p>
        <button type="button" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" onClick={() => setRecording("pay")}>
          <i className="bi bi-check2-circle me-1"></i> I've paid
        </button>
      </>
    );
  };

  // The balance bar, for both people (one-time project with an agreed price).
  const renderBalance = () => {
    if (!money) return null;
    const percent = money.agreed > 0 ? Math.min(100, Math.round((money.paid / money.agreed) * 100)) : 0;
    return (
      <div className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25 mb-3" data-balance>
        <div className="d-flex flex-wrap align-items-baseline justify-content-between gap-2 mb-2">
          <span className="text-white fs-7">
            Paid <strong>{formatPeso(money.paid)}</strong> of {formatPeso(money.agreed)}
          </span>
          {money.fullyPaid
            ? <span className="badge rounded-pill bg-success text-white px-3 py-2">Fully paid</span>
            : <span className="text-warning fw-semibold fs-7">{formatPeso(money.left)} left</span>}
        </div>
        <div
          className="progress bg-secondary bg-opacity-25"
          style={{ height: 8 }}
          role="progressbar"
          aria-label="How much of the agreed price is paid"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={`progress-bar ${money.fullyPaid ? "bg-success" : "bg-role"}`} style={{ width: `${percent}%` }}></div>
        </div>
        {(money.waiting > 0 || money.tips > 0) && (
          <p className="text-white-50 fs-8 mb-0 mt-2">
            {money.waiting > 0 && <>{formatPeso(money.waiting)} recorded, waiting for {iAmClient ? otherName : "you"} to check GCash.</>}
            {money.waiting > 0 && money.tips > 0 && " "}
            {money.tips > 0 && <>Tips received: {formatPeso(money.tips)}.</>}
          </p>
        )}
        {!money.fullyPaid && project.files_locked && !project.unlocked_at && (
          <p className="text-secondary fs-8 mb-0 mt-1">
            {iAmClient ? "The original file" : "Your original file"} opens for {iAmClient ? "you" : "the client"} when the agreed price is fully paid.
          </p>
        )}
      </div>
    );
  };

  // One recorded payment.
  const renderPayment = (payment) => {
    const status = paymentBadge(payment);
    const short = isShortPayment(payment);
    const tip = Number(payment.tip_amount || 0);
    const waitingForMe = !iAmClient && payment.status === "sent";
    const isAsking = asking?.id === payment.id;
    return (
      <div key={payment.id} className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25" data-payment-status={short ? "short" : payment.status}>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
          <span className="text-white fw-bold fs-5">
            {formatPeso(payment.amount)}
            {tip > 0 && <span className="text-white-50 fw-normal fs-8 ms-2">incl. {formatPeso(tip)} tip</span>}
          </span>
          <span className={`badge rounded-pill px-3 py-2 ${status.className}`}>{status.label}</span>
        </div>
        <p className="text-white-50 fs-8 mb-2">
          Reference <span className="pay-mono text-white">{formatReference(payment.reference_no)}</span>
          {" · "}Recorded {when(payment.created_at)}
          {payment.answered_at && <>{" · "}Answered {when(payment.answered_at)}</>}
        </p>
        <ReceiptCheckNote payment={payment} forFreelancer={!iAmClient} />

        {payment.status === "sent" && iAmClient && (
          <p className="text-white-50 fs-7 mb-2">Waiting for {otherName} to check their GCash and confirm.</p>
        )}
        {payment.status === "confirmed" && !short && (
          <p className="text-success fs-7 mb-2"><i className="bi bi-check-circle-fill me-1"></i>{iAmClient ? `${otherName} confirmed this payment.` : "You confirmed this payment."}</p>
        )}
        {short && (
          <p className="text-warning fs-7 mb-2" data-short-note>
            <i className="bi bi-exclamation-triangle-fill me-1"></i>
            {iAmClient
              ? `${otherName} checked their GCash: only ${formatPeso(payment.received_amount)} arrived, not ${formatPeso(payment.amount)}. Message them to sort it out.`
              : `You said only ${formatPeso(payment.received_amount)} arrived, not ${formatPeso(payment.amount)}.`}
          </p>
        )}
        {payment.status === "not_received" && (
          <p className="text-danger fs-7 mb-2">
            <i className="bi bi-exclamation-circle-fill me-1"></i>
            {iAmClient
              ? `${otherName} says this payment didn't arrive. Message them to sort it out, or record it again with the right details.`
              : "You said this payment didn't arrive."}
          </p>
        )}
        {/* Confirmed (or Received less): the PDF receipt, for both people. */}
        <ReceiptReady payment={payment} showToast={showToast} />

        {isAsking && asking.kind === "short" ? (
          <ShortPaymentForm payment={payment} onDone={handleShortDone} onCancel={() => setAsking(null)} />
        ) : isAsking ? (
          <div className="p-2 rounded-3 border border-secondary border-opacity-50 mb-2">
            <p className="text-white fs-7 mb-2">
              {asking.kind === "confirm"
                ? `Is ${formatPeso(payment.amount)} in your GCash with this reference? You can't change your answer afterwards.`
                : "Say that this payment did not arrive? You can't change your answer afterwards."}
            </p>
            <div className="d-flex flex-wrap gap-2">
              <button
                type="button"
                className={`btn rounded-pill px-3 fs-7 fw-bold ${asking.kind === "confirm" ? "btn-success text-white" : "btn-danger text-white"}`}
                disabled={working}
                onClick={() => handleAnswer(payment, asking.kind)}
              >
                {working ? <Busy>Saving</Busy> : asking.kind === "confirm" ? "Yes, I received it" : "Yes, it didn't arrive"}
              </button>
              <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-3 fs-7" disabled={working} onClick={() => setAsking(null)}>Cancel</button>
            </div>
          </div>
        ) : waitingForMe && (
          <div className="mb-2">
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="btn btn-success text-white rounded-pill px-3 fs-7 fw-bold" onClick={() => setAsking({ id: payment.id, kind: "confirm" })}>
                <i className="bi bi-check-lg me-1"></i> Confirm received
              </button>
              <button type="button" className="btn btn-dark border border-warning text-warning rounded-pill px-3 fs-7 fw-bold" onClick={() => setAsking({ id: payment.id, kind: "short" })}>
                <i className="bi bi-dash-circle me-1"></i> Received less
              </button>
              <button type="button" className="btn btn-dark border border-danger text-danger rounded-pill px-3 fs-7 fw-bold" onClick={() => setAsking({ id: payment.id, kind: "not_received" })}>
                <i className="bi bi-x-lg me-1"></i> Not received
              </button>
            </div>
            <small className="text-secondary fs-8 d-block mt-2">Open your GCash history first. Confirm only when the amount and reference match. If less arrived, use Received less.</small>
          </div>
        )}

        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-8 fw-bold" onClick={() => handleViewReceipt(payment)}>
            <i className="bi bi-image me-1"></i> GCash screenshot
          </button>
          {short && iAmClient && money && money.leftForNew > 0 && details && (
            <button type="button" className="btn btn-gradient-role text-white rounded-pill px-3 fs-8 fw-bold" onClick={() => setRecording("pay")}>
              <i className="bi bi-cash-coin me-1"></i> Pay the rest ({formatPeso(money.leftForNew)})
            </button>
          )}
          {(payment.status === "not_received" || short) && iAmClient && otherId && openChat && (
            <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-8 fw-bold" onClick={() => openChat(otherId)}>
              <i className="bi bi-chat-dots-fill me-1"></i> Message
            </button>
          )}
          {(payment.status === "not_received" || short) && onReport && (
            <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-3 fs-8" onClick={() => onReport(payment)}>
              <i className="bi bi-flag me-1"></i> Report
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pt-4 mt-4 border-top border-secondary border-opacity-25" aria-labelledby="payments-heading" role="region">
      <h4 id="payments-heading" className="text-white fw-bold mb-3"><i className="bi bi-cash-coin text-role me-2"></i> Payments</h4>

      {renderBalance()}

      {iAmClient && renderPayBox()}

      {!iAmClient && mineSaved === false && (
        <p className="text-warning fs-7 mb-3">
          <i className="bi bi-exclamation-triangle me-1"></i>
          Clients can't see where to pay you yet. Add your GCash number in{" "}
          <Link to="/dashboard/settings" className="text-role fw-bold text-decoration-none">Settings, GCash Payment</Link>.
        </p>
      )}

      {paymentsError && <p className="text-danger fs-7 mb-0">{paymentsError}</p>}
      {!paymentsError && payments === undefined && <Loader size="sm" label="Loading the payments" />}
      {!paymentsError && payments?.length === 0 && (
        <p className="text-secondary fs-7 mb-0">
          {iAmClient
            ? "No payments recorded yet."
            : "No payments recorded yet. When the client records a payment, it shows here and you confirm it after checking your GCash."}
        </p>
      )}
      {payments?.length > 0 && <div className="d-flex flex-column gap-3">{payments.map(renderPayment)}</div>}

      {recording && (
        <RecordPaymentDialog
          subtitle={`Paid to ${otherName} in the GCash app`}
          otherName={otherName}
          tipOnly={recording === "tip"}
          maxAmount={money ? money.leftForNew : null}
          read={handleRead}
          submit={handleRecord}
          onClose={() => setRecording(false)}
          onRecorded={handleRecorded}
        />
      )}
    </div>
  );
}
