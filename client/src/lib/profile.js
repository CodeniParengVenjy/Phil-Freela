import { supabase } from "./supabaseClient";

export function dashboardRouteFor(accountType) {
  return accountType === "freelancer" ? "/dashboard-freelancer" : "/dashboard-client";
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
