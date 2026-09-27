import { buildPenalty, otherLengths, violations } from "../../../lib/violations";
import { formatEndDate, restrictionText } from "../../../lib/suspensions";

// The inside of the Suspend / Ban pop-up, shared by the Users and Reports
// pages: the violation dropdown, a note, and for "Other" suspensions the
// length and what to block. The line at the bottom shows the admin exactly
// what the penalty will be before they confirm.
export default function ViolationFields({ kind, fields, setFields }) {
  const update = (changes) => setFields((prev) => ({ ...prev, ...changes }));
  // Fake profile is ban only, so the Suspend pop-up doesn't offer it.
  const options = kind === "ban" ? violations : violations.filter((v) => !v.banOnly);
  const isOther = fields.violation === "other";
  const penalty = buildPenalty(kind, fields);

  return (
    <>
      <label htmlFor="violation" className="form-label text-white-50 fs-7 mb-1">Violation</label>
      <select
        id="violation"
        className="form-select admin-input mb-3"
        value={fields.violation}
        onChange={(e) => update({ violation: e.target.value })}
        autoFocus
        required
      >
        {/* Placeholder only: disabled, so it can't be picked again once a violation is chosen. */}
        <option value="" disabled>Choose a violation...</option>
        {/* Just the name; the line below the form shows the penalty. */}
        {options.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
      </select>

      {kind === "suspend" && isOther && (
        <div className="row g-2 mb-3">
          <div className="col-6">
            <label htmlFor="otherDays" className="form-label text-white-50 fs-7 mb-1">Length</label>
            <select id="otherDays" className="form-select admin-input" value={fields.days} onChange={(e) => update({ days: Number(e.target.value) })}>
              {otherLengths.map((d) => <option key={d} value={d}>{d} days</option>)}
            </select>
          </div>
          <div className="col-6">
            <span className="form-label d-block text-white-50 fs-7 mb-1">Blocks</span>
            <div className="form-check">
              <input id="blockPosting" type="checkbox" className="form-check-input" checked={fields.blocksPosting} onChange={(e) => update({ blocksPosting: e.target.checked })} />
              <label htmlFor="blockPosting" className="form-check-label text-white fs-7">Posting</label>
            </div>
            <div className="form-check">
              <input id="blockMessaging" type="checkbox" className="form-check-input" checked={fields.blocksMessaging} onChange={(e) => update({ blocksMessaging: e.target.checked })} />
              <label htmlFor="blockMessaging" className="form-check-label text-white fs-7">Messages</label>
            </div>
          </div>
        </div>
      )}

      <label htmlFor="violationNote" className="form-label text-white-50 fs-7 mb-1">
        {isOther ? "Explain the violation (shown to the user)" : "Note (optional, shown to the user)"}
      </label>
      <textarea
        id="violationNote"
        className="form-control admin-input mb-3"
        rows={2}
        // Short enough that "<violation>: <note>" fits the 500-character reason.
        maxLength={450}
        placeholder={isOther ? "What did they do?" : "e.g. Posted the same ad 10 times"}
        value={fields.note}
        onChange={(e) => update({ note: e.target.value })}
        required={isOther}
      />

      {penalty && (
        <p className="admin-penalty fs-7 mb-3">
          <i className="bi bi-info-circle me-1"></i>
          {kind === "ban"
            ? "Ban: they can't log in until an admin unbans them."
            : `${penalty.days}-day suspension: ${restrictionText(penalty.blocksPosting, penalty.blocksMessaging)}. Lifts ${formatEndDate(penalty.endsAt)}.`}
        </p>
      )}
    </>
  );
}
