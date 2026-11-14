import { supabase } from "./supabaseClient";
import { currencyInfo, formatMoney, moneyRule, parseMoney, shownPrice } from "./money";

// The agreed price of a project (PLAN-transaction-tracking.md, Step A), see
// database/supabase_project_price_schema.sql. A project carries ONE price that
// payments will come from. It is copied from the booked service or the job post
// when the project starts; when there is none, one person proposes a price and
// the OTHER person agrees. PhilFreela never holds money: it is a number both
// people said yes to. The price has a currency (PLAN-currencies.md): the offer's or
// the job post's, or the one picked in a proposal; every payment on the project is
// in that currency.

// What the amount counts (projects.price_basis).
const BASIS_WORDS = { project: "for the whole project", day: "per day", month: "per month" };

// Where the price came from (projects.price_source).
const SOURCE_WORDS = { service: "From the service", job: "From the job post", proposal: "Agreed in this project" };

// "₱5,000.00 for the whole project", "US$800.00 per day". The same sentence the
// database writes in its notifications (price_text()). With moneyView (useMyCurrency()),
// the amount is in the reader's own currency, worked out at the day's rate
// (PLAN-currencies.md, "Turn into my currency"); the payments stay in the project's.
export function priceText(amount, basis, currency, moneyView = null) {
  const shown = moneyView && (currency || "PHP") !== moneyView.display ? shownPrice(amount, currency, moneyView) : formatMoney(amount, currency);
  return `${shown} ${BASIS_WORDS[basis] || BASIS_WORDS.project}`;
}

export function priceSourceText(source) {
  return SOURCE_WORDS[source] || "";
}

// A service price or job budget the database would accept as a price: more than
// 0, at most the currency's limit. Anything else counts as "no price", like the database.
export function usablePrice(value, currency) {
  const amount = Number(value);
  return value != null && amount > 0 && amount <= currencyInfo(currency).max ? amount : null;
}

// The line in the Book window: the price the project would start with (in the reader's
// currency when moneyView is given).
export function bookingPriceLine(price, freelancerName, currency, moneyView = null) {
  const amount = usablePrice(price, currency);
  if (amount) return `Price: ${priceText(amount, "project", currency, moneyView)}. It becomes the project's price if ${freelancerName} accepts.`;
  return "This offer has no price. After it starts, you and the freelancer agree on one on the project page.";
}

// The line in the Hire window: the price the project would start with.
export function hirePriceLine(job) {
  const amount = usablePrice(job?.budget, job?.currency);
  if (amount) return `Price: ${priceText(amount, job.budget_type, job.currency)} (from your job post).`;
  return "Your job post has no budget. After you hire, you and the freelancer agree on a price on the project page.";
}

// A person proposes a price. `input` is what they typed ("1,500"), `currency` the
// one they picked. Returns {} when sent, or { error } with a message.
export async function proposePrice(projectId, input, currency) {
  const amount = parseMoney(input, currency);
  if (amount === null) return { error: moneyRule(currency) };

  const { error } = await supabase.rpc("propose_project_price", { target_project: projectId, new_amount: amount, new_currency: currency });
  if (error) {
    // P0001 = a problem the database function explains in plain words.
    if (error.code === "P0001") return { error: error.message };
    console.error("Proposing the price failed:", error);
    return { error: "Couldn't send the price. Please try again." };
  }
  return {};
}

// The other person agrees to the proposed price. Returns {} or { error }.
export async function agreePrice(projectId) {
  const { error } = await supabase.rpc("agree_project_price", { target_project: projectId });
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("Agreeing to the price failed:", error);
    return { error: "Couldn't agree to the price. Please try again." };
  }
  return {};
}
