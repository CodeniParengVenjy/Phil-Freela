import { supabase } from "./supabaseClient";
import { removeServiceFiles } from "./slides";

// Admin "Remove" for a service or job post, shared by the admin Listings page
// and the admin Browse pages. table is "services" or "job_posts".
// Returns true if the listing was deleted.
export async function removeListing(table, item) {
  // The "admins can delete any" database rules allow this. .select("id")
  // returns the deleted rows, so an empty result means nothing was deleted.
  const { data, error } = await supabase.from(table).delete().eq("id", item.id).select("id");
  if (error || !data?.length) return false;

  // Services have photos/videos in storage; delete them too so no unused
  // files are left behind. A failure here only leaves stray files.
  if (table === "services") await removeServiceFiles(item);

  return true;
}
