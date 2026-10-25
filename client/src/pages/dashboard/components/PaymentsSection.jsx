import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
import { budgetText } from "../../../lib/jobTerms";
import {
  confirmPayment, formatGcashNumber, formatPeso, formatReference, getMyGcash, getPayDetails, getQrLink, listProjectPayments,
  markNotReceived, openReceipt, paymentStatuses, recordPayment, watchProjectPayments
} from "../../../lib/payments";
import RecordPaymentDialog from "./RecordPaymentDialog";
import "../payments.css";

const when = (value) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

// The Payments section of the project page (PLAN-gcash-payments.md). PhilFreela
// never touches the money: the client pays in the GCash app and records it here,
// the freelancer checks their own GCash and answers. Both people use it:
//  - client: where to pay (the freelancer's name, number and QR), "I've paid",
//    and the list of payments
//  - freelancer: the list, with Confirm received / Not received on a payment
//    that is waiting for their answer
// Props: project (a row from getProject), iAmClient, currentUserId, otherName,
// otherId, showToast, openChat, and onReport(payment) (the Report link on a
// payment answered "Not received"; left out = no link).
export default function PaymentsSection({ project, iAmClient, currentUserId, otherName, otherId, showToast, openChat, onReport }) {
  const projectId = project.id;
  // undefined while loading, then the list (newest first).
  const [payments, setPayments] = useState(undefined);
  const [paymentsError, setPaymentsError] = useState("");
  // Goes up after something changed here, so the list is read again.
  const [reloadKey, setReloadKey] = useState(0);
  // The client's view of where to pay: undefined while loading, null when the
  // freelancer has saved no details yet, else { account_name, gcash_number, qr_path }.
  const [details, setDetails] = useState(undefined);
  const [detailsError, setDetailsError] = useState("");
  // The QR link, kept with the file it is for: { path, link }.
  const [qr, setQr] = useState(null);
  // The freelancer's own check: have they saved GCash details? (undefined = loading)
  const [mineSaved, setMineSaved] = useState(undefined);
  const [budget, setBudget] = useState("");
  const [recording, setRecording] = useState(false);
  // The answer the freelancer is about to give: { id, kind: "confirm" | "not_received" }.
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

  const qrPath = details?.qr_path;
  useEffect(() => {
    if (!qrPath) return undefined;
    let active = true;
    getQrLink(qrPath).then((link) => {
      if (active) setQr({ path: qrPath, link });
    });
    return () => {
      active = false;
    };
  }, [qrPath]);
  const qrLink = qrPath && qr?.path === qrPath ? qr.link : null;

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

  // A project that came from a job post shows the post's budget as a hint.
  const jobPostId = project.job_post_id;
  useEffect(() => {
    if (!iAmClient || !jobPostId) return undefined;
    let active = true;
    supabase.from("job_posts").select("budget, budget_type").eq("id", jobPostId).maybeSingle().then(({ data }) => {
      if (active) setBudget(data ? budgetText(data) : "");
    });
    return () => {
      active = false;
    };
  }, [iAmClient, jobPostId]);

  const copyNumber = async () => {
    try {
      await navigator.clipboard.writeText(details.gcash_number);
      showToast("GCash number copied.");
    } catch {
      showToast("Couldn't copy it here. Select the number and copy it by hand.");
    }
  };

  const handleRecord = ({ amount, reference, receiptFile }) =>
    recordPayment({ userId: currentUserId, projectId, amount, reference, receiptFile });

  const handleRecorded = () => {
    setRecording(false);
    setReloadKey((n) => n + 1);
    showToast(`Payment recorded. ${otherName} was told and will check their GCash.`);
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
    showToast(kind === "confirm" ? "Payment confirmed. The client was told." : "Saved. The client was told it didn't arrive.");
  };

  const handleViewReceipt = async (payment) => {
    const problem = await openReceipt(payment.receipt_path);
    if (problem) showToast(problem);
  };

  // Where to pay, for the client.
  const renderPayBox = () => {
    if (detailsError) return <p className="text-danger fs-7 mb-3">{detailsError}</p>;
    if (details === undefined) return <p className="text-secondary fs-7 mb-3">Loading where to pay...</p>;
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
        <div className="d-flex flex-wrap align-items-center gap-3">
          {qrLink && <div className="pay-qr-tile"><img src={qrLink} alt={`${details.account_name}'s GCash QR`} /></div>}
          <div className="flex-grow-1 min-w-0">
            <span className="text-secondary fs-8 d-block">Send to</span>
            <strong className="text-white d-block text-break">{details.account_name}</strong>
            <span className="pay-mono text-white fs-5 d-block">{formatGcashNumber(details.gcash_number)}</span>
            <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 py-1 fs-8 fw-bold mt-2" onClick={copyNumber}>
              <i className="bi bi-clipboard me-1"></i> Copy number
            </button>
          </div>
        </div>
        <p className="text-secondary fs-8 mt-3 mb-2">
          Pay in your GCash app, then come back and record it here. {qrLink ? "On a computer you can scan the QR with your phone. " : ""}
          Check that the name GCash shows matches the name above before you send.
        </p>
        {budget && <p className="text-secondary fs-8 mb-2">Job budget: {budget}. The amount is up to you and {otherName}.</p>}
        <button type="button" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" onClick={() => setRecording(true)}>
          <i className="bi bi-check2-circle me-1"></i> I've paid
        </button>
      </div>
    );
  };

  // One recorded payment.
  const renderPayment = (payment) => {
    const status = paymentStatuses[payment.status] || { label: payment.status, className: "bg-secondary text-white" };
    const waitingForMe = !iAmClient && payment.status === "sent";
    const isAsking = asking?.id === payment.id;
    return (
      <div key={payment.id} className="p-3 rounded-3 bg-dark bg-opacity-50 border border-secondary border-opacity-25" data-payment-status={payment.status}>
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
          <span className="text-white fw-bold fs-5">{formatPeso(payment.amount)}</span>
          <span className={`badge rounded-pill px-3 py-2 ${status.className}`}>{status.label}</span>
        </div>
        <p className="text-white-50 fs-8 mb-2">
          Reference <span className="pay-mono text-white">{formatReference(payment.reference_no)}</span>
          {" · "}Recorded {when(payment.created_at)}
          {payment.answered_at && <>{" · "}Answered {when(payment.answered_at)}</>}
        </p>

        {payment.status === "sent" && iAmClient && (
          <p className="text-white-50 fs-7 mb-2">Waiting for {otherName} to check their GCash and confirm.</p>
        )}
        {payment.status === "confirmed" && (
          <p className="text-success fs-7 mb-2"><i className="bi bi-check-circle-fill me-1"></i>{iAmClient ? `${otherName} confirmed this payment.` : "You confirmed this payment."}</p>
        )}
        {payment.status === "not_received" && (
          <p className="text-danger fs-7 mb-2">
            <i className="bi bi-exclamation-circle-fill me-1"></i>
            {iAmClient
              ? `${otherName} says this payment didn't arrive. Message them to sort it out, or record it again with the right details.`
              : "You said this payment didn't arrive."}
          </p>
        )}

        {isAsking ? (
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
                {working ? "Saving..." : asking.kind === "confirm" ? "Yes, I received it" : "Yes, it didn't arrive"}
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
              <button type="button" className="btn btn-dark border border-danger text-danger rounded-pill px-3 fs-7 fw-bold" onClick={() => setAsking({ id: payment.id, kind: "not_received" })}>
                <i className="bi bi-x-lg me-1"></i> Not received
              </button>
            </div>
            <small className="text-secondary fs-8 d-block mt-2">Open your GCash history first. Confirm only when the amount and reference match.</small>
          </div>
        )}

        <div className="d-flex flex-wrap gap-2">
          <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-8 fw-bold" onClick={() => handleViewReceipt(payment)}>
            <i className="bi bi-receipt me-1"></i> View receipt
          </button>
          {payment.status === "not_received" && iAmClient && otherId && openChat && (
            <button type="button" className="btn btn-dark border border-secondary text-white rounded-pill px-3 fs-8 fw-bold" onClick={() => openChat(otherId)}>
              <i className="bi bi-chat-dots-fill me-1"></i> Message
            </button>
          )}
          {payment.status === "not_received" && onReport && (
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

      {iAmClient && renderPayBox()}

      {!iAmClient && mineSaved === false && (
        <p className="text-warning fs-7 mb-3">
          <i className="bi bi-exclamation-triangle me-1"></i>
          Clients can't see where to pay you yet. Add your GCash number in{" "}
          <Link to="/dashboard/settings" className="text-role fw-bold text-decoration-none">Settings, GCash Payment</Link>.
        </p>
      )}

      {paymentsError && <p className="text-danger fs-7 mb-0">{paymentsError}</p>}
      {!paymentsError && payments === undefined && <p className="text-secondary fs-7 mb-0">Loading the payments...</p>}
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
          subtitle={`Paid to ${details?.account_name || otherName} in the GCash app`}
          otherName={otherName}
          hint={budget ? `Job budget: ${budget}. Enter what you sent.` : undefined}
          submit={handleRecord}
          onClose={() => setRecording(false)}
          onRecorded={handleRecorded}
        />
      )}
    </div>
  );
}
