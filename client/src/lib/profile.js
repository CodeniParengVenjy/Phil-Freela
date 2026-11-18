import { supabase } from "./supabaseClient";
import { getMyArchive } from "./archives";
import { SUSPENSION_COLUMNS, suspensionStatus } from "./suspensions";

export function dashboardRouteFor(accountType) {
  return accountType === "freelancer" ? "/dashboard-freelancer" : "/dashboard-client";
}

// The role a dashboard address belongs to, or null for any other page
// (Complete Profile, the appeal page, ...).
export function roleOfRoute(route) {
  if (route === "/dashboard-freelancer") return "freelancer";
  if (route === "/dashboard-client") return "client";
  return null;
}

// Freelancer and Client accounts are separate (PLAN-separate-accounts.md).
// The side picked on the Sign In or sign-up page is kept here for a moment
// (this tab only), so it is still known after the trip to Google and on the
// Complete Profile page.
const CHOSEN_ROLE_KEY = "philfreela.chosenRole";

export function rememberChosenRole(role) {
  try {
    if (role === "freelancer" || role === "client") sessionStorage.setItem(CHOSEN_ROLE_KEY, role);
  } catch {
    // Storage can be blocked (private window); the pages still work without it.
  }
}

export function chosenRole() {
  try {
    const role = sessionStorage.getItem(CHOSEN_ROLE_KEY);
    return role === "freelancer" || role === "client" ? role : null;
  } catch {
    return null;
  }
}

export function forgetChosenRole() {
  try {
    sessionStorage.removeItem(CHOSEN_ROLE_KEY);
  } catch {
    // nothing to forget
  }
}

// Returns this user's ban or suspension if it's still in effect, or null.
// Users can only read their own suspension row (database rule).
export async function getActiveSuspension(userId) {
  const { data } = await supabase.from("user_suspensions").select(SUSPENSION_COLUMNS).eq("user_id", userId).maybeSingle();
  return suspensionStatus(data) ? data : null;
}

// The Name policy (the database enforces the same rule: database/
// supabase_name_policy_schema.sql). A name is 2-50 characters, made of letters
// (any language), spaces and . , ' - only, with at least 2 letters. So
// "Juan Dela Cruz" and "Ma. Santos Jr." pass, but "qa123", "a@b.com", links
// and emoji don't.
export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 50;

// Props for a Name or Username box, so Chrome doesn't offer its "Saved info"
// there: the saved name with the email under it, or the email itself (which
// ended up as people's usernames). Chrome ignores autoComplete="off" for those.
// An unknown autoComplete value ("nope") stops it on the sign-up form, but on a
// form with no other autofill settings (Settings, admin pages) Chrome still
// guesses from the box's id, so it also gets a `name` that hints at nothing.
// `key` is any short label, different for each box in a form, that isn't a
// word like "name" or "user" (tested in Chrome 155 with its Autofill commands).
export const noAutofill = (key) => ({ autoComplete: "nope", name: `pf-${key}` });

