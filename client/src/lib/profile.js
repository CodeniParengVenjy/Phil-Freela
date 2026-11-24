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

// Longest username allowed (profiles.username is varchar(60)). The database
// allows a username change every 30 days and keeps usernames unique.
export const MAX_USERNAME_LENGTH = 60;

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

// Saves Settings > Profile Settings (name, username, description) in ONE trip to
// the database. It used to be three updates, two login updates and a re-read, one
// after the other (about 5 seconds, 2 of them in the bad-word check), and any
// failure on the way left the Save button spinning for good.
//   shown = what the boxes say now, saved = what is stored now.
// Only a box that changed is sent (an empty description may be saved: it clears
// it). It is all-or-nothing: if the username is taken, the name isn't saved either.
// Returns { problem } ("" = saved, or a sentence to show the person). When saved it
// also holds `values` (what is stored now) and `dates` (when the name and username
// last changed, the database sets them), so the page needs no second trip.
export async function saveProfileSettings(userId, shown, saved) {
  const changes = {};

  const name = cleanName(shown.name);
  if (name !== cleanName(saved.name)) {
    const problem = checkName(name);
    if (problem) return { problem };
    changes.full_name = name;
  }

  const username = String(shown.username ?? "").trim();
  if (username !== String(saved.username ?? "").trim()) {
    if (!username) return { problem: "Please choose a username." };
    if (username.length > MAX_USERNAME_LENGTH) return { problem: `Your username can't be longer than ${MAX_USERNAME_LENGTH} characters.` };
    changes.username = username;
  }

  const description = String(shown.description ?? "").trim();
  if (description !== String(saved.description ?? "").trim()) {
    if (description.length > MAX_DESCRIPTION_LENGTH) return { problem: `Your description can't be longer than ${MAX_DESCRIPTION_LENGTH} characters.` };
    changes.description = description;
  }

  const values = { name, username, description };
  // Nothing changed, so there is nothing to send.
  if (!Object.keys(changes).length) return { problem: "", values, dates: null };

  // .select() returns the saved row (after the database's own rules ran), so an
  // empty answer means nothing was saved, and it carries the new change dates.
  const { data, error } = await supabase.from("profiles").update(changes).eq("id", userId).select("id, name_changed_at, username_changed_at");
  // 23505 = the database's "username is unique" rule.
  if (error?.code === "23505") return { problem: "That username is already taken." };
  if (cooldownMessage(error)) return { problem: cooldownMessage(error) };
  if (badWordMessage(error)) return { problem: badWordMessage(error) };
  if (error || !data?.length) return { problem: "Couldn't save your changes. Please try again." };

  // The login keeps its own copy of the name and username (the emails greet people
  // with it). The dashboard reads profiles, so nobody has to wait for this copy,
  // and if it fails nothing shows wrong: it is sent in the background, in one go.
  const copy = {};
  if (changes.full_name) copy.full_name = changes.full_name;
  if (changes.username) copy.username = changes.username;
  if (Object.keys(copy).length) supabase.auth.updateUser({ data: copy }).catch(() => {});

  return { problem: "", values, dates: { nameChangedAt: data[0].name_changed_at ?? null, usernameChangedAt: data[0].username_changed_at ?? null } };
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
// item 6): links to work kept on other sites (Behance, GitHub, Google
// Drive, their own website...). Since 2026-11-20 (PLAN-portfolio-links-merge.md)
// there is no limit shown: 50 is a quiet ceiling so one profile can't be stuffed
// with thousands. The database has the same rule
// (supabase_portfolio_links_no_limit.sql): at most 50, each an https:// address
// of at most 200 characters. Only https, so a link can never run code on the
// page (a "javascript:" link) and always opens over a secure connection.
export const MAX_PORTFOLIO_LINKS = 50;
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
  ["facebook.com", "bi-facebook"],
  ["tiktok.com", "bi-tiktok"],
  ["x.com", "bi-twitter-x"],
  ["twitter.com", "bi-twitter-x"]
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
  if (links.length > MAX_PORTFOLIO_LINKS) return `A profile can hold up to ${MAX_PORTFOLIO_LINKS} links.`;
  const { data, error } = await supabase.from("profiles").update({ portfolio_links: links }).eq("id", userId).select("id");
  if (error || !data?.length) return "Couldn't save your links. Please try again.";
  return "";
}

