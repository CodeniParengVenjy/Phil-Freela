import { useCallback, useEffect, useState } from "react";
import {
  APPEAL_MAX,
  allowLateFreelancer,
  answerLateAppeal,
  cancelLateAppeal,
  getProjectLateness,
  listLateAppeals
} from "../../../lib/lateBlock";
import { Busy } from "../../../components/Loaders";
import CensoredText from "../../../components/CensoredText";
import LateAppealDialog from "./LateAppealDialog";

// The words for an appeal that was answered or taken back.
const APPEAL_RESULT = { allowed: "allowed", declined: "declined", cancelled: "cancelled" };

// On a project's page: when the work wasn't sent by the due date, the
// freelancer can't apply to this client's job posts (lib/lateBlock.js).
//   - the client sees why and an "Allow to apply again" button
//   - the freelancer sees what happened and can APPEAL to the client
//     (PLAN-late-appeals.md): a short message, 2 per late project, one waiting
//     at a time; the client answers here with Allow or Decline
// Shows nothing for a project that wasn't late, or while the answer is loading.
export default function LateBlockNotice({ projectId, projectTitle, isClient, otherName, showToast }) {
  // null until loaded (or when the database can't answer), then { missed, allowedAt }.
  const [lateness, setLateness] = useState(null);
  // The project's appeals, oldest first ([] until read or when they can't be read).
  const [appeals, setAppeals] = useState([]);
  // The client pressed "Allow to apply again" and is asked to confirm.
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  // The open window: "appeal" (the freelancer writes one), "decline" (the client), or "".
  const [dialog, setDialog] = useState("");

  const loadAppeals = useCallback(
    () => listLateAppeals(projectId).then((list) => setAppeals(list || [])),
    [projectId]
  );

  useEffect(() => {
    let active = true;
    getProjectLateness(projectId).then((answer) => {
      if (active) setLateness(answer);
    });
    listLateAppeals(projectId).then((list) => {
      if (active) setAppeals(list || []);
    });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (!lateness?.missed) return null;

  const pending = appeals.find((appeal) => appeal.status === "pending");
  const left = Math.max(APPEAL_MAX - appeals.length, 0);
  const last = appeals[appeals.length - 1];
  const answered = appeals.filter((appeal) => appeal.status !== "pending");

  // The client lets the freelancer apply again: answers the waiting appeal if
  // there is one (that also lifts the block), otherwise the plain button.
  const handleAllow = async () => {
    setSaving(true);
    const problem = pending ? await answerLateAppeal(pending.id, true) : await allowLateFreelancer(projectId);
    setSaving(false);
    setAsking(false);
    if (problem) {
      showToast(problem);
      await loadAppeals();
      return;
    }
    setLateness({ missed: true, allowedAt: new Date().toISOString() });
    await loadAppeals();
    showToast(`${otherName} can apply to your job posts again. They'll be told.`);
  };

  const handleCancel = async () => {
    setSaving(true);
    const problem = await cancelLateAppeal(pending.id);
    setSaving(false);
    if (problem) showToast(problem);
    await loadAppeals();
  };

  const handleDialogDone = async () => {
    const wasAppeal = dialog === "appeal";
    setDialog("");
    showToast(wasAppeal
      ? `Your appeal was sent. ${otherName} will answer it here.`
      : `You declined the appeal. ${otherName} will be told.`);
    await loadAppeals();
  };

  // Past appeals, one short line each (both people see them).
  const history = answered.length > 0 && (
    <ul className="list-unstyled text-secondary fs-8 mt-2 mb-0" data-appeal-history>
      {answered.map((appeal) => (
        <li key={appeal.id}>
          {isClient ? otherName : "You"} appealed on {new Date(appeal.created_at).toLocaleDateString()}: {APPEAL_RESULT[appeal.status]}.
        </li>
      ))}
    </ul>
  );

  const appealWindow = dialog && (
    <LateAppealDialog
      mode={dialog}
      projectId={projectId}
      projectTitle={projectTitle}
      appealId={pending?.id}
      left={left}
      otherName={otherName}
      onClose={() => setDialog("")}
      onDone={handleDialogDone}
    />
  );

  // Already allowed: one quiet line.
  if (lateness.allowedAt) {
    return (
      <div className="mb-4">
        <p className="text-secondary fs-7 mb-0">
          <i className="bi bi-unlock me-1"></i>
          {isClient
            ? `You allowed ${otherName} to apply to your job posts again (${new Date(lateness.allowedAt).toLocaleDateString()}).`
            : `${otherName} allowed you to apply to their job posts again.`}
        </p>
        {history}
      </div>
    );
  }

  // The freelancer: what happened, and the appeal.
  if (!isClient) {
    return (
      <div className="mb-4" data-late-block>
        <div className="alert alert-warning fs-7 py-2 mb-0 d-flex flex-column flex-sm-row align-items-sm-center gap-2" role="status">
          <span className="flex-grow-1 text-break">
            <i className="bi bi-slash-circle me-1"></i> The work wasn't sent by the due date, so you can't apply to {otherName}'s job posts unless they allow it.
            {pending && (
              <span className="d-block mt-1" data-appeal-waiting>
                <i className="bi bi-hourglass-split me-1"></i>You appealed. Waiting for {otherName}'s answer. Your message: "
                <CensoredText text={pending.message} />"
              </span>
            )}
            {!pending && last?.status === "declined" && (
              <span className="d-block mt-1" data-appeal-declined>
                {otherName} declined your appeal
                {last.client_note ? <>: "<CensoredText text={last.client_note} />"</> : "."}
              </span>
            )}
            {!pending && left > 0 && (
              <span className="d-block mt-1">
                You can appeal to {otherName} ({left} of {APPEAL_MAX} appeals left).
              </span>
            )}
            {!pending && left === 0 && (
              <span className="d-block mt-1">You have used both appeals for this project. You can still message {otherName}.</span>
            )}
          </span>
          {pending ? (
            <button type="button" className="btn btn-sm btn-outline-dark rounded-pill px-3 fw-bold flex-shrink-0" disabled={saving} onClick={handleCancel}>
              {saving ? <Busy>Cancelling</Busy> : "Cancel appeal"}
            </button>
          ) : left > 0 && (
            <button type="button" className="btn btn-sm btn-dark rounded-pill px-3 fw-bold flex-shrink-0" onClick={() => setDialog("appeal")}>
              <i className="bi bi-megaphone me-1"></i>Appeal
            </button>
          )}
        </div>
        {history}
        {appealWindow}
      </div>
    );
  }

  // The client, with an appeal waiting: the message, Allow and Decline.
  if (pending) {
    return (
      <div className="mb-4" data-late-block>
        <div className="alert alert-info fs-7 py-2 mb-0 d-flex flex-column flex-sm-row align-items-sm-center gap-2" role="status">
          <span className="flex-grow-1 text-break">
            <i className="bi bi-megaphone me-1"></i>
            {otherName} didn't send the work by the due date, so they can't apply to your job posts. They appealed:
            <span className="d-block mt-1">"<CensoredText text={pending.message} />"</span>
          </span>
          <span className="d-flex flex-wrap gap-2 flex-shrink-0">
            <button type="button" className="btn btn-sm btn-dark rounded-pill px-3 fw-bold" disabled={saving} onClick={handleAllow}>
              {saving ? <Busy>Allowing</Busy> : <><i className="bi bi-unlock me-1"></i>Allow</>}
            </button>
            <button type="button" className="btn btn-sm btn-outline-dark rounded-pill px-3 fw-bold" disabled={saving} onClick={() => setDialog("decline")}>
              Decline
            </button>
          </span>
        </div>
        {history}
        {appealWindow}
      </div>
    );
  }

  // The client, no appeal waiting: the plain "Allow to apply again" button.
  return (
    <div className="mb-4" data-late-block>
      <div className="alert alert-warning fs-7 py-2 mb-0 d-flex flex-column flex-sm-row align-items-sm-center gap-2" role="status">
        <span className="flex-grow-1">
          <i className="bi bi-slash-circle me-1"></i>
          {asking
            ? `Allow ${otherName} to apply to your job posts again?`
            : `${otherName} didn't send the work by the due date, so they can't apply to your job posts.`}
        </span>
        <span className="d-flex gap-2 flex-shrink-0">
          {asking ? (
            <>
              <button type="button" className="btn btn-sm btn-dark rounded-pill px-3 fw-bold" disabled={saving} onClick={handleAllow}>
                {saving ? <Busy>Allowing</Busy> : "Yes, allow"}
              </button>
              <button type="button" className="btn btn-sm btn-outline-dark rounded-pill px-3 fw-bold" disabled={saving} onClick={() => setAsking(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-sm btn-dark rounded-pill px-3 fw-bold" onClick={() => setAsking(true)}>
              <i className="bi bi-unlock me-1"></i>Allow to apply again
            </button>
          )}
        </span>
      </div>
      {history}
    </div>
  );
}
