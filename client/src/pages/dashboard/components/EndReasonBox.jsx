import { MAX_END_NOTE_LENGTH } from "../../../lib/projects";

// The optional reason box of the End project and Withdraw windows (PLAN-end-project.md). It is
// saved on the project and shown on the project page to both people (through the word filter in
// the database). Empty means no reason.
//   id: the field's id; value / onChange(text): the text; disabled: while the window is working
export default function EndReasonBox({ id, value, onChange, disabled, placeholder }) {
  return (
    <>
      <label htmlFor={id} className="form-label text-white-50 fw-semibold fs-7">
        Reason <span className="fw-normal">(optional)</span>
      </label>
      <textarea
        id={id}
        className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-1"
        rows={2}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={MAX_END_NOTE_LENGTH}
        disabled={disabled}
      />
      <small className="text-secondary fs-8 d-block mb-3">
        {value.length}/{MAX_END_NOTE_LENGTH}. The other person can read it on the project page.
      </small>
    </>
  );
}
