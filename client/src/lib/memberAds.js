import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { shrinkImage } from "./shrinkImage";
import { plainMessage } from "./promotions";

// The Community Billboard (PLAN-community-billboard.md; the table, its rules and the
// functions are in database/supabase_community_billboard_schema.sql): verified
// freelancers and clients send an ad, an admin approves it, then the person pays on
// Xendit (lib/checkout.js) and it runs for the days they bought. The browser can only
// READ member_ads; sending, withdrawing and paying go through database functions that
// check who is asking.

// The three lengths, shortest first. The codes and prices are in promo_prices.
export const AD_CODES = ["ad_3", "ad_7", "ad_14"];
// The same limits as the database.
export const MAX_AD_TITLE = 80;
export const MAX_AD_MESSAGE = 300;
export const MAX_SPOTS = 5;

export const AD_AUDIENCES = [
  { value: "all", label: "Everyone" },
  { value: "freelancer", label: "Freelancers" },
  { value: "client", label: "Clients" }
];

// Sent on window when a payment was confirmed on the Advertise page, so it reads the ads again.
export const ADS_CHANGED = "philfreela:ads-changed";

const BUCKET = "member-ad-images";
const PICTURE_SIDE = 1600;

// The public link of an ad's picture ("" when it has none).
export function adImageUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "";
}

// Links are left out of the text (the button opens the person's own offer, job post
// or profile instead). The database refuses them too.
const LINK = /(https?:\/\/|www\.)/i;

// Checks the headline and the message. Returns "" when fine, or a message to show.
export function checkAdText({ title, message }) {
  const head = title.trim();
  const body = message.trim();
  if (head.length < 2 || head.length > MAX_AD_TITLE) return `The headline needs 2 to ${MAX_AD_TITLE} characters.`;
  if (body.length > MAX_AD_MESSAGE) return `The message can have up to ${MAX_AD_MESSAGE} characters.`;
  if (LINK.test(head) || LINK.test(body)) return "Please leave links out of the ad. The button can open your own offer or profile.";
  return "";
}

// What a price card or button shows: the member price with Premium.
export const adPrice = (priceRow, isPro) => (isPro && priceRow.pro_price != null ? priceRow.pro_price : priceRow.price);

// How an ad is named on the page. "running" and "ended" are worked out from its
// dates: the database only says "paid".
export const AD_STATES = {
  pending: { label: "Waiting for review", className: "bg-info text-dark" },
  approved: { label: "Approved", className: "bg-warning text-dark" },
  rejected: { label: "Rejected", className: "bg-danger text-white" },
  running: { label: "Running", className: "bg-success text-white" },
  ended: { label: "Ended", className: "bg-secondary" },
  canceled: { label: "Withdrawn", className: "bg-secondary" },
  removed: { label: "Taken down", className: "bg-danger text-white" }
};

export function adState(ad, now = Date.now()) {
  if (ad.status === "paid") return new Date(ad.ends_at).getTime() > now ? "running" : "ended";
  return ad.status;
}

// The button on an ad: one of the poster's own things, inside PhilFreela. `ad` needs
// link_service / link_job / link_profile and the owner's id and account type.
export function adButton(ad) {
  if (ad.link_service) return { to: `/dashboard/service-details/${ad.link_service}`, label: "View my offer" };
  if (ad.link_job) return { to: `/dashboard/job-details/${ad.link_job}`, label: "View my job post" };
  if (ad.link_profile) {
    const where = ad.owner?.account_type === "client" ? "clients" : "freelancers";
    return { to: `/dashboard/${where}/${ad.owner_id}`, label: "View my profile" };
  }
  return null;
}

// ---- The Advertise page ----------------------------------------------------

// The prices of the three lengths. Returns { prices } or { error }.
export async function getAdPrices() {
  const { data, error } = await supabase
    .from("promo_prices")
    .select("code, label, days, price, pro_price")
    .in("code", AD_CODES)
    .order("days", { ascending: true });
  return error || !data?.length ? { error: "Couldn't load the prices. Please try again." } : { prices: data };
}

