import { supabase } from "./supabaseClient";
import { plainMessage } from "./promotions";

// The admin side of the Community Billboard (PLAN-community-billboard.md, database/
// supabase_community_billboard_schema.sql): any admin reads every ad, approves or
// rejects a waiting one, and takes a running one down. The browser can only READ the
// table; answering goes through review_member_ad and take_down_member_ad, which
// check that the caller is an admin, tell the poster and write the Activity Log.

// The ad with who posted it and which admin answered it.
const COLUMNS = "id, owner_id, title, message, image_path, audience, price_code, days, link_service, link_job, link_profile, status, reject_reason, reviewed_at, starts_at, ends_at, created_at, owner:profiles!member_ads_owner_id_fkey(id, full_name, username, account_type), reviewer:admins!member_ads_reviewed_by_fkey(full_name)";

// The ads nobody has answered, the oldest first (the one that has waited longest).
export async function getWaitingAds() {
  const { data, error } = await supabase.from("member_ads").select(COLUMNS).eq("status", "pending").order("created_at", { ascending: true });
  if (error) console.error("Loading the waiting ads failed:", error);
  return error ? { error: "Failed to load the ads waiting for review." } : { ads: data };
}

// The ads running now (paid, and their last moment is ahead), the ones ending first on top.
export async function getRunningAds() {
  const { data, error } = await supabase
    .from("member_ads")
    .select(COLUMNS)
    .eq("status", "paid")
    .gt("ends_at", new Date().toISOString())
    .order("ends_at", { ascending: true });
  if (error) console.error("Loading the running ads failed:", error);
  return error ? { error: "Failed to load the ads that are running." } : { ads: data };
}

// The last 50 ads that are not waiting: approved and not paid yet, rejected, withdrawn,
// taken down, and ended. (The page leaves out the ones still running, which have their
// own list.)
export async function getAnsweredAds() {
  const { data, error } = await supabase.from("member_ads").select(COLUMNS).neq("status", "pending").order("created_at", { ascending: false }).limit(50);
  if (error) console.error("Loading the ad history failed:", error);
  return error ? { error: "Failed to load the ad history." } : { ads: data };
}

// How many ads wait for an admin (the number on the menu link).
export async function getPendingAdCount() {
  const { count } = await supabase.from("member_ads").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count || 0;
}

// "Approve" or "Reject": the database checks the person is an admin and that the ad is
// still waiting. A rejection needs the reason (3 to 200 characters), which the poster
// reads. Returns "" or a message to show.
export async function reviewAd(adId, approve, reason = null) {
  const { error } = await supabase.rpc("review_member_ad", { p_ad: adId, p_approve: approve, p_reason: approve ? null : reason });
  if (error) {
    console.error("Answering the ad failed:", error);
    return plainMessage(error, "Couldn't answer that ad. Please try again.");
  }
  return "";
}

// "Take down": only an ad that is running. The reason goes to the poster. Returns "" or a message.
export async function takeDownAd(adId, reason) {
  const { error } = await supabase.rpc("take_down_member_ad", { p_ad: adId, p_reason: reason });
  if (error) {
    console.error("Taking the ad down failed:", error);
    return plainMessage(error, "Couldn't take that ad down. Please try again.");
  }
  return "";
}
