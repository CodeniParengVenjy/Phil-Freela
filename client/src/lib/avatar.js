import { supabase } from "./supabaseClient";
import { shrinkImage } from "./shrinkImage";

// Profile pictures live in the public "avatars" bucket, one folder per user
// (database/supabase_avatar_schema.sql). profiles.avatar_path says which file.
const BUCKET = "avatars";
const PICKABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_PICK_BYTES = 5 * 1024 * 1024;
// Pictures are shown at most 120 px wide, so 512 px is plenty (about 50 KB).
const PICTURE_SIDE = 512;

// The link a page can show, or null when the user has no picture.
export function avatarUrl(path) {
  return path ? supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl : null;
}

// Checks a picked file before it's previewed. Returns "" when it's fine, or a
// message to show the user.
export function checkAvatarFile(file) {
  if (!PICKABLE_TYPES.includes(file.type)) return "Please pick a JPG, PNG, WebP or GIF picture.";
  if (file.size > MAX_PICK_BYTES) return "Pictures must be 5 MB or smaller.";
  return "";
}

// Shrinks and uploads a new picture, saves it on the profile, then deletes
// the old one. Returns { path } when saved, or { error } with a message.
export async function uploadAvatar(userId, file, oldPath) {
  // Redrawing the picture as a small JPEG also strips anything hidden inside
  // the original file, so only a clean image is stored.
  let picture;
  try {
    picture = await shrinkImage(file, PICTURE_SIDE);
  } catch (error) {
    return { error: error.message };
  }

  // A new file name every time, so browsers don't keep showing the old picture.
  const path = `${userId}/${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, picture, { contentType: "image/jpeg" });
  if (uploadError) {
    // The exact reason (e.g. a missing storage rule) shows in the browser console (F12).
    console.error("Profile picture upload failed:", uploadError);
    return { error: "Couldn't upload your picture. Please try again." };
  }

  // .select("id") returns the updated row, so an empty result means nothing was saved.
  const { data, error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId).select("id");
  if (error || !data?.length) {
    console.error("Saving the profile picture failed:", error || "no profile row was updated");
    await supabase.storage.from(BUCKET).remove([path]); // don't leave an unused file behind
    return { error: "Couldn't save your picture. Please try again." };
  }

  // If this fails it only leaves an unused file behind, so it isn't an error.
  if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath]);
  return { path };
}
