import { supabase } from "./supabaseClient";
import { shrinkImage } from "./shrinkImage";

// The admin side of the fees PhilFreela earns (PLAN-monetization.md,
// database/supabase_promotions_schema.sql): a freelancer or client pays in the
// GCash app to PhilFreela's own number and sends the reference and a receipt; an
// admin checks PhilFreela's own GCash and approves or rejects. The browser can
// only READ the requests; approving and rejecting go through database functions
// that check who is asking.

// How a request is named on the page.
export const PROMO_KINDS = {
  feature_service: { label: "Featured offer", icon: "bi-grid-fill" },
  feature_job: { label: "Featured job post", icon: "bi-briefcase-fill" },
  pro: { label: "Freelancer Pro", icon: "bi-patch-check-fill" }
};

// A message to show for a failed call: the database's own plain sentence when
// it raised one (e.g. "This request was already answered."), else a fallback.
export function plainMessage(error, fallback) {
  const text = error?.message || "";
  // Technical errors (permission, network, SQL) are not for the admin to read.
  return text && !/^(permission|new row|duplicate|violates|invalid|could not|failed to fetch|TypeError)/i.test(text) ? text : fallback;
}

// ---------------------------------------------------------------------------
// The requests
// ---------------------------------------------------------------------------

const REQUEST_FIELDS = "id, user_id, kind, price_code, service_id, job_id, target_title, days, amount, reference_no, receipt_path, method, provider_payment_id, test_mode, status, reject_reason, created_at, decided_at, starts_at, ends_at, person:profiles!promotions_user_id_fkey(id, full_name, username), decider:admins!promotions_decided_by_fkey(full_name)";

// The requests nobody has answered, the oldest first (the one that has waited longest).
export function getWaitingRequests() {
  return supabase.from("promotions").select(REQUEST_FIELDS).eq("status", "pending").order("created_at", { ascending: true });
}

// The last 50 answered requests, newest first.
export function getAnsweredRequests() {
  return supabase.from("promotions").select(REQUEST_FIELDS).in("status", ["approved", "rejected"]).order("decided_at", { ascending: false }).limit(50);
}

// What is Featured or Pro right now (an ended period is left out).
export async function getRunning() {
  const now = new Date().toISOString();
  const [featured, pro] = await Promise.all([
    supabase
      .from("featured_posts")
      .select("id, service_id, job_id, featured_until, service:services(id, title, freelancer:profiles!services_freelancer_id_fkey(full_name, username)), job:job_posts(id, title, client:profiles!job_posts_client_id_fkey(full_name, username))")
      .gt("featured_until", now)
      .order("featured_until", { ascending: true }),
    supabase
      .from("pro_members")
      .select("user_id, pro_until, person:profiles!pro_members_user_id_fkey(full_name, username)")
      .gt("pro_until", now)
      .order("pro_until", { ascending: true })
  ]);
  if (featured.error || pro.error) return { error: "Failed to load what is running." };
  return { featured: featured.data, pro: pro.data };
}

// "Approve": the database checks the person is an admin and that the request is
// still waiting, starts the period (or adds to the one running), and tells the
// person. Returns "" or a message to show.
export async function approveRequest(id) {
  const { error } = await supabase.rpc("approve_promotion", { target_promotion: id });
  if (error) {
    console.error("Approving the payment failed:", error);
    return plainMessage(error, "Couldn't approve that payment. Please try again.");
  }
  return "";
}

export const MIN_REASON = 3;
export const MAX_REASON = 200;

// "Reject": the reason (3 to 200 characters) goes to the person. Returns "" or a message.
export async function rejectRequest(id, reason) {
  const { error } = await supabase.rpc("reject_promotion", { target_promotion: id, reason });
  if (error) {
    console.error("Rejecting the payment failed:", error);
    return plainMessage(error, "Couldn't reject that payment. Please try again.");
  }
  return "";
}

// Opens a receipt in a new tab through a link that stops working after 60
// seconds. Returns "" or a message.
export async function openPromoReceipt(path) {
  const tab = window.open("", "_blank");
  const { data, error } = await supabase.storage.from("promo-receipts").createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    tab?.close();
    return "Couldn't open that receipt. Please try again.";
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
  return "";
}

