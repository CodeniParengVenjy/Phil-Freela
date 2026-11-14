import { useEffect, useState } from "react";
import CurrencySelect from "../../../components/CurrencySelect";
import { Busy } from "../../../components/Loaders";
import { fetchDisplayCurrency, saveDisplayCurrency, setDisplayCurrency, useMoneyView } from "../../../lib/money";

// Settings > Appearance > "My currency" (PLAN-currencies.md, the user's choice on
// 2026-11-15): the currency of what this person sets and pays. Their new job posts,
// offers and payment requests start in it. Nothing is converted: other people's prices
// always show exactly as they were posted. Saved on the profile, so it follows the
// person to any device (lib/money.js).
export default function EstimateCurrencyForm({ userId, showToast }) {
  const moneyView = useMoneyView();
  // Nothing can be changed until the saved choice has loaded.
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetchDisplayCurrency(userId).then((saved) => {
      if (!active) return;
      if (saved) setDisplayCurrency(saved);
      setLoaded(true);
    });
    return () => { active = false; };
  }, [userId]);

  // Shows the change right away, then saves it. If it can't be saved, the old one comes back.
  const change = async (code) => {
    const before = moneyView.display;
    if (code === before) return;
    setDisplayCurrency(code);
    setSaving(true);
    const problem = await saveDisplayCurrency(userId, code);
    setSaving(false);
    if (problem) {
      setDisplayCurrency(before);
      showToast(problem);
      return;
    }
    showToast("Currency saved.");
  };

  return (
    <div>
      <h6 className="text-white fw-bold mb-1">My currency</h6>
      <p className="text-secondary fs-8 mb-3">
        Your new job posts, offers and payment requests start in this currency (you can still pick another one each
        time). Other people's prices always show exactly as they posted them.
      </p>
      <div style={{ maxWidth: "22rem" }}>
        <CurrencySelect
          id="estimateCurrency"
          value={moneyView.display}
          onChange={change}
          disabled={!loaded || saving}
          ariaLabel="My currency"
        />
      </div>
      {(!loaded || saving) && (
        <small className="text-secondary fs-8 d-block mt-2">
          {saving ? <Busy>Saving</Busy> : <Busy>Loading your currency</Busy>}
        </small>
      )}
    </div>
  );
}
