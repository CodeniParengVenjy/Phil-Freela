import { supabase } from "./supabaseClient";
import { storagePathFromUrl } from "./storage";

// Admin "Remove" for a service or job post, shared by the admin Listings page
// and the admin Browse pages. table is "services" or "job_posts".
// Returns true if the listing was deleted.
export async function removeListing(table, item) {
  // The "admins can delete any" database rules allow this. .select("id")
  // returns the deleted rows, so an empty result means nothing was deleted.
  const { data, error } = await supabase.from(table).delete().eq("id", item.id).select("id");
  if (error || !data?.length) return false;

  // Services may have a photo/video in storage; delete it too so no unused
  // file is left behind. A failure here only leaves a stray file.
  const path = storagePathFromUrl(item.image_url);
  if (path) await supabase.storage.from("marketplace-images").remove([path]);

  return true;
}
