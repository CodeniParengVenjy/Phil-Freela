import { supabase } from "./supabaseClient";
import { SUSPENSION_COLUMNS, suspensionStatus } from "./suspensions";

export function dashboardRouteFor(accountType) {
  return accountType === "freelancer" ? "/dashboard-freelancer" : "/dashboard-client";
}

// Returns this user's ban or suspension if it's still in effect, or null.
// Users can only read their own suspension row (database rule).
export async function getActiveSuspension(userId) {
  const { data } = await supabase.from("user_suspensions").select(SUSPENSION_COLUMNS).eq("user_id", userId).maybeSingle();
  return suspensionStatus(data) ? data : null;
}

// Longest display name allowed -- the same limit as the sign-up form.
export const MAX_NAME_LENGTH = 100;

// Saves a new display name (Settings > Display Name). It goes into
// profiles.full_name, the name other people see in chat, jobs and services,
// and into the login's user_metadata, the copy the emails use ("Reset your
// password, Venj"). Returns "" when saved, or a message to show the user.
export async function saveDisplayName(userId, name) {
  const fullName = name.trim();
  if (!fullName) return "Please enter a name.";
  if (fullName.length > MAX_NAME_LENGTH) return `Your name can't be longer than ${MAX_NAME_LENGTH} characters.`;

  // .select("id") returns the updated row, so an empty result means nothing was saved.
  const { data, error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save your name. Please try again.";

  // The dashboard reads the name from profiles, so if only this second copy
  // fails, the new name still shows everywhere; it isn't treated as an error.
  await supabase.auth.updateUser({ data: { full_name: fullName } });
  return "";
}

// Ensures a `profiles` row exists for an authenticated user, returning the
// route to send them to next.
//
// Two cases lead here without a profile row already existing:
//  - Google sign-in: Supabase created the auth.users row itself, so there's
//    no username/gender to insert yet.
//  - Email/password signup while "Confirm email" is enabled: signUp() didn't
//    return a session, so the original insert attempt right after signUp
//    couldn't pass the "auth.uid() = id" RLS check and never ran. The
//    username/gender collected at signup time were preserved in
//    user_metadata, so we can create the row now that a session exists.
export async function resolvePostAuthRoute(user) {
  // Admins have no freelancer/client profile, so send them straight to the
  // admin panel instead of the profile checks below.
  const { data: adminRow } = await supabase.from("admins").select("id").eq("id", user.id).maybeSingle();
  if (adminRow) return "/admin";

  // A banned user goes to the appeal page instead of the dashboard: it shows
  // why, lets them appeal once, and has a Sign out button. Suspended users can
  // still log in (the dashboard shows a banner and blocks posting/messaging).
  const suspension = await getActiveSuspension(user.id);
  if (suspensionStatus(suspension) === "banned") return "/appeal";

  const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle();
  if (profile) return dashboardRouteFor(profile.account_type);

  const meta = user.user_metadata || {};
  if (meta.username && meta.gender) {
    // Client is the default role: an account only becomes a freelancer by
    // explicitly choosing it at signup.
    const accountType = meta.account_type === "freelancer" ? "freelancer" : "client";
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: meta.full_name || "",
      username: meta.username,
      gender: meta.gender,
      account_type: accountType
    });
    if (!error) return dashboardRouteFor(accountType);
  }

  return "/complete-profile";
}
