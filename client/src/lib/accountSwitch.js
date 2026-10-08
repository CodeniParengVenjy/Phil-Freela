import { supabase, supabaseSignup } from "./supabaseClient";
import { getFriendlyErrorMessage } from "./errors";
import { resolvePostAuthRoute } from "./profile";

// Switching between an admin's login and their own user login
// (database/supabase_admin_switch_schema.sql). The two logins are linked in the
// database, and only a linked account is ever offered the switch.
//
// How the switch itself works: this browser keeps the OTHER account's sign-in
// (its two tokens) in local storage, next to where the current one already
// lives. Switching swaps the two and opens the right dashboard. Nothing but the
// tokens is stored, never a password. A new browser has nothing stored yet, so
// the other account's password is asked once there.

const SLOT_KEY = "philfreela-other-account";

// Who this login is linked to, or null. For an admin: { side: "admin", other_id,
// other_name, other_username } is their user account. For a user account:
// { side: "user", ... } is the admin.
export async function fetchMyLink() {
  const { data, error } = await supabase.rpc("my_link");
  if (error || !data?.length) return null;
  return data[0];
}

// The stored sign-in of the other account: { forUser, access_token, refresh_token } or null.
function readSlot() {
  try {
    const slot = JSON.parse(localStorage.getItem(SLOT_KEY) || "null");
    return slot?.forUser && slot.access_token && slot.refresh_token ? slot : null;
  } catch {
    return null;
  }
}

function writeSlot(forUser, session) {
  try {
    localStorage.setItem(SLOT_KEY, JSON.stringify({ forUser, access_token: session.access_token, refresh_token: session.refresh_token }));
  } catch {
    // Storage blocked: the switch will simply ask for the password again.
  }
}

export function clearSlot() {
  try {
    localStorage.removeItem(SLOT_KEY);
  } catch {
    // nothing stored, nothing to clear
  }
}

// Signs in to the other account on the second, in-memory connection (so the
// current sign-in is untouched). Returns { session, userId } or { error }.
async function signInOther(email, password) {
  const { data, error } = await supabaseSignup.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) {
    const invalid = error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message || "");
    return { error: invalid ? "Incorrect email or password for that account." : getFriendlyErrorMessage(error) };
  }
  return { session: data.session, userId: data.user.id };
}

// Admin side, first time: links this admin to their own user account. Needs that
// account's email and password once. The database checks both logins with a
// one-time code. Returns "" when linked, or a message to show.
export async function linkUserAccount(email, password) {
  const { data: code, error: codeError } = await supabase.rpc("make_admin_link_code");
  if (codeError) return codeError.message || "Couldn't start linking. Please try again.";

  const other = await signInOther(email, password);
  if (other.error) return other.error;

  // Signed in as the user account on the second connection, hand the code back.
  const { error: claimError } = await supabaseSignup.rpc("claim_admin_link", { code });
  if (claimError) return claimError.message || "Couldn't link that account. Please try again.";

  writeSlot(other.userId, other.session);
  return "";
}

// Either side: this browser doesn't have the other account's sign-in (a new
// browser, or it ran out). Asks for that account's email and password once and
// stores it. The account must be the one this login is linked to. Returns ""
// when done, or a message to show.
export async function rememberOtherAccount(link, email, password) {
  const other = await signInOther(email, password);
  if (other.error) return other.error;
  if (other.userId !== link.other_id) return "That is not the account linked to this one.";
  writeSlot(other.userId, other.session);
  return "";
}

// Swaps to the other account and opens its dashboard. Returns { needsPassword: true }
// when this browser can't do it yet, or { error } on a problem. On success the
// page changes and nothing is returned.
export async function switchToOtherAccount(link) {
  const slot = readSlot();
  if (!slot || slot.forUser !== link.other_id) return { needsPassword: true };

  const { data: { session: current } } = await supabase.auth.getSession();
  if (!current) return { error: "You are signed out. Please sign in again." };

  // The current account goes into the slot, so switching again comes back.
  const next = await supabase.auth.setSession({ access_token: slot.access_token, refresh_token: slot.refresh_token });
  if (next.error || next.data.session?.user?.id !== link.other_id) {
    // The stored sign-in no longer works. Put this account's own sign-in back
    // (a failed swap can leave the page signed out) and ask for the password.
    await supabase.auth.setSession({ access_token: current.access_token, refresh_token: current.refresh_token });
    clearSlot();
    return { needsPassword: true };
  }

  writeSlot(current.user.id, current);
  const destination = await resolvePostAuthRoute(next.data.session.user);
  // A full page load, so nothing from the first account stays on the screen.
  window.location.assign(destination);
  return { ok: true };
}

// Undoes the link (either side) and forgets the stored sign-in. Returns "" when
// done, or a message to show.
export async function unlinkAccounts() {
  const { error } = await supabase.rpc("unlink_my_account");
  if (error) return error.message || "Couldn't unlink. Please try again.";
  clearSlot();
  return "";
}
