import { formatMoney, useMyCurrency } from "../lib/money";

// Premium, Featured posts and member ads are paid on Xendit, which in the Philippines takes
// pesos only (PLAN-currencies.md). Their prices show in the person's own currency like every
// price on the site ("Turn into my currency", the user's choice on 2026-11-15); for someone
// whose currency is not pesos, this says plainly what will be charged. Nothing shows for
// someone who uses pesos.
export default function PesoChargeNote({ amount, className = "" }) {
  const moneyView = useMyCurrency();
  if (amount == null || moneyView.display === "PHP") return null;
  return (
    <small className={`text-secondary fs-8 d-block ${className}`} data-peso-charge-note>
      Paid in pesos: {formatMoney(amount, "PHP")} by GCash, Maya or QR Ph (Xendit takes pesos only).
    </small>
  );
}
