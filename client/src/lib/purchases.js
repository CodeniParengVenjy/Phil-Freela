import { supabase } from "./supabaseClient";

// What a person paid PhilFreela for online through Xendit: Premium, Featured
// posts and Community Billboard ads (PLAN-payment-receipt.md, Step 4). Each paid
// checkout is a row in online_checkouts; once paid, its promotions row says when
// it runs and holds Xendit's payment id. The database already lets each person
// read only their own rows, so nothing new was needed there.

const CHECKOUT_FIELDS = "id, price_code, days, amount, test_mode, status, created_at, paid_at, promotion_id, target_title";

// What was bought, from the price code: "pro_30", "feature_7", "ad_14".
const KINDS = {
  pro: { icon: "bi-gem", name: (days) => `Premium for ${days} days`, detailLabel: "" },
  feature: { icon: "bi-star-fill", name: (days) => `Featured post for ${days} days`, detailLabel: "Post" },
  ad: { icon: "bi-megaphone-fill", name: (days) => `Community Billboard ad for ${days} days`, detailLabel: "Ad" }
};
export const purchaseKind = (code) => KINDS[String(code).split("_")[0]] || { icon: "bi-bag-check", name: () => "PhilFreela service", detailLabel: "" };

// "PFO-" + the first 8 characters of the checkout id (O for "online"), so it
// never looks like a GCash payment's "PF-" receipt.
export const purchaseNumber = (purchase) => `PFO-${String(purchase.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;

// Adds when each one runs and Xendit's payment id (from promotions) to the rows.
async function withDetails(rows) {
  const promotionIds = rows.map((row) => row.promotion_id).filter(Boolean);
  let promotions = [];
  if (promotionIds.length) {
    const { data, error } = await supabase.from("promotions").select("id, starts_at, ends_at, provider_payment_id").in("id", promotionIds);
    if (error) throw error;
    promotions = data || [];
  }
  return rows.map((row) => {
    const kind = purchaseKind(row.price_code);
    const promotion = promotions.find((p) => p.id === row.promotion_id);
    return {
      ...row,
      icon: kind.icon,
      item: kind.name(row.days),
      // ["Post", "Wedding video editing"] for a Featured post or an ad, else null.
      detail: kind.detailLabel && row.target_title ? [kind.detailLabel, row.target_title] : null,
      startsAt: promotion?.starts_at || null,
      endsAt: promotion?.ends_at || null,
      xenditId: promotion?.provider_payment_id || ""
    };
  });
}

// The person's paid purchases, newest first: { data } or { error }. Unpaid or
// expired checkouts are left out (nothing was charged), and so are free Featured
// posts (the Premium perk), which never had a checkout.
export async function listMyPurchases(userId) {
  try {
    const { data, error } = await supabase
      .from("online_checkouts")
      .select(CHECKOUT_FIELDS)
      .eq("user_id", userId)
      .eq("status", "paid")
      .order("paid_at", { ascending: false });
    if (error) throw error;
    return { data: await withDetails(data || []) };
  } catch (error) {
    console.error("Loading the purchases failed:", error);
    return { error: "Couldn't load your purchases. Please try again." };
  }
}

// One paid purchase by its checkout id (the Premium page uses it right after
// paying): { data } or { error }.
export async function getPurchase(checkoutId) {
  try {
    const { data, error } = await supabase.from("online_checkouts").select(CHECKOUT_FIELDS).eq("id", checkoutId).eq("status", "paid").maybeSingle();
    if (error) throw error;
    if (!data) return { error: "That payment isn't confirmed yet, so there is no receipt. Try again in a minute." };
    return { data: (await withDetails([data]))[0] };
  } catch (error) {
    console.error("Loading the purchase failed:", error);
    return { error: "Couldn't load the receipt. Please try again." };
  }
}
