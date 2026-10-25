import { supabase } from "./supabaseClient";
import { shrinkImage } from "./shrinkImage";

// The dashboard billboard: the board at the top of every user's dashboard
// home, where an admin posts a welcome message or an advertisement (admin
// panel > Billboard). The table, its rules and the picture bucket are in
// database/supabase_billboard_schema.sql. Who can read or change what is
// decided by the database, not by this file.

// The same limits as the database.
export const MAX_BILLBOARD_TITLE = 80;
export const MAX_BILLBOARD_MESSAGE = 300;
export const MAX_BILLBOARD_SPONSOR = 60;
const MAX_BILLBOARD_AMOUNT = 1000000;
// The dashboard shows at most this many, newest first, one after another.
const MAX_BILLBOARDS_SHOWN = 5;

const BUCKET = "billboard-images";
const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const BILLBOARD_PICTURE_ACCEPT = PICTURE_TYPES.join(",");
const MAX_PICTURE_BYTES = 10 * 1024 * 1024; // redrawn much smaller before uploading
// Wide enough to fill the board on a laptop screen.
const PICTURE_SIDE = 1600;

// Returns a message when the file can't be a billboard picture, or "" when it's fine.
export function checkBillboardPicture(file) {
  if (!PICTURE_TYPES.includes(file.type)) return "Please choose a JPG, PNG, or WebP picture.";
  if (file.size > MAX_PICTURE_BYTES) return "Pictures must be 10 MB or smaller.";
  return "";
}

// The public link of a billboard's picture ("" when it has none).
export function billboardImageUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : "";
}

// ---- Dates -----------------------------------------------------------------
// A sponsorship runs for whole days in Manila time (UTC+8, no daylight saving).
// The first day starts at midnight and the LAST day is shown in full, so the
// database's end moment is the start of the day after it. The database hides a
// billboard outside its dates by itself (supabase_promotions_schema.sql).

const MANILA = "Asia/Manila";
const DAY_MS = 24 * 60 * 60 * 1000;

// Today in Manila as "2026-06-10", the value a date box uses.
export function todayInManila() {
  return new Date().toLocaleDateString("en-CA", { timeZone: MANILA });
}

// The moment the given Manila day starts.
function dayStart(day) {
  return new Date(`${day}T00:00:00+08:00`);
}

// The Manila day of a stored moment, as "2026-06-10". For a billboard's start
// that is its first day.
export function dayOf(moment) {
  return new Date(moment).toLocaleDateString("en-CA", { timeZone: MANILA });
}

// "Jun 10, 2026" for a stored moment.
export function formatDay(moment) {
  return new Date(moment).toLocaleDateString("en-US", { timeZone: MANILA, month: "short", day: "numeric", year: "numeric" });
}

// The last day a stored end moment still shows, as "2026-06-10" ("" = no end).
export function lastDayOf(endsAt) {
  return endsAt ? dayOf(new Date(endsAt).getTime() - DAY_MS) : "";
}

// What a billboard is doing right now, for the admin's list: "off" (switched
// off), "scheduled" (starts later), "ended" or "running".
export function billboardState(billboard, now = Date.now()) {
  if (!billboard.is_active) return "off";
  if (new Date(billboard.starts_at).getTime() > now) return "scheduled";
  if (billboard.ends_at && new Date(billboard.ends_at).getTime() <= now) return "ended";
  return "running";
}

// Checks the sponsor part of the form and turns the days into what the
// database stores. Returns { error } with a message, or the values to save:
// { sponsorName, amount, paymentRef, startsAt, endsAt }. startsAt is null when
// the first day is today (the database then uses the moment of posting).
export function checkSponsorship({ sponsorName, amount, paymentRef, startDay, endDay }) {
  const sponsor = sponsorName.trim();
  const amountText = amount.trim().replace(/,/g, "");
  const reference = paymentRef.replace(/\s/g, "");

  if (!sponsor && (amountText || reference)) return { error: "Add the sponsor's name, or clear the amount and the reference." };
  if (sponsor.length > MAX_BILLBOARD_SPONSOR) return { error: `The sponsor's name can have up to ${MAX_BILLBOARD_SPONSOR} characters.` };

  const today = todayInManila();
  const first = startDay || today;
  if (first < today) return { error: "The first day can't be before today." };
  if (sponsor && !endDay) return { error: "A sponsored billboard needs a last day." };
  if (endDay && endDay < first) return { error: "The last day can't be before the first day." };

  let amountValue = null;
  if (amountText) {
    amountValue = Number(amountText);
    if (!Number.isFinite(amountValue) || amountValue <= 0 || amountValue > MAX_BILLBOARD_AMOUNT) {
      return { error: "The amount must be more than 0 and at most 1,000,000 pesos." };
    }
    if (Math.round(amountValue * 100) / 100 !== amountValue) return { error: "The amount can have up to 2 decimals." };
  }
  if (reference && !/^[0-9]{13}$/.test(reference)) return { error: "The GCash reference number is 13 digits." };

  return {
    sponsorName: sponsor || null,
    amount: amountValue,
    paymentRef: reference || null,
    startsAt: first === today ? null : dayStart(first).toISOString(),
    endsAt: endDay ? new Date(dayStart(endDay).getTime() + DAY_MS).toISOString() : null
  };
}

