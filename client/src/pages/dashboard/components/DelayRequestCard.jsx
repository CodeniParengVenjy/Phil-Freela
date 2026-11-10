import { useCallback, useEffect, useState } from "react";
import { Busy } from "../../../components/Loaders";
import { DELAY_MAX_REQUESTS, answerDelay, cancelDelayRequest, delayView, delayWhat, listDelayRequests } from "../../../lib/delayRequests";
import { formatDay } from "../../../lib/projects";
import DelayRequestDialog from "./DelayRequestDialog";

// On a project's page (PLAN-delay-requests.md): asking the other person for more time.
//   - the freelancer can ask the client for more time to SEND the work (before it is sent)
//   - the client can ask the freelancer for more time to PAY (before the payment day)
//   - the other person sees the request here, with Accept and Decline
// Accepting moves the date (the project's due date, or its payment day), so the page reads
// the project again. Shows nothing when there is nothing to ask, answer or tell, while
// loading, or when the database can't answer (for example before that SQL is run).
// payments: the project's payments (the Payments section tells the page), or null while loading.
export default function DelayRequestCard({ project, payments, userId, otherName, showToast, onChanged }) {
  // null until read (or when it can't be read), then the project's requests.
  const [requests, setRequests] = useState(null);
  // The request being answered or cancelled right now (disables its buttons).
  const [busyId, setBusyId] = useState("");
  const [asking, setAsking] = useState(false);

  const load = useCallback(() => listDelayRequests(project.id).then(setRequests), [project.id]);

  useEffect(() => {
    let active = true;
    listDelayRequests(project.id).then((list) => {
      if (active) setRequests(list);
    });
    return () => {
      active = false;
    };
  }, [project.id]);

  const view = requests ? delayView({ project, requests, payments, userId }) : null;
  if (!view || !(view.canAsk || view.myPending || view.waitingForMe || view.history.length)) return null;

  const respond = async (request, accept) => {
    setBusyId(request.id);
    const problem = await answerDelay(request.id, accept);
    setBusyId("");
    if (problem) {
      showToast(problem);
      await load();
      return;
    }
    showToast(accept ? "You agreed. The new date is saved." : "You declined. The date stays the same.");
    await load();
    onChanged?.();
  };

  const handleCancel = async (request) => {
    setBusyId(request.id);
    const problem = await cancelDelayRequest(request.id);
    setBusyId("");
    if (problem) showToast(problem);
    await load();
  };

  const handleSent = async () => {
    setAsking(false);
    showToast(`Your request was sent. ${otherName} will answer it here.`);
    await load();
  };

  const { waitingForMe, myPending } = view;

  return (
    <div className="mb-4" data-delay-requests>
      {waitingForMe && (
        <div className="alert alert-info fs-7 py-2 mb-2 d-flex flex-column flex-sm-row align-items-sm-center gap-2" role="status">
          <span className="flex-grow-1 text-break">
            <i className="bi bi-clock-history me-1"></i>
            {otherName} asks for more time to {delayWhat(waitingForMe.kind)}: until {formatDay(waitingForMe.to_date)} instead of{" "}
            {formatDay(waitingForMe.from_date)}.
            <span className="d-block">Reason: "{waitingForMe.reason}"</span>
          </span>
          <span className="d-flex flex-wrap gap-2 flex-shrink-0">
            <button type="button" className="btn btn-sm btn-dark rounded-pill px-3 fw-bold" disabled={busyId === waitingForMe.id} onClick={() => respond(waitingForMe, true)}>
              {busyId === waitingForMe.id ? <Busy>Saving</Busy> : "Accept"}
            </button>
            <button type="button" className="btn btn-sm btn-outline-dark rounded-pill px-3 fw-bold" disabled={busyId === waitingForMe.id} onClick={() => respond(waitingForMe, false)}>
              Decline
            </button>
          </span>
        </div>
      )}

      {myPending && (
        <div className="alert alert-secondary fs-7 py-2 mb-2 d-flex flex-column flex-sm-row align-items-sm-center gap-2" role="status">
          <span className="flex-grow-1 text-break">
            <i className="bi bi-hourglass-split me-1"></i>
            You asked {otherName} for more time to {delayWhat(myPending.kind)}, until {formatDay(myPending.to_date)}. Waiting for the answer. The
            old day, {formatDay(myPending.from_date)}, stands until then.
          </span>
          <button type="button" className="btn btn-sm btn-outline-dark rounded-pill px-3 fw-bold flex-shrink-0" disabled={busyId === myPending.id} onClick={() => handleCancel(myPending)}>
            {busyId === myPending.id ? <Busy>Cancelling</Busy> : "Cancel request"}
          </button>
        </div>
      )}

      {view.canAsk && (
        <div className="d-flex flex-wrap align-items-center gap-2">
          <button type="button" className="btn btn-sm btn-outline-secondary rounded-pill px-3 fw-bold" onClick={() => setAsking(true)}>
            <i className="bi bi-clock-history me-1"></i>Ask for more time to {delayWhat(view.myKind)}
          </button>
          <span className="text-secondary fs-8">
            {view.left} of {DELAY_MAX_REQUESTS} requests left
          </span>
        </div>
      )}

      {view.history.length > 0 && (
        <ul className="list-unstyled text-secondary fs-8 mt-2 mb-0">
          {view.history.map((request) => (
            <li key={request.id}>
              {request.asked_by === userId ? "You" : otherName} asked for more time to {delayWhat(request.kind)}, until {formatDay(request.to_date)}:{" "}
              {request.status}.
            </li>
          ))}
        </ul>
      )}

      {asking && (
        <DelayRequestDialog
          projectId={project.id}
          projectTitle={project.title}
          kind={view.myKind}
          currentDay={view.currentDay}
          minDay={view.minDay}
          maxDay={view.maxDay}
          otherName={otherName}
          onClose={() => setAsking(false)}
          onSent={handleSent}
        />
      )}
    </div>
  );
}
