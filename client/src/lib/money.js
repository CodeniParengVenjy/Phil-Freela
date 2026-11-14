import { useSyncExternalStore } from "react";
import { supabase } from "./supabaseClient";

// Any currency (PLAN-currencies.md). Every price, budget and payment between a client
// and a freelancer keeps its own currency: whoever writes the price picks it. Other
// people also see a small estimate in the currency they picked in Settings
// ("≈ ₱2,900"). An estimate is only a guide: what anyone owes is always the amount in
// its own currency.
//
// The list is the same 30 rows as the database table public.currencies
// (database/supabase_currencies_schema.sql), and amounts are written the same way as
// the database's money_text(): the symbol, then the number ("US$50.00"); a symbol that
// ends in a letter gets a space ("CHF 120.00"); yen, won, rupiah and dong have no
// decimals ("¥7,500").
//   max: the highest amount allowed (about what 1,000,000 pesos buy), the same as
//        currencies.max_amount, which the database checks too.
export const CURRENCIES = [
  { code: "PHP", name: "Philippine peso", symbol: "₱", decimals: 2, max: 1000000 },
  { code: "USD", name: "US dollar", symbol: "US$", decimals: 2, max: 16000 },
  { code: "EUR", name: "Euro", symbol: "€", decimals: 2, max: 15000 },
  { code: "GBP", name: "British pound", symbol: "£", decimals: 2, max: 12000 },
  { code: "JPY", name: "Japanese yen", symbol: "¥", decimals: 0, max: 2600000 },
  { code: "KRW", name: "South Korean won", symbol: "₩", decimals: 0, max: 21000000 },
  { code: "CNY", name: "Chinese yuan", symbol: "CN¥", decimals: 2, max: 110000 },
  { code: "HKD", name: "Hong Kong dollar", symbol: "HK$", decimals: 2, max: 130000 },
  { code: "TWD", name: "New Taiwan dollar", symbol: "NT$", decimals: 2, max: 520000 },
  { code: "SGD", name: "Singapore dollar", symbol: "S$", decimals: 2, max: 21000 },
  { code: "MYR", name: "Malaysian ringgit", symbol: "RM", decimals: 2, max: 65000 },
  { code: "THB", name: "Thai baht", symbol: "฿", decimals: 2, max: 540000 },
  { code: "IDR", name: "Indonesian rupiah", symbol: "Rp", decimals: 0, max: 99999999 },
  { code: "VND", name: "Vietnamese dong", symbol: "₫", decimals: 0, max: 99999999 },
  { code: "INR", name: "Indian rupee", symbol: "₹", decimals: 2, max: 1500000 },
  { code: "AUD", name: "Australian dollar", symbol: "A$", decimals: 2, max: 24000 },
  { code: "NZD", name: "New Zealand dollar", symbol: "NZ$", decimals: 2, max: 29000 },
  { code: "CAD", name: "Canadian dollar", symbol: "CA$", decimals: 2, max: 23000 },
  { code: "CHF", name: "Swiss franc", symbol: "CHF", decimals: 2, max: 14000 },
  { code: "AED", name: "UAE dirham", symbol: "AED", decimals: 2, max: 58000 },
  { code: "SAR", name: "Saudi riyal", symbol: "SAR", decimals: 2, max: 59000 },
  { code: "QAR", name: "Qatari riyal", symbol: "QAR", decimals: 2, max: 58000 },
  { code: "SEK", name: "Swedish krona", symbol: "SEK", decimals: 2, max: 160000 },
  { code: "NOK", name: "Norwegian krone", symbol: "NOK", decimals: 2, max: 150000 },
  { code: "DKK", name: "Danish krone", symbol: "DKK", decimals: 2, max: 110000 },
  { code: "MXN", name: "Mexican peso", symbol: "MX$", decimals: 2, max: 300000 },
  { code: "BRL", name: "Brazilian real", symbol: "R$", decimals: 2, max: 89000 },
  { code: "ZAR", name: "South African rand", symbol: "R", decimals: 2, max: 270000 },
  { code: "TRY", name: "Turkish lira", symbol: "₺", decimals: 2, max: 790000 },
  { code: "ILS", name: "Israeli shekel", symbol: "₪", decimals: 2, max: 51000 }
];

export const DEFAULT_CURRENCY = "PHP";

const BY_CODE = new Map(CURRENCIES.map((currency) => [currency.code, currency]));
export const isCurrency = (code) => BY_CODE.has(code);
// A row of the list; an empty or unknown code means pesos.
export const currencyInfo = (code) => BY_CODE.get(code) || BY_CODE.get(DEFAULT_CURRENCY);
// "USD · US dollar (US$)", for the currency dropdowns.
export const currencyLabel = (code) => {
  const { code: known, name, symbol } = currencyInfo(code);
  return `${known} · ${name} (${symbol})`;
};

// ---- Writing and reading amounts --------------------------------------------

