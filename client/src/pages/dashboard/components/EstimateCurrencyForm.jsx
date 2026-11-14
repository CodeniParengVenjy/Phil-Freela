import { useEffect, useState } from "react";
import CurrencySelect from "../../../components/CurrencySelect";
import { Busy } from "../../../components/Loaders";
import { fetchDisplayCurrency, saveDisplayCurrency, setDisplayCurrency, useMyCurrency } from "../../../lib/money";

// Settings > Appearance > "My currency" (PLAN-currencies.md, the user's choice on
// 2026-11-15, "Turn into my currency"): every price on the site shows in it, worked out at
// the day's rate, and the person's new job posts, offers and payment requests start in it.
// Money that is sent or received stays in its own currency. Saved on the profile, so it
// follows the person to any device (lib/money.js).
export default function EstimateCurrencyForm({ userId, showToast }) {
  const moneyView = useMyCurrency();
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

  // The day the rates are from, for the explanation.
  const ratesDay = moneyView.ratesAt
    ? new Date(moneyView.ratesAt).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div>
      <h6 className="text-white fw-bold mb-1">My currency</h6>
      <p className="text-secondary fs-8 mb-3">
        Every price on PhilFreela shows in this currency, worked out at the day's rate{ratesDay ? ` (rates of ${ratesDay})` : ""}.
        Your new job posts, offers and payment requests also start in it. Money you send or receive stays in the
        currency it is sent in, for example pesos by GCash.
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
