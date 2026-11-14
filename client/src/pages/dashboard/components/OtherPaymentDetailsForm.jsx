import { useEffect, useState } from "react";
import { MAX_PAYMENT_DETAILS_LENGTH, getMyPaymentDetails, removeMyPaymentDetails, saveMyPaymentDetails } from "../../../lib/payments";
import { Loader, Busy } from "../../../components/Loaders";

// Settings > GCash Payment > "Payments in other currencies" (freelancers only,
// PLAN-currencies.md). GCash only moves pesos, so for a project or a chat request
// priced in another currency the freelancer writes where to send the money, in their
// own words ("PayPal: ana@example.com", "Wise", a bank account...). It stays private:
// only a client who has to pay them in another currency sees it
// (get_other_pay_details in database/supabase_currencies_prices_schema.sql).
export default function OtherPaymentDetailsForm({ userId, showToast }) {
  // undefined while loading, null when nothing is saved yet, else the saved text.
  const [saved, setSaved] = useState(undefined);
  const [loadError, setLoadError] = useState("");
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getMyPaymentDetails(userId).then(({ data, error: problem }) => {
      if (!active) return;
      if (problem) {
        setLoadError(problem);
        return;
      }
      setSaved(data);
      setText(data || "");
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (working || saved === undefined) return;
    setWorking(true);
    setError("");
    const problem = await saveMyPaymentDetails(userId, text);
    setWorking(false);
    if (problem) {
      setError(problem);
      return;
    }
    setSaved(text.trim());
    setText(text.trim());
    showToast("Payment details saved.");
  };

  const handleRemove = async () => {
    if (working) return;
    setWorking(true);
    setError("");
    const problem = await removeMyPaymentDetails(userId);
    setWorking(false);
    if (problem) {
      setError(problem);
      return;
    }
    setSaved(null);
    setText("");
    showToast("Payment details removed.");
  };

  return (
    <div className="pt-4 mt-4 border-top border-secondary border-opacity-25" data-other-payment-details>
      <h5 className="text-white fw-bold fs-6 mb-1">Payments in other currencies</h5>
      <p className="text-secondary fs-8 mb-3">
        GCash only moves pesos. When a project or a payment request is priced in another currency (US dollars, euros...), the
        client pays you with PayPal, Wise, a bank transfer or a remittance. Write where to send it. Only a client who has to pay
        you in another currency sees this.
      </p>
      {loadError && <p className="text-danger fs-7 mb-0">{loadError}</p>}
      {!loadError && saved === undefined && <Loader size="sm" label="Loading your payment details" />}
      {!loadError && saved !== undefined && (
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="otherPaymentDetails" className="form-label text-white-50 fw-semibold fs-7">Where to send it</label>
          <textarea
            id="otherPaymentDetails"
            className="form-control bg-secondary bg-opacity-25 border-secondary text-white mb-1"
            rows={3}
            placeholder={"PayPal: yourname@example.com\nWise: your email or account number"}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_PAYMENT_DETAILS_LENGTH}
            disabled={working}
          />
          <small className="text-secondary fs-8 d-block mb-3">{text.length}/{MAX_PAYMENT_DETAILS_LENGTH}</small>
          {error && <p className="text-danger fs-7 mb-3" role="alert">{error}</p>}
          <div className="d-flex flex-wrap gap-2">
            <button type="submit" className="btn btn-gradient-role text-white rounded-pill px-4 py-2 fw-bold" disabled={working || text.trim() === (saved || "")}>
              {working ? <Busy>Saving</Busy> : "Save payment details"}
            </button>
            {saved && (
              <button type="button" className="btn btn-outline-secondary text-white-50 rounded-pill px-4 py-2 fw-bold" onClick={handleRemove} disabled={working}>
                Remove
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
