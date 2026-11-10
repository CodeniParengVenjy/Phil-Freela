import { useEffect, useState } from "react";
import { formatDay } from "../../../lib/projects";
import { getReviewClock, reviewDeadline } from "../../../lib/reviewClock";

// On a project's page (PLAN-delays.md, Step 4, lib/reviewClock.js):
//  - while the work is Submitted: when it is accepted automatically if the client
//    says nothing (7 days after it was sent);
//  - once it was accepted that way: a quiet line saying so.
// Shows nothing for any other project, while loading, or when the database can't
// answer (for example before that SQL is run).
export default function ReviewNotice({ project, isClient, otherName }) {
  // null until read (or when it can't be read), then { countedFrom, autoAccepted }.
  const [clock, setClock] = useState(null);
  const watched = project.status === "submitted" || project.status === "done";

  useEffect(() => {
    if (!watched) return undefined;
    let active = true;
    getReviewClock(project.id).then((answer) => {
      if (active) setClock(answer);
    });
    return () => {
      active = false;
    };
  }, [watched, project.id, project.status]);

  if (!watched || !clock) return null;

  if (project.status === "submitted" && project.submitted_at) {
    const deadline = formatDay(reviewDeadline(project, clock));
    return (
      <p className="text-secondary fs-7 mb-4" data-review-clock>
        <i className="bi bi-hourglass-split me-1"></i>
        {isClient
          ? `Review the work before ${deadline}: mark it done or ask for changes, or it is accepted automatically.`
          : `If ${otherName} doesn't mark it done or ask for changes before ${deadline}, the work is accepted automatically.`}
      </p>
    );
  }

  if (project.status === "done" && clock.autoAccepted) {
    return (
      <p className="text-secondary fs-7 mb-4" data-review-clock>
        <i className="bi bi-clock-history me-1"></i>
        {isClient
          ? "You didn't answer in 7 days, so the work was accepted automatically."
          : `${otherName} didn't answer in 7 days, so the work was accepted automatically.`}
      </p>
    );
  }

  return null;
}