const AD_COLUMNS = "id, title, message, image_path, audience, price_code, days, link_service, link_job, link_profile, status, reject_reason, starts_at, ends_at, created_at";

// The person's own ads, newest first. Returns { ads } or { error }.
export async function getMyAds(userId) {
  const { data, error } = await supabase.from("member_ads").select(AD_COLUMNS).eq("owner_id", userId).order("created_at", { ascending: false });
  if (error) console.error("Loading the ads failed:", error);
  return error ? { error: "Couldn't load your ads. Please try again." } : { ads: data };
}

// How many of the 5 spots are free right now, or null when it couldn't be asked.
export async function getSpotsLeft() {
  const { data, error } = await supabase.rpc("member_ads_slots_left");
  return error || typeof data !== "number" ? null : data;
}

// The person's own offers and job posts, for "the button opens ...".
export async function getLinkChoices(userId) {
  const [services, jobs] = await Promise.all([
    supabase.from("services").select("id, title").eq("freelancer_id", userId).order("created_at", { ascending: false }),
    supabase.from("job_posts").select("id, title").eq("client_id", userId).order("created_at", { ascending: false })
  ]);
  return { services: services.data || [], jobs: jobs.data || [] };
}

// Sends an ad for review (nothing is charged). The picture is redrawn as a small JPEG
// first, which also strips anything hidden in the original file, and goes into the
// person's own folder. If the database refuses, the upload is removed again.
// link: { kind: "service" | "job" | "profile", id } or null. Returns { id } or { error }.
export async function requestAd({ userId, title, message, picture, audience, code, link }) {
  let imagePath = null;
  if (picture) {
    let jpeg;
    try {
      jpeg = await shrinkImage(picture, PICTURE_SIDE);
    } catch (error) {
      return { error: error.message };
    }
    imagePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
    const upload = await supabase.storage.from(BUCKET).upload(imagePath, jpeg, { contentType: "image/jpeg" });
    if (upload.error) {
      console.error("Ad picture upload failed:", upload.error);
      return { error: "Couldn't upload the picture. Please try again." };
    }
  }
  const { data, error } = await supabase.rpc("request_member_ad", {
    p_title: title.trim(),
    p_message: message.trim() || null,
    p_image_path: imagePath,
    p_audience: audience,
    p_code: code,
    p_link_kind: link?.kind ?? null,
    p_link_id: link?.id ?? null
  });
  if (error) {
    console.error("Sending the ad failed:", error);
    // If this fails it only leaves an unused file behind, so it isn't an error.
    if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]);
    return { error: plainMessage(error, "Couldn't send your ad. Please try again.") };
  }
  return { id: data };
}

// The owner takes back an ad that is waiting or approved. Returns { error } or {}.
export async function withdrawAd(adId) {
  const { error } = await supabase.rpc("withdraw_member_ad", { p_ad: adId });
  if (error) {
    console.error("Withdrawing the ad failed:", error);
    return { error: plainMessage(error, "Couldn't withdraw that ad. Please try again.") };
  }
  return {};
}

// ---- The dashboard strip ---------------------------------------------------

// The ads running now that this person may see (the database only sends the ones
// meant for them), newest first, with who posted each. [] when there are none or
// they couldn't be loaded: the dashboard then simply has no strip.
export function useRunningAds() {
  const [ads, setAds] = useState([]);

  useEffect(() => {
    let active = true;
    const now = new Date().toISOString();
    supabase
      .from("member_ads")
      .select("id, title, message, image_path, link_service, link_job, link_profile, owner_id, owner:profiles!member_ads_owner_id_fkey(id, full_name, account_type)")
      .eq("status", "paid")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("starts_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (active) setAds(error ? [] : data);
      });
    return () => {
      active = false;
    };
  }, []);

  return ads;
}