// A person's social accounts (PLAN-social-accounts.md): their Facebook, Instagram, TikTok, YouTube, LinkedIn, GitHub, X
// and Threads pages, for freelancers and clients. They are saved on the profile as { platform: link }
// (profiles.social_links), so each platform is there once. The database has the same rule
// (supabase_social_links_schema.sql): https only, at most 200 characters, and the link must be on that platform's
// own website, so a "TikTok" entry can never point anywhere else.
//   key: the name saved in the database (don't rename it); domains: the platform's own websites (the same list is in
//   the SQL file); nameOk: what a plain @username may look like; makeLink: the page address for a username.
const SOCIAL_LIST = [
  { key: "facebook", label: "Facebook", icon: "bi-facebook", domains: ["facebook.com", "fb.com", "fb.me"], nameOk: /^[A-Za-z0-9.]{5,50}$/, makeLink: (name) => `https://www.facebook.com/${name}` },
  { key: "instagram", label: "Instagram", icon: "bi-instagram", domains: ["instagram.com"], nameOk: /^[A-Za-z0-9._]{1,30}$/, makeLink: (name) => `https://www.instagram.com/${name}` },
  { key: "tiktok", label: "TikTok", icon: "bi-tiktok", domains: ["tiktok.com"], nameOk: /^[A-Za-z0-9._]{2,24}$/, makeLink: (name) => `https://www.tiktok.com/@${name}` },
  { key: "youtube", label: "YouTube", icon: "bi-youtube", domains: ["youtube.com"], nameOk: /^[A-Za-z0-9._-]{3,30}$/, makeLink: (name) => `https://www.youtube.com/@${name}` },
  { key: "linkedin", label: "LinkedIn", icon: "bi-linkedin", domains: ["linkedin.com"], nameOk: /^[A-Za-z0-9-]{3,100}$/, makeLink: (name) => `https://www.linkedin.com/in/${name}` },
  { key: "github", label: "GitHub", icon: "bi-github", domains: ["github.com"], nameOk: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/, makeLink: (name) => `https://github.com/${name}` },
  { key: "x", label: "X", icon: "bi-twitter-x", domains: ["x.com", "twitter.com"], nameOk: /^[A-Za-z0-9_]{1,15}$/, makeLink: (name) => `https://x.com/${name}` },
  { key: "threads", label: "Threads", icon: "bi-threads", domains: ["threads.net", "threads.com"], nameOk: /^[A-Za-z0-9._]{1,30}$/, makeLink: (name) => `https://www.threads.com/@${name}` }
  // Pinterest was here until 2026-11-24 (the user: "remove pinterest"). The database rule still accepts a
  // "pinterest" link, but the site no longer offers or shows one, and the next save drops it (saveSocialLinks).
];

// The same list (in this order everywhere), each with the pattern a saved link must match: https://, the
// platform's own site (or a sub-domain like www. or m.), then the page name and nothing after it, no ?query and no
// #part (Facebook's profile.php?id=123 is the one exception). The database checks the same pattern.
export const SOCIAL_PLATFORMS = SOCIAL_LIST.map((platform) => {
  const sites = platform.domains.map((domain) => domain.replace(/\./g, "\\.")).join("|");
  const pattern = new RegExp(`^https://([a-z0-9-]+\\.)*(${sites})/[^\\s<>"?#/][^\\s<>"?#]*(\\?id=\\d+)?$`, "i");
  return { ...platform, pattern };
});