// Checks a new last day for a posted billboard. Returns { error } or { endsAt }
// (null = no end date, only for a billboard with no sponsor).
export function checkNewEnd(billboard, day) {
  if (!day) {
    return billboard.sponsor_name ? { error: "A sponsored billboard needs a last day." } : { endsAt: null };
  }
  if (day < dayOf(billboard.starts_at)) return { error: "The last day can't be before the first day." };
  return { endsAt: new Date(dayStart(day).getTime() + DAY_MS).toISOString() };
}

// ---- The dashboard ---------------------------------------------------------

// The billboards the signed-in user should see, newest first. The database
// only returns the ones that are on, meant for them (everyone + their account
// type) and inside their dates. Returns [] when there are none or they
// couldn't be loaded: the dashboard then simply has no billboard.
export async function getMyBillboards() {
  const { data, error } = await supabase
    .from("dashboard_billboards")
    .select("id, title, message, image_path, sponsor_name")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(MAX_BILLBOARDS_SHOWN);
  return error ? [] : data;
}

// ---- The admin panel -------------------------------------------------------

const ADMIN_COLUMNS = "id, title, message, image_path, audience, is_active, created_at, sponsor_name, amount, payment_ref, starts_at, ends_at";

// Every billboard, on or off, newest first, with the admin who posted it.
export function getAllBillboards() {
  return supabase
    .from("dashboard_billboards")
    .select(`${ADMIN_COLUMNS}, author:admins!dashboard_billboards_created_by_fkey(full_name)`)
    .order("created_at", { ascending: false });
}

// Posts a billboard. The picture is optional; it is redrawn as a JPEG first,
// which makes it small and strips anything hidden inside the original file.
// The sponsor part (sponsorName, amount, paymentRef, startsAt, endsAt) comes
// from checkSponsorship() and is all optional. Returns { billboard }, or
// { error } with a message to show.
export async function postBillboard(adminId, { title, message, audience, picture, sponsorName = null, amount = null, paymentRef = null, startsAt = null, endsAt = null }) {
  let imagePath = null;
  if (picture) {
    let jpeg;
    try {
      jpeg = await shrinkImage(picture, PICTURE_SIDE);
    } catch (error) {
      return { error: error.message };
    }
    // In the admin's own folder, named by the time plus a random part, so
    // nothing in the picked file's name ends up in the address.
    imagePath = `${adminId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(imagePath, jpeg, { contentType: "image/jpeg" });
    if (uploadError) {
      // The exact reason (e.g. a missing storage rule) shows in the browser console (F12).
      console.error("Billboard picture upload failed:", uploadError);
      return { error: "Couldn't upload the picture. Please try again." };
    }
  }

  // No startsAt = the database starts it now.
  const fields = { title, message, audience, image_path: imagePath, created_by: adminId, sponsor_name: sponsorName, amount, payment_ref: paymentRef, ends_at: endsAt };
  if (startsAt) fields.starts_at = startsAt;
  const { data, error } = await supabase
    .from("dashboard_billboards")
    .insert(fields)
    .select(ADMIN_COLUMNS)
    .single();
  if (error) {
    console.error("Posting the billboard failed:", error);
    if (imagePath) await supabase.storage.from(BUCKET).remove([imagePath]); // don't leave an unused file behind
    return { error: "Couldn't post the billboard." };
  }
  return { billboard: data };
}

// Switches a billboard on or off. Returns true when it was saved.
export async function setBillboardActive(id, isActive) {
  // .select("id") returns the updated row, so an empty result means nothing was saved.
  const { data, error } = await supabase.from("dashboard_billboards").update({ is_active: isActive }).eq("id", id).select("id");
  return !error && data?.length > 0;
}

// Moves a billboard's end (from checkNewEnd), to extend a sponsorship. The
// start can't be changed. Returns true when it was saved.
export async function setBillboardEnd(id, endsAt) {
  const { data, error } = await supabase.from("dashboard_billboards").update({ ends_at: endsAt }).eq("id", id).select("id");
  return !error && data?.length > 0;
}

// Deletes a billboard and its picture. Returns true when it was deleted.
export async function deleteBillboard(billboard) {
  const { data, error } = await supabase.from("dashboard_billboards").delete().eq("id", billboard.id).select("id");
  if (error || !data?.length) return false;
  // If this fails it only leaves an unused file behind, so it isn't an error.
  if (billboard.image_path) await supabase.storage.from(BUCKET).remove([billboard.image_path]);
  return true;
}
