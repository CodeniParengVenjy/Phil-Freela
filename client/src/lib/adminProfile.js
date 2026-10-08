import { supabase } from "./supabaseClient";

// "My Profile" in the admin panel: an admin's own name and username. The
// waiting times (name 7 days, username 30 days) are enforced by the database
// function update_my_admin_profile (database/supabase_admin_profile_schema.sql);
// the numbers on screen come from lib/profile.js.

// The signed-in admin's own row, with when each was last changed (null = never).
// Returns null if it couldn't be loaded.
export async function fetchAdminProfile(adminId) {
  const { data } = await supabase
    .from("admins")
    .select("full_name, username, role, name_changed_at, username_changed_at")
    .eq("id", adminId)
    .maybeSingle();
  return data || null;
}

// Saves the name and username. Either can stay as it was. Returns "" when
// saved, or the database's own plain-words message ("You can change your name
// again on ...", "That username is already taken.").
export async function saveAdminProfile(name, username) {
  const { error } = await supabase.rpc("update_my_admin_profile", { new_name: name, new_username: username });
  if (error) return error.message || "Couldn't save your profile. Please try again.";

  // The copy kept in the sign-in is what the emails use. If only this part
  // fails, the profile itself is still saved.
  await supabase.auth.updateUser({ data: { full_name: name.trim(), username: username.trim() } });
  return "";
}