const number = (amount, decimals) =>
  Number(amount).toLocaleString("en-PH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

// 1500, "USD" -> "US$1,500.00"; 7500, "JPY" -> "¥7,500"; 120, "CHF" -> "CHF 120.00".
// A code that is not in the list is written as the code itself ("XYZ 10.00"), like the
// database does. whole: true leaves the cents out (for estimates).
export function formatMoney(amount, code = DEFAULT_CURRENCY, { whole = false } = {}) {
  const known = BY_CODE.get(code || DEFAULT_CURRENCY);
  if (!known) return `${code} ${number(amount, whole ? 0 : 2)}`;
  const text = number(amount, whole ? 0 : known.decimals);
  return /[A-Za-z]$/.test(known.symbol) ? `${known.symbol} ${text}` : `${known.symbol}${text}`;
}

// "USD 1,500.00": the code instead of the symbol, for the PDF receipts (their built-in
// font has no ₱, € or ¥).
export function formatMoneyCode(amount, code = DEFAULT_CURRENCY) {
  const { code: known, decimals } = currencyInfo(code);
  return `${known} ${number(amount, decimals)}`;
}

// Reads an amount typed as "1,500", "1500.5" or "US$1,500" for this currency. Returns a
// number, or null when the database would refuse it: more than 0, at most the
// currency's max, and no more decimals than the currency has (none for yen, won,
// rupiah and dong).
export function parseMoney(input, code = DEFAULT_CURRENCY) {
  const { max, decimals } = currencyInfo(code);
  // Spaces and commas go, and so does a symbol or code typed in front ("US$", "CHF").
  const text = String(input ?? "").replace(/[\s,]/g, "").replace(/^[^\d.]+/, "");
  const pattern = decimals === 0 ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(text)) return null;
  const amount = Number(text);
  return amount > 0 && amount <= max ? amount : null;
}

// The rule parseMoney checks, as a sentence for a form's error.
export function moneyRule(code = DEFAULT_CURRENCY) {
  const { max, decimals } = currencyInfo(code);
  return decimals === 0
    ? `Enter a whole amount between ${formatMoney(1, code)} and ${formatMoney(max, code)}.`
    : `Enter an amount between ${formatMoney(0.01, code)} and ${formatMoney(max, code)}, with up to 2 decimals.`;
}

// What to put in an amount box's "step" and "max".
export const moneyStep = (code) => (currencyInfo(code).decimals === 0 ? "1" : "0.01");
export const moneyMax = (code) => currencyInfo(code).max;

// ---- The viewer's estimates ---------------------------------------------------

// Shared by every component that shows an estimate: the currency the viewer picked
// (Settings > Appearance > "Show estimates in"), the daily rates (how much of each
// currency one peso buys) and the day they are from. A component reads it with
// useMoneyView() and redraws when it changes.
const DISPLAY_KEY = "philfreela-display-currency";

function readSavedDisplay() {
  try {
    const saved = localStorage.getItem(DISPLAY_KEY);
    return isCurrency(saved) ? saved : DEFAULT_CURRENCY;
  } catch {
    // Storage is off (private browsing): pesos until the profile has loaded.
    return DEFAULT_CURRENCY;
  }
}

let view = { display: readSavedDisplay(), rates: null, ratesAt: null };
const listeners = new Set();

function updateView(changes) {
  view = { ...view, ...changes };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useMoneyView = () => useSyncExternalStore(subscribe, () => view);

// The rates are loaded once per visit, the first time an estimate is needed. If that
// fails the estimates just don't show, and the next one tries again.
let ratesLoad = null;
export function loadRates() {
  ratesLoad ??= supabase
    .from("currencies")
    .select("code, per_php, rate_updated_at")
    .then(({ data, error }) => {
      if (error || !data?.length) {
        ratesLoad = null;
        return;
      }
      const rates = Object.fromEntries(data.map((row) => [row.code, Number(row.per_php)]));
      const ratesAt = data.reduce((newest, row) => (row.rate_updated_at > newest ? row.rate_updated_at : newest), "");
      updateView({ rates, ratesAt: ratesAt || null });
    });
  return ratesLoad;
}

// An amount in one currency, in another one, or null when a rate is missing.
export function convertMoney(amount, from, to, rates) {
  if (from === to) return Number(amount);
  const fromRate = rates?.[from];
  const toRate = rates?.[to];
  if (!(fromRate > 0) || !(toRate > 0)) return null;
  return (Number(amount) / fromRate) * toRate;
}

// "≈ ₱2,869": the amount in the viewer's currency, or "" when it already is in it or
// the rates haven't loaded. From 100 up the estimate has no cents (it is a guide).
export function estimateText(amount, from, moneyView = view) {
  const to = moneyView.display;
  if (amount == null || amount === "" || !from || from === to) return "";
  const value = convertMoney(amount, from, to, moneyView.rates);
  if (value == null || !Number.isFinite(value)) return "";
  return `≈ ${formatMoney(value, to, { whole: value >= 100 })}`;
}

// The viewer's choice: kept in this browser (so it shows at once next time) and on
// the profile (so it follows them to another device).
export function setDisplayCurrency(code) {
  if (!isCurrency(code)) return;
  try {
    localStorage.setItem(DISPLAY_KEY, code);
  } catch {
    // Storage is off: it is still loaded from the profile each time.
  }
  updateView({ display: code });
}

// On sign-out, so the next person on this browser starts with pesos.
export function forgetDisplayCurrency() {
  try {
    localStorage.removeItem(DISPLAY_KEY);
  } catch {
    // Storage is off: there is nothing to remove.
  }
  updateView({ display: DEFAULT_CURRENCY });
}

// The choice saved on the profile, or null when it couldn't be loaded.
export async function fetchDisplayCurrency(userId) {
  const { data, error } = await supabase.from("profiles").select("display_currency").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return isCurrency(data.display_currency) ? data.display_currency : DEFAULT_CURRENCY;
}

// Returns "" when saved, or a message to show the user.
export async function saveDisplayCurrency(userId, code) {
  if (!isCurrency(code)) return "Pick a currency from the list.";
  // .select("id") returns the updated row, so an empty result means nothing was saved.
  const { data, error } = await supabase.from("profiles").update({ display_currency: code }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save your currency. Please try again.";
  return "";
}
