import { supabase } from "./supabaseClient";
import { getFriendlyErrorMessage } from "./errors";
import { getPasswordStrengthMessage } from "./validators";

// Settings > Account Security: how the user signs in, changing their
// password, and signing out their other devices. All of it goes through
// Supabase Auth, which stores passwords hashed (never as plain text); this
// file never keeps or logs a password.

// Reads how the signed-in user signs in. Returns null when nobody is signed in.
//   email: their sign-in email
//   hasPassword: they can sign in with email + password (so there is one to change)
//   withGoogle: they can sign in with Google
//   lastSignIn: when they last signed in (a date in text form, or null)
export async function getSignInInfo() {
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;
  // Supabase lists every way this account can sign in ("email", "google").
  const providers = user.app_metadata?.providers || [user.app_metadata?.provider].filter(Boolean);
  return {
    email: user.email || "",
    hasPassword: providers.includes("email"),
    withGoogle: providers.includes("google"),
    lastSignIn: user.last_sign_in_at || null
  };
}

// Checks the three boxes of the Change password form before anything is sent.
// Returns a message to show, or "" when they're fine. (Supabase checks the
// passwords again; this only answers faster.)
export function checkPasswordChange(current, next, confirm) {
  if (!current) return "Please enter your current password.";
  const weak = getPasswordStrengthMessage(next);
  if (weak) return weak.replace("Password must", "Your new password must");
  if (next !== confirm) return "The two new passwords do not match.";
  if (next === current) return "Your new password must be different from your current one.";
  return "";
}

// Changes the password. The current password is checked first by signing in
// with it again, so someone who finds the account open on a shared computer
// can't change the password without knowing it. Afterwards every other
// device is signed out, in case the old password was known to someone else.
// Returns "" when changed, or a message to show.
export async function changePassword(email, current, next) {
  const { error: wrongPassword } = await supabase.auth.signInWithPassword({ email, password: current });
  if (wrongPassword) {
    const invalid = wrongPassword.code === "invalid_credentials" || /invalid login credentials/i.test(wrongPassword.message || "");
    return invalid ? "Your current password is incorrect." : getFriendlyErrorMessage(wrongPassword);
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return getFriendlyErrorMessage(error);

  // If this part fails the password is still changed, so it isn't an error.
  await supabase.auth.signOut({ scope: "others" });
  return "";
}

// Signs out every other phone, computer and browser this account is open on,
// and keeps this one signed in. Returns "" when done, or a message to show.
export async function signOutOtherDevices() {
  const { error } = await supabase.auth.signOut({ scope: "others" });
  return error ? getFriendlyErrorMessage(error) : "";
}
