import { useEffect } from "react";
import { loadRates, shownPrice, useMoneyView } from "../lib/money";

// A posted price or budget as the viewer sees it on browse lists, search, and offer and
// job pages (PLAN-currencies.md; the user's choice on 2026-11-15, "your currency big"):
// in the viewer's own currency as an estimate ("≈ US$3,132 per project"), with the real
// posted price small after it ("posted as ₱200,000"). When the price is already in the
// viewer's currency, or the day's rates haven't loaded, only the real price shows. The
// poster's own lists, the project page and the payments keep the real price big, since
// that is what is paid.
//   before / after: the words around the amount ("Starting at ", " per project")
export default function ShownPrice({ amount, currency, before = "", after = "", postedClassName = "" }) {
  const moneyView = useMoneyView();

  // The rates are loaded once per visit (lib/money.js keeps them).
  useEffect(() => {
    loadRates();
  }, []);

  const { main, posted } = shownPrice(amount, currency, moneyView);
  return (
    <>
      <span data-shown-price>{before}{main}{after}</span>
      {posted && (
        <span
          className={`text-secondary fw-normal fs-8 ms-1 text-nowrap ${postedClassName}`}
          title="The price the poster set. What is paid stays in this currency."
          data-posted-price
        >
          posted as {posted}
        </span>
      )}
    </>
  );
}
