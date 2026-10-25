import { useState } from "react";
import { agreePrice, priceSourceText, priceText, proposePrice } from "../../../lib/projectPrice";

// The Price box of the project page (PLAN-transaction-tracking.md, Step A). A
// project has ONE price. Usually it is already agreed when the project starts
// (copied from the booked service or the job post). When it is not, either person
// names a price and the OTHER person agrees to it. Once agreed it is locked.
// Props: project (a row from getProject), currentUserId, otherName, showToast, and
// onChanged() (the page reads the project again after a price was sent or agreed).
export default function ProjectPriceBox({ project, currentUserId, otherName, showToast, onChanged }) {
  const [amount, setAmount] = useState("");
  // Open on a proposal that is waiting, to send a different price.
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const status = project.price_status;
  const iProposed = project.price_proposed_by === currentUserId;
  const text = status === "none" ? "" : priceText(project.agreed_amount, project.price_basis);
  // The form shows when there is no price, and when someone wants to change a proposal.
  const showForm = status === "none" || (status === "proposed" && editing);

  const handleSend = async (event) => {
    event.preventDefault();
    if (working) return;
    setWorking(true);
    setError("");
    const { error: problem } = await proposePrice(project.id, amount);
    setWorking(false);
    if (problem) {
      setError(problem);
      // The price may have changed meanwhile (agreed in another tab): show what is there now.
      onChanged();
      return;
    }
    setAmount("");
    setEditing(false);
    showToast(`Price sent to ${otherName}.`);
    onChanged();
  };

  const handleAgree = async () => {
    if (working) return;
    setWorking(true);
    setError("");
    const { error: problem } = await agreePrice(project.id);
    setWorking(false);
    if (problem) {
      setError(problem);
      // Someone changed it meanwhile: show what is there now.
      onChanged();
      return;
    }
    showToast("Price agreed.");
    onChanged();
  };

  return (
    <div className="p-3 bg-dark bg-opacity-50 rounded-3 border border-secondary border-opacity-25" data-price-status={status}>
      <span className="text-secondary fs-8 d-block mb-1">Price</span>

      {status === "agreed" && (
        <>
          <div className="text-white fw-bold fs-5 text-break">{text}</div>
          <div className="text-secondary fs-8">
            {priceSourceText(project.price_source)}
            {project.price_agreed_at && ` • agreed on ${new Date(project.price_agreed_at).toLocaleDateString()}`}
          </div>
        </>
      )}

      {status === "none" && (
        <p className="text-white-50 fs-7 mb-2">No price yet. Name a price, and {otherName} agrees to it.</p>
      )}

      {status === "proposed" && iProposed && (
        <p className="text-white-50 fs-7 mb-2">
          You proposed <strong className="text-white">{text}</strong>. Waiting for {otherName} to agree.
        </p>
      )}

      {status === "proposed" && !iProposed && (
        <>
          <p className="text-white-50 fs-7 mb-2">
            {otherName} proposed <strong className="text-white">{text}</strong>.
          </p>
          {!showForm && (
            <button type="button" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" onClick={handleAgree} disabled={working}>
              <i className="bi bi-check2-circle me-1"></i> {working ? "Agreeing..." : "Agree to this price"}
            </button>
          )}
        </>
      )}

      {showForm && (
        <form onSubmit={handleSend} className="d-flex flex-wrap align-items-center gap-2">
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label="Price in pesos"
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white"
            style={{ maxWidth: 180 }}
            placeholder="₱ e.g. 5000"
            maxLength={14}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={working}
          />
          <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={working}>
            {working ? "Sending..." : "Send price"}
          </button>
          {editing && (
            <button type="button" className="btn btn-link text-white-50 fs-8 p-0" onClick={() => { setEditing(false); setError(""); }} disabled={working}>
              Cancel
            </button>
          )}
        </form>
      )}

      {status === "proposed" && !showForm && (
        <button type="button" className="btn btn-link text-white-50 fs-8 p-0 mt-2 d-block" onClick={() => setEditing(true)}>
          {iProposed ? "Change the price" : "Suggest a different price"}
        </button>
      )}

      {/* Once the price is agreed an old problem no longer matters (e.g. the other
          person agreed first), so only the box's new state shows. */}
      {error && status !== "agreed" && <p className="text-danger fs-8 mt-2 mb-0" role="alert">{error}</p>}
    </div>
  );
}