// ---------------------------------------------------------------------------
// PhilFreela's own GCash number and QR (a super admin sets them)
// ---------------------------------------------------------------------------

const QR_BUCKET = "promo-qr";

// The one row, or null when it has not been set yet.
export async function getSiteGcash() {
  const { data, error } = await supabase.from("site_gcash").select("gcash_number, account_name, qr_path").maybeSingle();
  return error ? { error: "Failed to load PhilFreela's GCash details." } : { gcash: data };
}

// Redraws the QR as a plain JPEG (which also makes sure it really is a picture
// and strips anything hidden in the file) and uploads it into the admin's own
// folder. Returns { path } or { error }.
export async function uploadSiteQr(adminId, file) {
  let picture;
  try {
    picture = await shrinkImage(file, 1200);
  } catch (error) {
    return { error: error.message };
  }
  const path = `${adminId}/qr-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(QR_BUCKET).upload(path, picture, { contentType: "image/jpeg" });
  if (error) {
    console.error("Uploading the PhilFreela QR failed:", error);
    return { error: "Couldn't upload that picture. Please try again." };
  }
  return { path };
}

// If removing an old file fails it only leaves the file behind, so it is never an error.
export const removeSiteQr = (path) => (path ? supabase.storage.from(QR_BUCKET).remove([path]) : null);

export async function getSiteQrLink(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(QR_BUCKET).createSignedUrl(path, 60 * 60);
  return error ? null : data?.signedUrl ?? null;
}

// Saves the number, the name and the QR path (the table has one row, id = true).
// Returns { gcash } or { error }.
export async function saveSiteGcash({ number, name, qrPath }) {
  const { data, error } = await supabase
    .from("site_gcash")
    .upsert({ id: true, gcash_number: number, account_name: name, qr_path: qrPath }, { onConflict: "id" })
    .select("gcash_number, account_name, qr_path")
    .single();
  if (error) {
    console.error("Saving the PhilFreela GCash details failed:", error);
    return { error: "Couldn't save the GCash details. Please check them and try again." };
  }
  return { gcash: data };
}

// ---------------------------------------------------------------------------
// The price list (a super admin can change the two prices of each option)
// ---------------------------------------------------------------------------

export const MAX_PROMO_PRICE = 100000;

export async function getPrices() {
  const { data, error } = await supabase.from("promo_prices").select("code, label, days, price, pro_price").order("days", { ascending: true });
  return error ? { error: "Failed to load the prices." } : { prices: data };
}

// Checks the two prices typed for one option. `proPrice` is "" when the option
// has no Pro price (the Pro plan itself). Returns { error } or { price, proPrice }.
export function checkPrices({ price, proPrice }, hasProPrice) {
  const read = (text) => {
    const cleaned = String(text ?? "").replace(/[\s,₱]/g, "");
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
    return Number(cleaned);
  };
  const normal = read(price);
  if (normal === null || normal <= 0 || normal > MAX_PROMO_PRICE) {
    return { error: "The price must be more than 0 and at most 100,000 pesos, with up to 2 decimals." };
  }
  if (!hasProPrice || String(proPrice ?? "").trim() === "") return { price: normal, proPrice: null };
  const member = read(proPrice);
  if (member === null || member <= 0 || member > normal) {
    return { error: "The Pro price must be more than 0 and no more than the normal price." };
  }
  return { price: normal, proPrice: member };
}

export async function savePrice(code, { price, proPrice }) {
  const { data, error } = await supabase
    .from("promo_prices")
    .update({ price, pro_price: proPrice })
    .eq("code", code)
    .select("code, label, days, price, pro_price");
  if (error || !data?.length) {
    console.error("Saving the price failed:", error);
    return { error: "Couldn't save that price. Please try again." };
  }
  return { price: data[0] };
}

// ---------------------------------------------------------------------------
// The Overview's Earnings numbers
// ---------------------------------------------------------------------------

// What PhilFreela has earned from fees (admin_promo_earnings()). Returns
// { earnings } or { error }.
export async function getEarnings() {
  const { data, error } = await supabase.rpc("admin_promo_earnings");
  return error ? { error: "Failed to load the earnings." } : { earnings: data };
}
