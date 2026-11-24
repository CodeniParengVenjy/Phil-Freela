import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { APPEAL_MAX, listLateAppeals } from "../../../lib/lateBlock";
import { formatDay } from "../../../lib/projects";
import CensoredText from "../../../components/CensoredText";
import LateAppealDialog from "./LateAppealDialog";

// The apply box on a job page when the freelancer missed a due date on one of
// this client's projects (lib/lateBlock.js): the database refuses the
// application, so this says why and lets them APPEAL to the client right here
// (PLAN-late-appeals.md; the user's screenshot 2026-11-24: the appeal has to be
// where the block is, not only on the project's page). The same window as on
// the project page; the client answers on that project's page.
//   lateProject: { id, title, due_date } from getBlockingLateProject
export default function LateApplyNotice({ lateProject, clientName, showToast }) {
  // That project's appeals, oldest first ([] until read or when they can't be read).
  const [appeals, setAppeals] = useState([]);
  const [writing, setWriting] = useState(false);

  const load = useCallback(
    () => listLateAppeals(lateProject.id).then((list) => setAppeals(list || [])),
    [lateProject.id]
  );

  useEffect(() => {
    let active = true;
    listLateAppeals(lateProject.id).then((list) => {
      if (active) setAppeals(list || []);
    });
    return () => {
      active = false;
    };
  }, [lateProject.id]);

  const pending = appeals.find((appeal) => appeal.status === "pending");
  const left = Math.max(APPEAL_MAX - appeals.length, 0);
  const last = appeals[appeals.length - 1];

  const handleSent = async () => {
    setWriting(false);
    showToast(`Your appeal was sent. ${clientName} will be told.`);
    await load();
  };

  const openProject = (
    <Link to={`/dashboard/project-details/${lateProject.id}`} className="text-role fw-bold text-decoration-none fs-7">Open project</Link>
  );

  return (
    <div data-late-apply>
      <p className="text-secondary fs-7 mb-2">
        <i className="bi bi-slash-circle text-warning me-1"></i> You can't apply to {clientName}'s job posts: the work for your project "
        <CensoredText text={lateProject.title} />" (due {formatDay(lateProject.due_date)}) wasn't sent on time.
        {pending && <> You appealed to {clientName}. Waiting for their answer.</>}
        {!pending && last?.status === "declined" && <> {clientName} declined your appeal.</>}
        {!pending && left > 0 && <> You can appeal to {clientName} and ask to apply again ({left} of {APPEAL_MAX} appeals left).</>}
        {!pending && left === 0 && <> You have used both appeals for that project.</>}
      </p>
      <div className="d-flex flex-wrap align-items-center gap-3">
        {!pending && left > 0 && (
          <button type="button" className="btn btn-sm btn-gradient-role text-white rounded-pill px-3 fw-bold" onClick={() => setWriting(true)}>
            <i className="bi bi-megaphone me-1"></i>Appeal
          </button>
        )}
        {openProject}
      </div>
      {writing && (
        <LateAppealDialog
          mode="appeal"
          projectId={lateProject.id}
          projectTitle={lateProject.title}
          left={left}
          otherName={clientName}
          onClose={() => setWriting(false)}
          onDone={handleSent}
        />
      )}
    </div>
  );
}
