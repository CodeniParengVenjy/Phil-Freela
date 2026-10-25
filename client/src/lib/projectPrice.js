import { supabase } from "./supabaseClient";
import { MAX_PAYMENT_AMOUNT, formatPeso, parseAmount } from "./payments";

// The agreed price of a project (PLAN-transaction-tracking.md, Step A), see
// database/supabase_project_price_schema.sql. A project carries ONE price that
// payments will come from. It is copied from the booked service or the job post
// when the project starts; when there is none, one person proposes a price and
// the OTHER person agrees. PhilFreela never holds money: it is a number both
// people said yes to.

// What the amount counts (projects.price_basis).
const BASIS_WORDS = { project: "for the whole project", day: "per day", month: "per month" };

// Where the price came from (projects.price_source).
const SOURCE_WORDS = { service: "From the service", job: "From the job post", proposal: "Agreed in this project" };

// "₱5,000.00 for the whole project". The same sentence the database writes in
// its notifications (price_text()).
export function priceText(amount, basis) {
  return `${formatPeso(amount)} ${BASIS_WORDS[basis] || BASIS_WORDS.project}`;
}

export function priceSourceText(source) {
  return SOURCE_WORDS[source] || "";
}

// A service price or job budget the database would accept as a price: more than
// 0, at most 1,000,000. Anything else counts as "no price", like the database.
export function usablePrice(value) {
  const amount = Number(value);
  return value != null && amount > 0 && amount <= MAX_PAYMENT_AMOUNT ? amount : null;
}

// The line in the Book window: the price the project would start with.
export function bookingPriceLine(price, freelancerName) {
  const amount = usablePrice(price);
  if (amount) return `Price: ${priceText(amount, "project")}. It becomes the project's price if ${freelancerName} accepts.`;
  return "This offer has no price. After it starts, you and the freelancer agree on one on the project page.";
}

// The line in the Hire window: the price the project would start with.
export function hirePriceLine(job) {
  const amount = usablePrice(job?.budget);
  if (amount) return `Price: ${priceText(amount, job.budget_type)} (from your job post).`;
  return "Your job post has no budget. After you hire, you and the freelancer agree on a price on the project page.";
}

// A person proposes a price. `input` is what they typed ("1,500"). Returns {} when
// sent, or { error } with a message.
export async function proposePrice(projectId, input) {
  const amount = parseAmount(input);
  if (amount === null) return { error: "Enter a price between ₱0.01 and ₱1,000,000, with up to 2 decimals." };

  const { error } = await supabase.rpc("propose_project_price", { target_project: projectId, new_amount: amount });
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
