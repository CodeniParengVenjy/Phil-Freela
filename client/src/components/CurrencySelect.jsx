import { CURRENCIES, currencyLabel } from "../lib/money";

// The currency box next to an amount (PLAN-currencies.md). Pesos come first; each
// currency shows its code, name and symbol ("USD · US dollar (US$)").
export default function CurrencySelect({ id, value, onChange, disabled = false, className = "", ariaLabel = "Currency", dataTour }) {
  return (
    <select
      id={id}
      className={`form-select bg-secondary bg-opacity-25 border-secondary text-white ${className}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-label={ariaLabel}
      data-tour={dataTour}
    >
      {CURRENCIES.map((currency) => (
        <option key={currency.code} value={currency.code}>{currencyLabel(currency.code)}</option>
      ))}
    </select>
  );
}
