import { useState } from "react";
import { SIDE_NAMES, countsText, finishSplit, splitErrorText } from "../../../lib/accountSplit";
import { Busy } from "../../../components/Loaders";

// Settings > Account Security > "Move work from an old account"
// (PLAN-separate-accounts.md, Step 5). The NEW account enters the move code
// that the old account got from its "Split your account" card; the old
// account's {accountType} work then moves here. The code proves the person
// owns the old account; being signed in here proves they own this one.
export default function MoveWorkForm({ accountType, showToast }) {
  const [code, setCode] = useState("");
  // Asked once before moving: "Yes, move it here".
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const side = SIDE_NAMES[accountType] || "";
  // 8 letters; spaces and dashes typed by the person don't count.
  const ready = code.replace(/[^A-Za-z0-9]/g, "").length === 8;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!ready || busy) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    setMessage({ text: "", type: "" });
    try {
      const moved = await finishSplit(code);
      const text = countsText(moved);
      setMessage({ text: text ? `Moved to this account: ${text}.` : "Done. There was nothing left to move.", type: "success" });
      showToast?.("Your work was moved to this account.");
      setCode("");
    } catch (error) {
      setMessage({ text: splitErrorText(error), type: "error" });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <form className="mt-4 pt-4 border-top border-secondary border-opacity-25" onSubmit={handleSubmit} noValidate>
      <h3 className="h6 text-white fw-bold mb-1">
        <i className="bi bi-signpost-split text-role me-2"></i>Move work from an old account
      </h3>
      <p className="text-secondary fs-7 mb-3">
        Had an account from before that was both a freelancer and a client? On that account, press
        "Get my move code" on its dashboard, then enter the code here. Its {side} work moves to this account.
      </p>
      <div className="d-flex flex-wrap gap-2 align-items-start">
        <input
          type="text"
          className="form-control bg-secondary bg-opacity-25 border-secondary text-white py-2 text-uppercase font-monospace"
          style={{ maxWidth: 220, letterSpacing: "0.12em" }}
          placeholder="ABCD EFGH"
          maxLength={12}
          autoComplete="off"
          aria-label="Move code"
          value={code}
          onChange={(event) => { setCode(event.target.value); setConfirming(false); }}
        />
        <button type="submit" className="btn btn-gradient-role rounded-pill px-3 fw-bold text-white" disabled={!ready || busy}>
          {busy ? <Busy>Moving</Busy> : confirming ? "Yes, move it here" : "Move work"}
        </button>
        {confirming && !busy && (
          <button type="button" className="btn btn-outline-secondary rounded-pill px-3" onClick={() => setConfirming(false)}>Cancel</button>
        )}
      </div>
      {confirming && !busy && (
        <p className="text-secondary fs-8 mt-2 mb-0">The old account's {side} work becomes this account's. This can't be undone.</p>
      )}
      {message.text && (
        <p className={`fs-7 mt-2 mb-0 ${message.type === "error" ? "text-danger" : "text-success"}`} aria-live="polite">{message.text}</p>
      )}
    </form>
  );
}