const NAME_PATTERN = /^\p{L}[\p{L} .,'’-]*$/u;
// "www.site.com" is only letters and dots, so links get their own check.
const LINK_PATTERN = /(www\.|https?:|\.(com|net|org|ph|info|xyz|app|dev)\b)/i;

// Tidies a name before it is checked or saved: joins accented letters typed in
// two pieces into one, turns any run of spaces into one space, trims the ends.
export function cleanName(name) {
  return String(name ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

// Returns "" when the name is fine, or the sentence to show the person.
// Sign-up, Complete Profile and Settings all use this one function.
export function checkName(name) {
  const clean = cleanName(name);
  if (!clean) return "Please enter your name.";
  if (clean.length > MAX_NAME_LENGTH) return `Your name can't be longer than ${MAX_NAME_LENGTH} characters.`;
  if (!NAME_PATTERN.test(clean) || LINK_PATTERN.test(clean)) return "Use letters only: no numbers, emoji, links or symbols. You can use spaces and . , ' -";
  if ((clean.match(/\p{L}/gu) || []).length < MIN_NAME_LENGTH) return `Your name needs at least ${MIN_NAME_LENGTH} letters.`;
  return "";
}

// How long someone must wait between changes (supabase_name_cooldown_schema.sql
// enforces the same numbers in the database).
export const NAME_COOLDOWN_DAYS = 7;
export const USERNAME_COOLDOWN_DAYS = 30;

// When a change is allowed again, as a Date, or null if it already is.
// changedAt is the saved time of the last change (null = never changed).
export function cooldownEnds(changedAt, days) {
  if (!changedAt) return null;
  const ends = new Date(new Date(changedAt).getTime() + days * 24 * 60 * 60 * 1000);
  return ends > new Date() ? ends : null;
}

// When this user last changed their name and username (null = never). Users
// can read their own profile, so this only ever shows their own dates.
export async function fetchNameChangeDates(userId) {
  const { data } = await supabase.from("profiles").select("name_changed_at, username_changed_at").eq("id", userId).maybeSingle();
  return { nameChangedAt: data?.name_changed_at ?? null, usernameChangedAt: data?.username_changed_at ?? null };
}

// The database's own "You can change your name again on ..." message, if
// that is what stopped the save.
const cooldownMessage = (error) => (error?.message?.startsWith("You can change your") ? error.message : "");

// The database's own "Please don't use bad words in your name/username." (the
// word filter, database/supabase_word_filter_schema.sql), if that is what
// stopped the save.
const badWordMessage = (error) => (/bad words in your/i.test(error?.message || "") ? error.message : "");

// Asks the database, before an account is made, whether a name or username holds
// a blocked word. It only answers yes or no (the list stays in the database).
// Returns null when both are fine, or { field, text } for the box to blame.
// If it can't be asked, it says fine: the database refuses the name later anyway.
export async function checkNameWords(fullName, username) {
  const { data, error } = await supabase.rpc("bad_word_in_name", { full_name: cleanName(fullName), username: String(username ?? "").trim() });
  if (error) return null;
  if (data === "name") return { field: "fullName", text: "Please don't use bad words in your name." };
  if (data === "username") return { field: "username", text: "Please don't use bad words in your username." };
  return null;
}

// Saves a new name (Settings > Name). It goes into
// profiles.full_name, the name other people see in chat, jobs and services,
// and into the login's user_metadata, the copy the emails use ("Reset your
// password, Venj"). Returns "" when saved, or a message to show the user.
// The database allows a change every 7 days.
export async function saveDisplayName(userId, name) {
  const problem = checkName(name);
  if (problem) return problem;
  const fullName = cleanName(name);

  // .select("id") returns the updated row, so an empty result means nothing was saved.
  const { data, error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId).select("id");
  if (cooldownMessage(error)) return cooldownMessage(error);
  if (badWordMessage(error)) return badWordMessage(error);
  if (error || !data?.length) return "Couldn't save your name. Please try again.";

  // The dashboard reads the name from profiles, so if only this second copy
  // fails, the new name still shows everywhere; it isn't treated as an error.
  await supabase.auth.updateUser({ data: { full_name: fullName } });
  return "";
}

// Longest username allowed (profiles.username is varchar(60)).
export const MAX_USERNAME_LENGTH = 60;

// Saves a new username (Settings > Username), here and in the login's saved
// copy. The database allows a change every 30 days and keeps usernames unique.
// Returns "" when saved, or a message to show the user.
export async function saveUsername(userId, name) {
  const username = name.trim();
  if (!username) return "Please choose a username.";
  if (username.length > MAX_USERNAME_LENGTH) return `Your username can't be longer than ${MAX_USERNAME_LENGTH} characters.`;

  const { data, error } = await supabase.from("profiles").update({ username }).eq("id", userId).select("id");
  // 23505 = the database's "username is unique" rule.
  if (error?.code === "23505") return "That username is already taken.";
  if (cooldownMessage(error)) return cooldownMessage(error);
  if (badWordMessage(error)) return badWordMessage(error);
  if (error || !data?.length) return "Couldn't save your username. Please try again.";

  await supabase.auth.updateUser({ data: { username } });
  return "";
}

// Longest profile description allowed -- the same limit as the database rule
// (supabase_profile_description_schema.sql).
export const MAX_DESCRIPTION_LENGTH = 1000;

// Reads a user's description ("" when they haven't written one, null when it
// couldn't be loaded). Any signed-in user can read it, so this also works for
// someone else's profile.
export async function fetchDescription(userId) {
  const { data, error } = await supabase.from("profiles").select("description").eq("id", userId).maybeSingle();
  if (error) return null;
  return data?.description ?? "";
}

// Saves the description (Settings > Description). An empty one is allowed and
// just clears it. Returns "" when saved, or a message to show the user.
export async function saveDescription(userId, text) {
  const description = text.trim();
  if (description.length > MAX_DESCRIPTION_LENGTH) return `Your description can't be longer than ${MAX_DESCRIPTION_LENGTH} characters.`;

  const { data, error } = await supabase.from("profiles").update({ description }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save your description. Please try again.";
  return "";
}

// A freelancer's skills (Profile > Skills), shown as chips on their Profile and
// on their public page. The database allows up to 10 skills, each 1 to 40
// characters (the same rule as a job post's required skills).
export const MAX_SKILLS = 10;
export const MAX_SKILL_LENGTH = 40;

// The user's saved skills, or null when they couldn't be loaded.
export async function fetchSkills(userId) {
  const { data, error } = await supabase.from("profiles").select("skills").eq("id", userId).maybeSingle();
  if (error) return null;
  return data?.skills ?? [];
}

// Saves the whole list of skills. Returns "" when saved, or a message to show.
export async function saveSkills(userId, skills) {
  if (skills.length > MAX_SKILLS) return `You can add up to ${MAX_SKILLS} skills.`;
  const { data, error } = await supabase.from("profiles").update({ skills }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save your skills. Please try again.";
  return "";
}

// Adds typed text (one skill, or several split by commas) to a list of skills,
// skipping blanks and repeats (capital letters don't count as different) and
// stopping at the most allowed. Returns the new list.
export function addSkillsFromText(current, text) {
  const next = [...current];
  for (const part of text.split(",")) {
    const skill = part.trim().slice(0, MAX_SKILL_LENGTH).trim();
    const isRepeat = next.some((s) => s.toLowerCase() === skill.toLowerCase());
    if (skill && !isRepeat && next.length < MAX_SKILLS) next.push(skill);
  }
  return next;
}

// A freelancer's portfolio links (panel revision, PLAN-panel-revisions.md,
// item 6): up to 3 links to work kept on other sites (Behance, GitHub, Google
// Drive, their own website...). The database has the same rule
// (supabase_portfolio_links_schema.sql): at most 3, each an https:// address
// of at most 200 characters. Only https, so a link can never run code on the
// page (a "javascript:" link) and always opens over a secure connection.
export const MAX_PORTFOLIO_LINKS = 3;
export const MAX_LINK_LENGTH = 200;
const PORTFOLIO_LINK_PATTERN = /^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d{1,5})?(\/[^\s<>"]*)?$/;

// Turns what was typed into a link, or returns { error }. "behance.net/juan"
// becomes "https://behance.net/juan"; an http:// link is refused (not secure).
export function cleanPortfolioLink(text) {
  let link = text.trim();
  if (!link) return { error: "Paste a link first." };
  if (/^http:\/\//i.test(link)) return { error: "Use a secure link: it must start with https://" };
  if (!/^https:\/\//i.test(link)) link = `https://${link}`;
  link = link.replace(/^https:\/\//i, "https://");
  if (link.length > MAX_LINK_LENGTH) return { error: `A link can be at most ${MAX_LINK_LENGTH} characters.` };
  if (!PORTFOLIO_LINK_PATTERN.test(link)) return { error: "That doesn't look like a web address, e.g. https://behance.net/yourname" };
  return { link };
}

// True only for a link the page may open (the same rule as above).
export function isSafeLink(link) {
  return typeof link === "string" && PORTFOLIO_LINK_PATTERN.test(link);
}

// A short name for a link ("behance.net/juan") and an icon for its site.
export function linkLabel(link) {
  const short = link.replace(/^https:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return short.length > 40 ? `${short.slice(0, 39)}…` : short;
}

const SITE_ICONS = [
  ["behance.net", "bi-behance"],
  ["github.com", "bi-github"],
  ["drive.google.com", "bi-google"],
  ["docs.google.com", "bi-google"],
  ["dribbble.com", "bi-dribbble"],
  ["linkedin.com", "bi-linkedin"],
  ["youtube.com", "bi-youtube"],
  ["youtu.be", "bi-youtube"],
  ["vimeo.com", "bi-vimeo"],
  ["instagram.com", "bi-instagram"],
  ["facebook.com", "bi-facebook"]
];

export function linkIcon(link) {
  const host = link.replace(/^https:\/\//i, "").split(/[/:?#]/)[0].toLowerCase();
  const found = SITE_ICONS.find(([site]) => host === site || host.endsWith(`.${site}`));
  return found ? found[1] : "bi-link-45deg";
}

// Verified owner badge (PLAN-site-verification.md): a freelancer proves a link
// is their own website by putting their PhilFreela code on it; the AI service
// visits the page and saves the date it found the code (site_check.py). The
// badge lasts 90 days. Pages on shared sites belong to the site, so nobody can
// add a code to them: those stay plain links (same list as SHARED_SITES in
// ai-service/site_check.py).
export const VERIFY_DAYS = 90;
const SHARED_SITES = [
  "behance.net", "github.com", "dribbble.com", "linkedin.com", "youtube.com", "youtu.be",
  "vimeo.com", "instagram.com", "facebook.com", "tiktok.com", "x.com", "twitter.com",
  "drive.google.com", "docs.google.com", "sites.google.com", "canva.com", "figma.com"
];

// True for a link to the freelancer's own website (juan.dev, juan.github.io...),
// false for a page on a shared site (github.com/juan, behance.net/juan...).
export function canVerifyLink(link) {
  const host = link.replace(/^https:\/\//i, "").split(/[/:?#]/)[0].toLowerCase();
  return !SHARED_SITES.some((site) => host === site || host.endsWith(`.${site}`));
}

// True when the badge is still good: verified in the last 90 days.
export function isFreshlyVerified(verifiedAt) {
  if (!verifiedAt) return false;
  return Date.now() - new Date(verifiedAt).getTime() < VERIFY_DAYS * 24 * 60 * 60 * 1000;
}

// "Nov 15, 2026"
export function verifiedDateText(verifiedAt) {
  return new Date(verifiedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// The freelancer's own codes and dates, as { [link]: { code, verified_at } }
// (the database lets each person read only their own rows). {} when they
// couldn't be loaded, so the box still works without the badges.
export async function fetchSiteVerifications(userId) {
  const { data, error } = await supabase.from("site_verifications").select("link, code, verified_at").eq("freelancer_id", userId);
  if (error || !data) return {};
  return Object.fromEntries(data.map((row) => [row.link, { code: row.code, verified_at: row.verified_at }]));
}

// Someone's links that are verified right now (last 90 days, still in their
// Portfolio Links), as { [link]: verified_at }. Never the codes. {} on errors.
export async function fetchVerifiedLinks(userId) {
  const { data, error } = await supabase.rpc("verified_portfolio_links", { p_user: userId });
  if (error || !data) return {};
  return Object.fromEntries(data.map((row) => [row.link, row.verified_at]));
}

// The user's saved links, or null when they couldn't be loaded.
export async function fetchPortfolioLinks(userId) {
  const { data, error } = await supabase.from("profiles").select("portfolio_links").eq("id", userId).maybeSingle();
  if (error) return null;
  return data?.portfolio_links ?? [];
}

// Saves the whole list. Returns "" when saved, or a message to show.
export async function savePortfolioLinks(userId, links) {
  if (links.length > MAX_PORTFOLIO_LINKS) return `You can add up to ${MAX_PORTFOLIO_LINKS} links.`;
  const { data, error } = await supabase.from("profiles").update({ portfolio_links: links }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save your links. Please try again.";
  return "";
}

// The "People" section of the Search page: the people whose name or @username
// contains the typed text (at most 20, names that start with it first). The
// database function leaves out yourself and anyone banned or suspended (see
// database/supabase_people_search_schema.sql). Each row has id, full_name,
// username, account_type and avatar_path. Returns the list, or null when it
// couldn't be loaded.
export async function searchPeople(text) {
  const { data, error } = await supabase.rpc("search_people", { search: text });
  if (error) return null;
  return data;
}

// Settings > Privacy & Notifications > "Email me when I'm offline". When on,
// the database emails the user about new messages, missed calls, job
// applications and account news that arrive while they're away
// (supabase_email_notifications_schema.sql). Returns true/false, or null when
// it couldn't be loaded.
export async function fetchEmailWhenOffline(userId) {
  const { data, error } = await supabase.from("profiles").select("email_when_offline").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return data.email_when_offline;
}

// Returns "" when saved, or a message to show the user.
export async function saveEmailWhenOffline(userId, on) {
  const { data, error } = await supabase.from("profiles").update({ email_when_offline: on }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save that setting. Please try again.";
  return "";
}

// The kinds of offline email a user can turn off one by one (Settings >
// Privacy & Notifications). The values are the ones the database checks
// (database/supabase_email_choices_schema.sql), so do not rename them.
// clientsOnly: only clients get this kind (a job application goes to the
// client who posted the job), so freelancers aren't shown the choice.
export const EMAIL_KINDS = [
  { value: "chat", label: "New messages" },
  { value: "call", label: "Missed calls" },
  { value: "job", label: "Job applications", clientsOnly: true },
  { value: "account", label: "Account notifications (bookings, identity verification, suspensions)" }
];

// The kinds this user turned OFF ([] = every kind is on), or null when it
// couldn't be loaded.
export async function fetchEmailMuted(userId) {
  const { data, error } = await supabase.from("profiles").select("email_muted").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return data.email_muted || [];
}

// Saves the kinds that are off. Anything that isn't one of EMAIL_KINDS is left
// out (the database would refuse it). Returns "" when saved, or a message to
// show the user.
export async function saveEmailMuted(userId, muted) {
  const known = EMAIL_KINDS.map((kind) => kind.value).filter((value) => muted.includes(value));
  const { data, error } = await supabase.from("profiles").update({ email_muted: known }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save that setting. Please try again.";
  return "";
}

// Settings > Profile Settings > "Available for work" (freelancers). While it
// is off, the freelancer's profile and service cards say "Not available right
// now" and the database refuses new bookings for them
// (database/supabase_availability_schema.sql). Returns true/false, or null
// when it couldn't be loaded.
export async function fetchAvailableForWork(userId) {
  const { data, error } = await supabase.from("profiles").select("available_for_work").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return data.available_for_work;
}

// Returns "" when saved, or a message to show the user.
export async function saveAvailableForWork(userId, available) {
  const { data, error } = await supabase.from("profiles").update({ available_for_work: available }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save that setting. Please try again.";
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

  // An archived account (an admin archived it) can't use anything: it goes to
  // the "archived" page, which says so and has a Sign out button.
  if (await getMyArchive(user.id)) return "/archived";

  // A banned user goes to the appeal page instead of the dashboard: it shows
  // why, lets them appeal once, and has a Sign out button. Suspended users can
  // still log in (the dashboard shows a banner and blocks posting/messaging).
  const suspension = await getActiveSuspension(user.id);
  if (suspensionStatus(suspension) === "banned") return "/appeal";

  const { data: profile } = await supabase.from("profiles").select("account_type").eq("id", user.id).maybeSingle();
  if (profile) return dashboardRouteFor(profile.account_type);

  const meta = user.user_metadata || {};
  // A missing or invalid name never makes a profile: they finish it on the
  // Complete Profile page instead.
  if (meta.username && meta.gender && !checkName(meta.full_name)) {
    // Client is the default role: an account only becomes a freelancer by
    // explicitly choosing it at signup.
    const accountType = meta.account_type === "freelancer" ? "freelancer" : "client";
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: cleanName(meta.full_name),
      username: meta.username,
      gender: meta.gender,
      account_type: accountType
    });
    if (!error) return dashboardRouteFor(accountType);
  }

  return "/complete-profile";
}
