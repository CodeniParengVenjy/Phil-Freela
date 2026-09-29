import { MATCH_DISTANCE, STRONG_MATCH_DISTANCE, aiSuggestion } from "../../../lib/verification";

// The AI's results for one identity verification, for the admin reviewing it.
// Nothing here is new AI: it only explains what the AI service already saved.

// A green check, a red cross, or (warn) a yellow warning sign.
function Row({ ok, warn, label, value, detail }) {
  const icon = warn ? "bi-exclamation-triangle-fill text-warning" : ok ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger";
  return (
    <div className="d-flex gap-2 py-2 border-bottom border-secondary border-opacity-25">
      <i className={`bi ${icon} mt-1`}></i>
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
        detail="Sharp photos, the face on the ID is big enough, and the photos look like an ID (printed text found). Checked before saving."
      />
      {qrRow(verification)}
      {verification.duplicate_of ? (
        <Row
          ok={false}
          label="Other accounts"
          value={`Same face as @${verification.duplicate?.username || "another user"}`}
          detail={`This face matches ${verification.duplicate?.full_name || "another account"}'s pending or approved verification. One person may be making a second account.`}
        />
      ) : (
        <Row ok label="Other accounts" value="Face not found on other accounts" detail="Compared with every other account's pending and approved verifications." />
      )}

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

      {/* PhilSys IDs carry a QR code signed by the PSA. The PSA's own PhilSys
          Check site confirms whether it's genuine, which no photo AI can do. */}
      {verification.id_type === "philsys" && (
        <p className="text-info fs-8 mt-2 mb-0">
          <i className="bi bi-qr-code-scan me-1"></i>
          PhilSys ID: open{" "}
          <a href="https://verify.philsys.gov.ph" target="_blank" rel="noopener noreferrer" className="text-info fw-bold">
            PhilSys Check (verify.philsys.gov.ph)
          </a>{" "}
          and scan the QR code in the "Back of ID" photo, for example with your phone pointed at this screen. It's the
          PSA's official check: it shows whether the QR code is genuine and the details it holds, to compare with the photos.
        </p>
      )}

      {/* PRC IDs: the PRC's free official check, open to anyone. */}
      {verification.id_type === "prc" && (
        <p className="text-info fs-8 mt-2 mb-0">
          <i className="bi bi-patch-check me-1"></i>
          PRC ID: check it on the PRC's official site,{" "}
          <a href="https://verification.prc.gov.ph" target="_blank" rel="noopener noreferrer" className="text-info fw-bold">
            verification.prc.gov.ph
          </a>
          , with the license number and birthday from the ID photos. It shows whether the license is real and still valid.
        </p>
      )}
    </div>
  );
}

// What the PhilSys ID's QR code said (see ai-service/id_qr.py). Reading the QR
// can't prove the ID is real (that needs the PSA's key), but a missing QR, or
// a name that isn't the profile's, is a warning sign.
function qrRow(verification) {
  const profileName = verification.user?.full_name || "the profile";
  switch (verification.id_qr_status) {
    case "match":
      return <Row ok label="ID's QR code" value="Name matches the profile" detail={`The QR code says ${verification.id_qr_name}.`} />;
    case "mismatch":
      return (
        <Row
          warn
          label="ID's QR code"
          value="Name doesn't match the profile"
          detail={`The QR code says ${verification.id_qr_name}, but the profile says ${profileName}. The QR may come from someone else's ID.`}
        />
      );
    case "unreadable":
      return <Row warn label="ID's QR code" value="Couldn't read its details" detail="A QR code was found, but it doesn't hold PhilSys details we can read." />;
    case "not_found":
      return (
        <Row
          warn
          label="ID's QR code"
          value="No QR code found"
          detail="PhilSys IDs have one (on the back of the card, or the front of the printed ePhilID). The photo may just be unclear, but check the ID closely."
        />
      );
    default:
      return null;
  }
}
