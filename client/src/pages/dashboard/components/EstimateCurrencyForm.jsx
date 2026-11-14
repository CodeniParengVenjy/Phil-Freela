import { useEffect, useState } from "react";
import CurrencySelect from "../../../components/CurrencySelect";
import { Busy } from "../../../components/Loaders";
import { estimateText, fetchDisplayCurrency, formatMoney, loadRates, saveDisplayCurrency, setDisplayCurrency, useMoneyView } from "../../../lib/money";

// Settings > Appearance > "Show estimates in" (PLAN-currencies.md): the currency of the
// small "≈" estimates next to prices that are in another currency. Only for display:
// prices, payments and balances always stay in their own currency. Saved on the
// profile, so it follows the person to any device (lib/money.js).
export default function EstimateCurrencyForm({ userId, showToast }) {
  const moneyView = useMoneyView();
  // Nothing can be changed until the saved choice has loaded.
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadRates();
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

  // An example in the picked currency: a US$50 price for someone who picked pesos,
  // a ₱1,000 price for anyone else.
  const exampleFrom = moneyView.display === "PHP" ? { amount: 50, code: "USD" } : { amount: 1000, code: "PHP" };
  const exampleEstimate = estimateText(exampleFrom.amount, exampleFrom.code, moneyView);
  const ratesDay = moneyView.ratesAt
    ? new Date(moneyView.ratesAt).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <div>
      <h6 className="text-white fw-bold mb-1">Show estimates in</h6>
      <p className="text-secondary fs-8 mb-3">
        Every price stays in the currency it was set in. Next to a price in another currency you also see about how much
        it is in the currency you pick here. It is only a guide: what anyone owes stays in the price's own currency.
      </p>
      <div style={{ maxWidth: "22rem" }}>
        <CurrencySelect
          id="estimateCurrency"
          value={moneyView.display}
          onChange={change}
          disabled={!loaded || saving}
          ariaLabel="Show estimates in"
        />
      </div>
      <small className="text-secondary fs-8 d-block mt-2">
        {!loaded ? (
          <Busy>Loading your currency</Busy>
        ) : saving ? (
          <Busy>Saving</Busy>
        ) : exampleEstimate ? (
          <>
            For example: <span className="text-white">{formatMoney(exampleFrom.amount, exampleFrom.code)}</span> {exampleEstimate}
            {ratesDay ? ` (rates of ${ratesDay}).` : "."}
          </>
        ) : (
          <Busy>Loading today's rates</Busy>
        )}
      </small>
    </div>
  );
}
