import { OTHER_ACCOUNT_KEY, activeStorage, supabase, supabaseSignup } from "./supabaseClient";
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
//
// It is kept where the sign-in itself is kept: with "Remember me" off that is
// this tab only, and signing out removes it (see supabaseClient.js).

const SLOT_KEY = OTHER_ACCOUNT_KEY;

// Every account this login can switch to (database my_links(),
// PLAN-separate-accounts.md Step 9). For an admin: their linked user account
// ({ side: "admin", other_id, other_name, other_username, other_role:
// "freelancer" | "client", direct: true }) and, since Freelancer and Client
// accounts were separated, its partner on the other side (direct: false).
// For a user account (either of the pair): the admin ({ side: "user",
// other_role: "admin" }). The directly linked one comes first.
export async function fetchMyLinks() {
  const { data, error } = await supabase.rpc("my_links");
  if (error || !data?.length) return [];
  return data;
}

// The first of them, or null (the pages that only need one).
export async function fetchMyLink() {
  return (await fetchMyLinks())[0] ?? null;
}

// The stored sign-ins of the other accounts: { [userId]: { access_token, refresh_token } }.
// (Before Step 9 only one was kept: { forUser, access_token, refresh_token }; it is read the same way.)
function readSlots() {
  try {
    const saved = JSON.parse(activeStorage().getItem(SLOT_KEY) || "null");
    if (saved?.forUser) return { [saved.forUser]: { access_token: saved.access_token, refresh_token: saved.refresh_token } };
    return saved?.accounts && typeof saved.accounts === "object" ? saved.accounts : {};
  } catch {
    return {};
  }
}

function saveSlots(accounts) {
  try {
    activeStorage().setItem(SLOT_KEY, JSON.stringify({ accounts }));
  } catch {
    // Storage blocked: the switch will simply ask for the password again.
  }
}

// One account's stored sign-in, or null.
function readSlot(userId) {
  const slot = readSlots()[userId];
  return slot?.access_token && slot.refresh_token ? slot : null;
}

function writeSlot(userId, session) {
  saveSlots({ ...readSlots(), [userId]: { access_token: session.access_token, refresh_token: session.refresh_token } });
}

function removeSlot(userId) {
  const accounts = readSlots();
  delete accounts[userId];
  saveSlots(accounts);
}

export function clearSlot() {
  try {
    localStorage.removeItem(SLOT_KEY);
    sessionStorage.removeItem(SLOT_KEY);
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
// siblings = the other accounts in the same list (Step 9). A separated
// Freelancer + Client pair shares one password, so the email of EITHER of them
// works here, and the sibling's sign-in is saved too: one password, both stored.
export async function rememberOtherAccount(link, email, password, siblings = []) {
  let other = await signInOther(email, password);
  if (other.error) return other.error;
  if (other.userId !== link.other_id && link.other_role !== "admin") {
    // They typed the partner's email: open the partner of THAT account on the
    // wanted side, with the same password (database my_linked_account).
    const { data: partnerEmail } = await supabaseSignup.rpc("my_linked_account", { p_side: link.other_role });
    if (partnerEmail) other = await signInOther(partnerEmail, password);
    if (other.error) return other.error;
  }
  if (other.userId !== link.other_id) return "That is not the account linked to this one.";
  writeSlot(other.userId, other.session);

  // Also save the sibling (the other side of the same person), when the password fits.
  for (const sibling of siblings) {
    if (sibling.other_id === link.other_id || sibling.other_role === "admin" || readSlot(sibling.other_id)) continue;
    const { data: siblingEmail } = await supabaseSignup.rpc("my_linked_account", { p_side: sibling.other_role });
    if (!siblingEmail) continue;
    const extra = await signInOther(siblingEmail, password);
    if (!extra.error && extra.userId === sibling.other_id) writeSlot(extra.userId, extra.session);
  }
  return "";
}

// Swaps to the other account and opens its dashboard. Returns { needsPassword: true }
// when this browser can't do it yet, or { error } on a problem. On success the
// page changes and nothing is returned.
export async function switchToOtherAccount(link) {
  const slot = readSlot(link.other_id);
  if (!slot) return { needsPassword: true };

  const { data: { session: current } } = await supabase.auth.getSession();
  if (!current) return { error: "You are signed out. Please sign in again." };

  // The current account goes into the stored list, so switching again comes back.
  const next = await supabase.auth.setSession({ access_token: slot.access_token, refresh_token: slot.refresh_token });
  if (next.error || next.data.session?.user?.id !== link.other_id) {
    // The stored sign-in no longer works. Put this account's own sign-in back
    // (a failed swap can leave the page signed out) and ask for the password.
    await supabase.auth.setSession({ access_token: current.access_token, refresh_token: current.refresh_token });
    removeSlot(link.other_id);
    return { needsPassword: true };
  }

  // The account now open lives in the normal sign-in; its old copy is dropped.
  removeSlot(link.other_id);
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
