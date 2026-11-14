import { useEffect } from "react";
import { estimateText, formatMoney, loadRates, useMoneyView } from "../lib/money";

// Premium, Featured posts, billboards and member ads are charged in pesos: Xendit in the
// Philippines only takes PHP (PLAN-currencies.md, the user's choice on 2026-11-14). For
// someone who picked another currency for estimates (Settings > Appearance), this says
// about how much the price is in their currency, and plainly that pesos are charged.
// Nothing shows for someone who sees pesos, or while the day's rates are loading.
export default function PesoChargeNote({ amount, className = "" }) {
  const moneyView = useMoneyView();

  useEffect(() => {
    loadRates();
  }, []);

  const text = amount == null ? "" : estimateText(amount, "PHP", moneyView);
  if (!text) return null;
  return (
    <small className={`text-secondary fs-8 d-block ${className}`} data-peso-charge-note>
      {text} in your currency. You are charged {formatMoney(amount, "PHP")} in pesos.
    </small>
  );
}
