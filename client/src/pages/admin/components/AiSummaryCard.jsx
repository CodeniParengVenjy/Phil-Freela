import { MATCH_DISTANCE, STRONG_MATCH_DISTANCE, aiSuggestion } from "../../../lib/verification";

// The AI's results for one identity verification, for the admin reviewing it.
// Nothing here is new AI: it only explains what the AI service already saved.

function Row({ ok, label, value, detail }) {
  return (
    <div className="d-flex gap-2 py-2 border-bottom border-secondary border-opacity-25">
      <i className={`bi ${ok ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger"} mt-1`}></i>
      <div>
        <p className="text-white fs-7 fw-bold mb-0">{label}: <span className="fw-normal">{value}</span></p>
        {detail && <p className="text-white-50 fs-8 mb-0">{detail}</p>}
      </div>
    </div>
  );
}

export default function AiSummaryCard({ verification }) {
  const suggestion = aiSuggestion(verification);
  const distance = Number(verification.face_distance);
  const matchText = !verification.face_match ? "No match" : distance <= STRONG_MATCH_DISTANCE ? "Strong match" : "Weak match";

  return (
    <div className="bg-dark bg-opacity-50 rounded-4 p-3 border border-secondary border-opacity-25">
      <p className="text-white fw-bold mb-1"><i className="bi bi-cpu me-2 text-info"></i>AI summary</p>

      <Row
        ok={verification.face_match}
        label="Face match"
        value={matchText}
        detail={`ID photo vs. face scan. AI distance ${distance.toFixed(2)} (same person if ${MATCH_DISTANCE} or lower; lower is more alike).`}
      />
      <Row
        ok={verification.liveness_passed}
        label="Liveness"
        value={verification.liveness_passed ? "Passed" : "Failed"}
        detail={verification.liveness_passed
          ? "The head turned both ways, and all 3 scan photos show the same person."
          : "The 3 scan photos don't all show the same person."}
      />
      <Row
        ok
        label="Photo quality"
        value="Passed"
        detail="Sharp photos, and the face on the ID is big enough (checked before saving)."
      />

      <p className="fs-7 fw-bold mt-3 mb-1">
        <span className="me-1">{suggestion.icon}</span>
        <span className={suggestion.level === "good" ? "text-success" : suggestion.level === "careful" ? "text-warning" : "text-danger"}>
          AI suggestion: {suggestion.text}
        </span>
      </p>
      <p className="text-white-50 fs-8 mb-0">
        <i className="bi bi-info-circle me-1"></i>
        The AI can't tell whether an ID is fake, edited or expired. Check the ID photos yourself before approving.
      </p>
    </div>
  );
}
