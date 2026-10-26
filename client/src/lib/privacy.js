import { supabase } from "./supabaseClient";

// Data Privacy Compliance (feature 6): "Delete your account", the part of
// RA 10173's "user rights" principle that needs its own code (a normal login
// can't delete the auth.users row directly, so it goes through a database
// function). "Download your data" was taken out of Settings on 2026-10-27.

// Deletes the signed-in user's account and everything that belongs to it
// (profile, posts, portfolio, messages, and so on cascade with it). There's
// no going back from this -- the caller should already have a confirmation
// step before calling it.
export async function deleteMyAccount() {
  const { error } = await supabase.rpc("delete_my_account");
  if (error) throw new Error(error.message);
  await supabase.auth.signOut();
}
