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

// ---- The dashboard ---------------------------------------------------------

// The billboards the signed-in user should see, newest first. The database
// only returns the ones that are on and meant for them (everyone + their
// account type). Returns [] when there are none or they couldn't be loaded:
// the dashboard then simply has no billboard.
export async function getMyBillboards() {
  const { data, error } = await supabase
    .from("dashboard_billboards")
    .select("id, title, message, image_path")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(MAX_BILLBOARDS_SHOWN);
  return error ? [] : data;
}

// ---- The admin panel -------------------------------------------------------

const ADMIN_COLUMNS = "id, title, message, image_path, audience, is_active, created_at";

// Every billboard, on or off, newest first, with the admin who posted it.
export function getAllBillboards() {
  return supabase
    .from("dashboard_billboards")
    .select(`${ADMIN_COLUMNS}, author:admins!dashboard_billboards_created_by_fkey(full_name)`)
    .order("created_at", { ascending: false });
}

// Posts a billboard. The picture is optional; it is redrawn as a JPEG first,
// which makes it small and strips anything hidden inside the original file.
// Returns { billboard }, or { error } with a message to show.
export async function postBillboard(adminId, { title, message, audience, picture }) {
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

  const { data, error } = await supabase
    .from("dashboard_billboards")
    .insert({ title, message, audience, image_path: imagePath, created_by: adminId })
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

// Deletes a billboard and its picture. Returns true when it was deleted.
export async function deleteBillboard(billboard) {
  const { data, error } = await supabase.from("dashboard_billboards").delete().eq("id", billboard.id).select("id");
  if (error || !data?.length) return false;
  // If this fails it only leaves an unused file behind, so it isn't an error.
  if (billboard.image_path) await supabase.storage.from(BUCKET).remove([billboard.image_path]);
  return true;
}
