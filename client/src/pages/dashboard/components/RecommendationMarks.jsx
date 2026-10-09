import { REASONS } from "../../../lib/recommendationReasons";

// The marks on a job or service the AI picked: "Recommended for you" (or "New
// and trusted" when there was nothing to match yet) and why it was picked.
// pick: { reasons }. want: "jobs" (a freelancer's list) or "services" (a
// client's list), which decides the wording of the reasons.
// text-wrap: on a narrow phone a long mark goes to a second line instead of
// being cut off.
export default function RecommendationMarks({ pick, personalized, want, className = "mt-2" }) {
  return (
    <div className={`d-flex flex-wrap gap-1 ${className}`}>
      <span className="badge rounded-pill bg-role text-white text-wrap text-start fw-semibold">
        <i className="bi bi-stars me-1"></i>{personalized ? "Recommended for you" : "New and trusted"}
      </span>
      {pick.reasons.map((code) => {
        const reason = REASONS[code];
        if (!reason) return null;
        return (
          <span key={code} className="badge rounded-pill bg-role-subtle text-role text-wrap text-start fw-semibold">
            <i className={`bi ${reason.icon} me-1`}></i>{reason.text || reason[want]}
          </span>
        );
      })}
    </div>
  );
}