// True only for a saved link the page may open: right platform, right website, right shape.
export function isSafeSocialLink(key, link) {
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key);
  return Boolean(platform) && typeof link === "string" && link.length <= MAX_LINK_LENGTH && platform.pattern.test(link);
}

// Wrong links (2026-11-24, the user: "also build the not correct link like that"): a link on the right platform that
// opens a post, a video, a group or one of the platform's own pages instead of an account. For each platform:
//   kinds: the first part of the address that means "not an account", and what it is ("p" on Instagram = a post)
//   own:   the platform's own pages (login, settings, explore...)
//   account(parts): where the account is in the other links: the parts to keep ("@juan" from
//                   tiktok.com/@juan/video/123), null when the link is fine as it is, or "hint" when it can't be an
//                   account link at all (tiktok.com/juan has no @).
// Share links from the phone apps (facebook.com/share/..., vt.tiktok.com/...) are kept: they often open a profile.
const keepFirst = (parts) => (parts.length > 1 ? parts.slice(0, 1) : null);
const keepTwo = (parts) => (parts.length > 2 ? parts.slice(0, 2) : parts.length === 2 ? null : "hint");
const ACCOUNT_PARTS = {
  facebook: {
    kinds: { groups: "group", photo: "photo", "photo.php": "photo", photos: "photo", media: "photo album", watch: "video", video: "video", videos: "video", "video.php": "video", reel: "reel", reels: "reel", events: "event", posts: "post", "story.php": "post", "permalink.php": "post", stories: "story", marketplace: "Marketplace page", hashtag: "hashtag", live: "live video" },
    own: ["login", "login.php", "home.php", "help", "settings", "notifications", "messages", "friends", "search", "privacy", "policies", "policy.php", "ads", "bookmarks", "saved", "memories", "recover", "reg", "r.php", "dialog", "sharer", "sharer.php", "l.php", "plugins", "legal", "terms", "terms.php", "business", "checkpoint", "gaming"],
    account: (parts, first) => {
      if (first === "profile.php") return null;
      if (first === "people") return parts.length > 3 ? parts.slice(0, 3) : null; // people/Juan-Dela-Cruz/<number>
      if (first === "pages") return parts.length > 3 ? parts.slice(0, 3) : null;
      if (first === "p") return parts.length > 2 ? parts.slice(0, 2) : null; // p/Juan-Dela-Cruz-1000.../ (a newer page link)
      if (first === "share") {
        // share/1AbC (a profile or page from the app) is fine; share/p, /v, /r and /g are a post, video, reel, group.
        const shared = { p: "post", v: "video", r: "reel", g: "group" }[(parts[1] || "").toLowerCase()];
        return shared ? { what: shared } : null;
      }
      return keepFirst(parts); // juan.dc/posts/123 -> juan.dc
    }
  },
  instagram: {
    kinds: { p: "post", reel: "reel", reels: "reel", tv: "video" },
    own: ["explore", "accounts", "direct", "about", "legal", "developer", "web", "challenge", "emails", "session", "privacy", "terms", "ar", "lite", "create", "oauth", "press", "api", "directory", "topics"],
    account: (parts, first) => {
      if (first === "stories") {
        if (!parts[1] || parts[1].toLowerCase() === "highlights") return { what: "story" };
        return parts.slice(1, 2); // stories/juan/123 -> juan
      }
      return keepFirst(parts); // juan/reels -> juan
    }
  },
  tiktok: {
    kinds: { video: "video", v: "video", embed: "video", photo: "photo", tag: "hashtag", music: "sound", live: "live video" },
    own: ["discover", "explore", "foryou", "following", "friends", "search", "login", "signup", "upload", "messages", "inbox", "setting", "settings", "business", "legal", "about", "coins", "feedback", "creators", "privacy", "terms"],
    account: (parts, first, host) => {
      if (/^(vt|vm)\./i.test(host) || first === "t") return null; // a share link from the app
      if (first.startsWith("@")) return keepFirst(parts); // @juan/video/123 -> @juan
      return "hint"; // a TikTok account link always has an @
    }
  },
  youtube: {
    kinds: { watch: "video", embed: "video", v: "video", live: "live video", shorts: "Short", playlist: "playlist", results: "search", post: "post", hashtag: "hashtag", clip: "clip" },
    own: ["feed", "account", "premium", "gaming", "kids", "about", "t", "howyoutubeworks", "signin", "logout", "upload", "redirect", "attribution_link", "channel_switcher", "reporthistory", "paid_memberships", "ads", "creators", "jobs", "trends", "new"],
    account: (parts, first) => (["channel", "c", "user"].includes(first) ? keepTwo(parts) : keepFirst(parts)) // @juan/videos -> @juan
  },
  linkedin: {
    kinds: { posts: "post", pulse: "article", jobs: "job post", learning: "course", events: "event", groups: "group", newsletters: "newsletter" },
    own: ["feed", "search", "login", "signup", "help", "mynetwork", "messaging", "notifications", "home", "legal", "premium", "sales", "talent", "uas", "checkpoint", "authwall", "games", "my-items", "accessibility"],
    account: (parts, first) => {
      if (["in", "company", "school", "showcase"].includes(first)) return keepTwo(parts); // in/juan/details/skills -> in/juan
      if (first === "pub") return null; // an old public profile link
      return "hint";
    }
  },
  github: {
    kinds: {},
    own: ["settings", "login", "logout", "join", "signup", "explore", "topics", "trending", "marketplace", "features", "pricing", "about", "notifications", "issues", "pulls", "search", "new", "organizations", "codespaces", "collections", "events", "enterprise", "security", "site", "readme", "apps", "customer-stories", "team", "sessions", "dashboard", "copilot", "contact", "account", "password_reset", "solutions", "resources", "partners", "mobile", "nonprofit", "education", "stars", "watching"],
    account: (parts, first) => {
      if (first === "orgs" || first === "sponsors") return parts[1] ? parts.slice(1, 2) : { what: "" }; // orgs/acme/people -> acme
      return keepFirst(parts); // juan/my-project -> juan
    }
  },
  x: {
    kinds: { hashtag: "hashtag", search: "search" },
    own: ["home", "explore", "notifications", "messages", "settings", "login", "logout", "signup", "compose", "tos", "privacy", "intent", "share", "account", "jobs", "communities", "lists", "premium_sign_up"],
    account: (parts, first) => {
      if (first === "i") return parts.some((part) => part.toLowerCase() === "status") ? { what: "post" } : { what: "" }; // i/web/status/123
      return keepFirst(parts); // juan/status/123 -> juan
    }
  },
  threads: {
    kinds: { t: "post" },
    own: ["search", "login", "activity", "settings", "explore", "intent", "about", "legal", "privacy", "terms"],
    account: (parts, first) => (first.startsWith("@") ? keepFirst(parts) : "hint") // @juan/post/abc -> @juan
  }
};

