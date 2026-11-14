import { useEffect } from "react";
import { currencyInfo, estimateText, loadRates, useMoneyView } from "../lib/money";

// The small "≈ ₱2,869" after an amount (PLAN-currencies.md): about how much it is in
// the currency the viewer picked in Settings. Nothing shows when the amount is already
// in that currency, or while the day's rates are loading. It is only a guide: what is
// owed always stays in the amount's own currency.
export default function MoneyEstimate({ amount, currency, className = "" }) {
  const moneyView = useMoneyView();

  // The rates are loaded once per visit (lib/money.js keeps them).
  useEffect(() => {
    loadRates();
  }, []);

  const text = estimateText(amount, currency, moneyView);
  if (!text) return null;
  return (
    <span
      className={`money-estimate text-secondary fw-normal text-nowrap ${className}`}
      title={`About this much in ${currencyInfo(moneyView.display).name}. Rates update every day; the price itself stays in ${currencyInfo(currency).name}.`}
    >
      {text}
    </span>
  );
}