// The account inside a pasted link: { link } (the same link, or shortened to the account with fixed: true), or
// { error, wrongPage: true } when it isn't an account link (the box shows that one while the link is pasted).
function accountLink(platform, link) {
  const rules = ACCOUNT_PARTS[platform.key];
  const [, host, rest] = link.match(/^https:\/\/([^/]+)\/(.*)$/i) || [];
  const parts = (rest || "").replace(/[?#].*$/, "").split("/").filter(Boolean);
  if (!rules || !parts.length) return { link };
  const first = parts[0].toLowerCase();
  const article = ["instagram", "x"].includes(platform.key) ? "an" : "a";
  const notAccount = (what) => ({
    error: `${what ? `That's a link to ${article} ${platform.label} ${what}` : `That's one of ${platform.label}'s own pages`}, not an account. Open your ${platform.label} profile and copy its link, or type your username.`,
    wrongPage: true
  });
  if (rules.kinds[first]) return notAccount(rules.kinds[first]);
  if (rules.own.includes(first)) return notAccount("");
  const found = rules.account(parts, first, host);
  if (found === "hint") return { error: `That isn't a link to a ${platform.label} account. An account link looks like ${platform.makeLink("yourname")}, or just type your username.`, wrongPage: true };
  if (found && !Array.isArray(found)) return notAccount(found.what);
  if (Array.isArray(found)) return { link: `https://${host}/${found.join("/")}`, fixed: true };
  return { link };
}

// Turns what was typed for a platform into the link to save, or returns { error }. Two ways in: a plain username
// ("@juan" or "juan" becomes https://www.tiktok.com/@juan) or a pasted link (the leftovers that share buttons add,
// like ?igsh=... or #top, are cut off; "tiktok.com/@juan" gets its https://). A pasted link that opens a post or a
// video inside an account is shortened to the account ({ link, fixed: true }); one with no account in it is refused.
export function cleanSocialAccount(key, text) {
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key);
  if (!platform) return { error: "Pick a platform first." };
  let typed = text.trim();
  if (!typed) return { error: `Type your ${platform.label} username or paste your link.` };
  if (/\s/.test(typed)) return { error: "A username or link can't have spaces in it." };

  // Anything with a slash, or that is just the platform's address (www.tiktok.com), is a pasted link.
  const lower = typed.toLowerCase();
  const justTheSite = platform.domains.some((domain) => lower === domain || lower.endsWith(`.${domain}`));
  if (!typed.includes("/") && !justTheSite) {
    const name = typed.replace(/^@/, "");
    if (!platform.nameOk.test(name)) return { error: `That isn't a valid ${platform.label} username. Check it, or paste your ${platform.label} link instead.` };
    return { link: platform.makeLink(name) };
  }

  if (/^http:\/\//i.test(typed)) return { error: "Use a secure link: it must start with https://" };
  if (!/^https:\/\//i.test(typed)) typed = `https://${typed}`;
  typed = typed.replace(/^https:\/\//i, "https://");
  const facebookId = platform.key === "facebook" ? typed.match(/^(https:\/\/[^/?#]+\/profile\.php)\?(?:[^#]*&)?(id=\d+)/i) : null;
  const link = facebookId ? `${facebookId[1]}?${facebookId[2]}` : typed.replace(/[?#].*$/, "");
  if (link.length > MAX_LINK_LENGTH) return { error: `A link can be at most ${MAX_LINK_LENGTH} characters.` };
  if (!platform.pattern.test(link)) {
    const host = link.slice("https://".length).split("/")[0].toLowerCase();
    const onPlatform = platform.domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
    return { error: onPlatform
      ? `Add your page name after the address, like ${platform.makeLink("yourname")}`
      : `That link isn't on ${platform.domains[0]}. Paste your ${platform.label} link, or just type your username.` };
  }
  return accountLink(platform, link);
}

// The name that is written inside a saved account's link: "@bea.edits" for TikTok, Instagram, X, Threads and
// YouTube, "bea-ramos" for LinkedIn, "bea.ramos" for Facebook, "beaedits" for GitHub. "" when the link has none:
// Facebook's profile.php?id=... and /share/... links, a YouTube channel number and an old LinkedIn /pub/ link don't
// contain the name, and the site never visits the page to read it. Never longer than 24 characters.
export function socialName(key, link) {
  const first = (parts) => parts[0] || "";
  const parts = String(link || "").replace(/^https:\/\/[^/]+\/?/i, "").replace(/[?#].*$/, "").split("/").filter(Boolean);
  let name = "";
  if (key === "facebook") name = /^people$/i.test(first(parts)) ? parts[1] || "" : /^(profile\.php|share|pages|p|groups|watch)$/i.test(first(parts)) ? "" : first(parts);
  else if (key === "linkedin") name = /^(in|company|school)$/i.test(first(parts)) ? parts[1] || "" : "";
  else if (key === "youtube") name = /^(c|user)$/i.test(first(parts)) ? (parts[1] ? `@${parts[1]}` : "") : first(parts).startsWith("@") ? first(parts) : "";
  else if (["instagram", "tiktok", "x", "threads"].includes(key)) name = first(parts) ? (first(parts).startsWith("@") ? first(parts) : `@${first(parts)}`) : "";
  else name = first(parts);
  return name.length > 24 ? `${name.slice(0, 23)}…` : name;
}

// The name a person typed for an account (PLAN-social-accounts.md, round 3): "Juan Dela Cruz" on a Facebook link that has
// no name in it. Saved next to the links, profiles.social_labels = { platform: name }. At most 40 characters, no space
// at either end, none of / \ < > " ` and no control characters, and no "://" or "www." (so a name can't be a link).
// The database has the same rule (social_labels_ok) and also refuses blocked words.
export const MAX_SOCIAL_LABEL_LENGTH = 40;
function labelProblem(text) {
  if (text.length > MAX_SOCIAL_LABEL_LENGTH) return `A name can be at most ${MAX_SOCIAL_LABEL_LENGTH} characters.`;
  if (/[/\\<>"`]/.test(text) || /:\/\/|www\./i.test(text)) return "A name can't have a link in it, or any of these: / \\ < > \" `";
  if ([...text].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return "A name can't have line breaks.";
  return "";
}

// What was typed in "Name to show" becomes { label } ("" = no name), or { error }. Spaces are tidied first.
export function cleanSocialLabel(text) {
  const label = String(text ?? "").replace(/\s+/g, " ").trim();
  const problem = label ? labelProblem(label) : "";
  return problem ? { error: problem } : { label };
}

// A saved name, or "" when it isn't a good one (the page only draws what the database rule would allow).
export function safeSocialLabel(label) {
  return typeof label === "string" && label && label === label.trim() && !labelProblem(label) ? label : "";
}

// What a chip or a pill says for an account: the name the person typed, else the name inside the link, else just
// the platform's name ("Facebook") when the link has no name in it.
export function socialHandle(key, link, label) {
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key);
  return safeSocialLabel(label) || socialName(key, link) || (platform ? platform.label : "Profile");
}

// The tooltip of an account: "Juan Dela Cruz on Facebook" or "@bea.edits on TikTok", or "Bea's Facebook" when there is no name.
export function socialTitle(key, link, who, label) {
  const platform = SOCIAL_PLATFORMS.find((p) => p.key === key);
  const platformName = platform ? platform.label : "Profile";
  const name = safeSocialLabel(label) || socialName(key, link);
  return name ? `${name} on ${platformName}` : who ? `${who}'s ${platformName}` : platformName;
}

// The user's saved accounts as { platform: link }, or null when they couldn't be loaded.
export async function fetchSocialLinks(userId) {
  const { data, error } = await supabase.from("profiles").select("social_links").eq("id", userId).maybeSingle();
  if (error) return null;
  return data?.social_links ?? {};
}

// Their typed names as { platform: name }. Read in its own request, so a missing column only means no names: {}.
export async function fetchSocialLabels(userId) {
  const { data, error } = await supabase.from("profiles").select("social_labels").eq("id", userId).maybeSingle();
  if (error) return {};
  return data?.social_labels && typeof data.social_labels === "object" ? data.social_labels : {};
}

// Only the platforms the site still offers (a Pinterest link saved before 2026-11-24 is dropped this way).
const onlyOffered = (object) => Object.fromEntries(Object.entries(object || {}).filter(([key]) => SOCIAL_PLATFORMS.some((p) => p.key === key)));

// Saves the links and the names together. Returns "" when saved, or a message to show.
export async function saveSocialLinks(userId, links, labels = {}) {
  const { data, error } = await supabase.from("profiles").update({ social_links: onlyOffered(links), social_labels: onlyOffered(labels) }).eq("id", userId).select("id");
  if (error && /bad words/i.test(error.message || "")) return "Please don't use bad words in a name.";
  if (error || !data?.length) return "Couldn't save your accounts. Please try again.";
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
