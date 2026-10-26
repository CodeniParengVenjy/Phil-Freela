import { supabase } from "./supabaseClient";
import { fetchIsVerified, fetchLatestVerification } from "./verification";

// The opening tour (components/WelcomeGuide.jsx), a guided tour for new
// accounts in three parts (PLAN-full-tour.md):
//   "welcome": a look around the dashboard, ending at "verify your identity"
//   "verify":  the Verify Identity page; the tour steps aside while the person
//              sends their ID, then waits for an admin to approve it
//   "full":    the full tour of every page, only once the ID is approved
//              (posting a service or a project needs a verified ID)
// plus "retry", one card for an ID that was not approved.
// The page goes dim, one real button or box is outlined, and a note beside it
// says what it is for.

export const VERIFY_PAGE = "/dashboard/verify-identity";

// Every note:
//   page:    where it is shown: "home" (the dashboard home of the person's
//            role) or an address. Next opens the next note's page by itself.
//            null = wherever the person is (a card in the middle).
//   target:  the part to point at; the page marks it with data-tour="name".
//            null = a card in the middle of the screen.
//   menu:    true = the side menu must be open (the tour opens it, then puts
//            it back the way it was).
//   scroll:  true = scroll the part into view first.
//   click:   true = the person presses the outlined part themselves (it can be
//            pressed); the tour goes on once the next note's part shows up.
//   waitFor: after Next, the tour hides until this part shows up (while the
//            person fills in the ID form).
//   when:    "verified" / "unverified" = only for someone who is / isn't.
//   optional: true = often not on the page (Try again, the phone QR code), so
//            it is left out of the "2 of 6" count.
//   next, skip: other words for the Next and Skip buttons.
// A note whose part isn't on the page (an empty list, a hidden card) is skipped.

const verifyNotes = (sentText) => [
  { page: VERIFY_PAGE, target: "verify-retry", optional: true, click: true, scroll: true, title: "Send it again", text: "Press Try again to send new photos. Use a clear, sharp photo of your ID, without glare." },
  { page: VERIFY_PAGE, target: "verify-steps", scroll: true, title: "Verify your identity", text: "Five short steps, about 3 minutes: the type of ID, a photo of its front, its back, a face scan, then a last check before you send it. This bar shows how far you are." },
  { page: VERIFY_PAGE, target: "verify-id-type", title: "Choose your ID", text: "Pick the government ID you have: PhilSys National ID, Driver's License, Passport, UMID or PRC ID. A passport needs no back photo." },
  { page: VERIFY_PAGE, target: "verify-phone", optional: true, scroll: true, title: "Easier on a phone?", text: "Scan this QR code with your phone's camera to take the photos and do the face scan there. This page updates by itself when you're done." },
  { page: VERIFY_PAGE, target: "verify-start", waitFor: "verify-sent", title: "Your turn", text: "Follow the steps: the photos of your ID, then the face scan. Tips: let the ID fill the photo, avoid glare, take off glasses, masks or hats, and face a light. The tour waits here and comes back when you've sent it.", next: "Start" },
  { page: VERIFY_PAGE, target: "verify-sent", scroll: true, title: "Sent!", text: sentText, next: "OK" }
];

const retryNotes = [
  {
    page: null, target: null, title: "Your ID was not approved",
    text: ({ adminNote }) => `${adminNote ? `The admin wrote: "${adminNote}". ` : ""}You can send it again with clearer photos, and the tour will guide you.`,
    next: "Try again", skip: "Later"
  }
];

export const TOUR = {
  freelancer: {
    welcome: [
      { page: "home", target: null, when: "unverified", title: "Welcome to PhilFreela!", text: "This tour shows you around step by step. First a quick look at your dashboard, then we'll verify your identity together. Once you're verified, it shows you how to post your first service, find jobs and get paid. You can skip it any time.", next: "Start tour" },
      { page: "home", target: null, when: "verified", title: "Welcome to PhilFreela!", text: "This tour shows you around step by step: your dashboard first, then how to post services, find jobs, handle bookings and projects, and get paid. You can skip it any time.", next: "Start tour" },
      { page: "home", target: "sidebar", menu: true, title: "Your menu", text: "Every part of PhilFreela is here: My Services, Inbox, Notifications, Bookings and Project. The menu button at the top left opens and closes it." },
      { page: "home", target: "search", title: "Search", text: "Type here to look for jobs, services or people, then press Enter." },
      { page: "home", target: "account", title: "Your account", text: "Your profile, your settings, switching between freelancer and client, signing out, and this tour (Take the tour) are in this menu." },
      { page: "home", target: "get-started", scroll: true, title: "Start here", text: "This checklist shows what to do first. It ticks itself as you go, and only the next step has a button." },
      { page: "home", target: "get-started-verify", when: "unverified", scroll: true, title: "First step: verify your identity", text: "Freelancers must be verified before they can post a service or apply to a job. It takes about 3 minutes: a photo of a government ID and a quick face scan.", next: "Let's verify" }
    ],
    verify: verifyNotes("An admin checks your ID soon, and you'll get a notification. The rest of the tour (posting your first service, finding jobs, getting paid) starts once you're verified."),
    retry: retryNotes,
    full: [
      { page: null, target: null, title: "You're verified!", text: "Your Verified badge is on. Now the full tour: posting your first service, finding jobs, bookings, projects, payments and your settings. It takes about 5 minutes.", next: "Start", skip: "Later" },
      { page: "home", target: "account", title: "That's the tour!", text: "You can play it again any time: open this menu and choose Take the tour.", next: "Done" }
    ]
  },
  client: {
    welcome: [
      { page: "home", target: null, when: "unverified", title: "Welcome to PhilFreela!", text: "This tour shows you around step by step. First a quick look at your dashboard, then we'll verify your identity together. Once you're verified, it shows you how to post a project, hire freelancers and pay them. You can skip it any time.", next: "Start tour" },
      { page: "home", target: null, when: "verified", title: "Welcome to PhilFreela!", text: "This tour shows you around step by step: your dashboard first, then how to post a project, book services, hire freelancers and pay them. You can skip it any time.", next: "Start tour" },
      { page: "home", target: "sidebar", menu: true, title: "Your menu", text: "Every part of PhilFreela is here: Inbox, Notifications, Bookings, Post a Project, and Projects & Resumes. The menu button at the top left opens and closes it." },
      { page: "home", target: "search", title: "Search", text: "Type here to find freelancers and services, then press Enter. On a computer, the camera button lets you search with a picture." },
      { page: "home", target: "account", title: "Your account", text: "Your profile, your settings, switching between client and freelancer, signing out, and this tour (Take the tour) are in this menu." },
      { page: "home", target: "get-started", scroll: true, title: "Start here", text: "This checklist shows what to do first. It ticks itself as you go, and only the next step has a button." },
      { page: "home", target: "get-started-verify", when: "unverified", scroll: true, title: "First step: verify your identity", text: "Clients must be verified before they can post a project, and freelancers trust a verified client more. It takes about 3 minutes: a photo of a government ID and a quick face scan.", next: "Let's verify" }
    ],
    verify: verifyNotes("An admin checks your ID soon, and you'll get a notification. The rest of the tour (posting a project, hiring freelancers, paying them) starts once you're verified."),
    retry: retryNotes,
    full: [
      { page: null, target: null, title: "You're verified!", text: "Your Verified badge is on. Now the full tour: posting your first project, finding and booking freelancers, hiring, paying, and your settings. It takes about 5 minutes.", next: "Start", skip: "Later" },
      { page: "home", target: "account", title: "That's the tour!", text: "You can play it again any time: open this menu and choose Take the tour.", next: "Done" }
    ]
  }
};

// The name of each part, shown above every note ("Welcome · 2 of 6").
export const PART_NAMES = { welcome: "Welcome", verify: "Verify your ID", retry: "Verify your ID", full: "Full tour" };

// The part after this one: the ID part for someone not verified yet, the full
// tour for someone verified. null = the end (after "verify" the tour waits for
// the admin; after "full" it is done).
export function nextPart(part, verified) {
  if (part === "welcome") return verified ? "full" : "verify";
  if (part === "retry") return "verify";
  return null;
}

// True when a note is for this person ("when" fits their ID status).
export const fitsPerson = (note, verified) => !note.when || (note.when === "verified") === Boolean(verified);

// The address of a note's page ("home" depends on the role).
export const pagePath = (page, accountType) => (page === "home" ? (accountType === "client" ? "/dashboard-client" : "/dashboard-freelancer") : page);

// It opens by itself only for NEW accounts: made on or after the day this tour
// was added, and less than a week ago (so it doesn't start again months later
// on a new phone). Older accounts can play it from the account menu.
export const TOUR_START = "2026-10-26T00:00:00+08:00";
export const NEW_ACCOUNT_DAYS = 7;

export function isNewAccount(createdAt, now = Date.now()) {
  const made = Date.parse(createdAt || "");
  return Number.isFinite(made) && made >= Date.parse(TOUR_START) && now - made < NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
}

// When the signed-in account was made (read from the saved sign-in, no request).
export async function fetchAccountCreatedAt() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.created_at || null;
}

// Where the person's ID stands: { verified, status, adminNote }, status being
// "none", "pending", "approved" or "rejected"; null if it couldn't be read.
export async function fetchTourStatus(userId) {
  const [verified, latest] = await Promise.all([fetchIsVerified(userId), fetchLatestVerification(userId)]);
  if (latest.error) return null;
  return { verified, status: latest.data?.status ?? "none", adminNote: latest.data?.admin_note || "" };
}

// Where the person is in the tour, kept in this browser only (a per-person
// convenience, nothing is saved in the database):
//   { mode, part, index, shown }
//   mode:  "on" (showing the note at part/index), "paused" (Skip; the account
//          menu goes on from there), "waiting" (hidden until the note's
//          waitFor part shows up), "review" (the ID was sent, waiting for an
//          admin; checked on every dashboard page) or "done"
//   shown: the notes of this part shown so far, for the Back button
// The copy in memory keeps it across page changes even when the browser won't
// keep it (a private window).
const tourKey = (userId) => `philfreela-tour-${userId}`;
const kept = new Map();

export function loadTour(userId) {
  try {
    const saved = JSON.parse(localStorage.getItem(tourKey(userId)) || "null");
    if (saved && typeof saved.mode === "string") return saved;
  } catch {
    // Storage blocked or the value is broken: use the copy in memory.
  }
  return kept.get(userId) || null;
}

export function saveTour(userId, tour) {
  kept.set(userId, tour);
  try { localStorage.setItem(tourKey(userId), JSON.stringify(tour)); } catch { /* kept in memory only */ }
}

// A browser that can't keep the tour (a private window) never starts it by
// itself, or it would start again on every visit; the account menu still plays it.
export function canKeepTour() {
  try {
    localStorage.setItem("philfreela-tour-check", "1");
    localStorage.removeItem("philfreela-tour-check");
    return true;
  } catch {
    return false;
  }
}

// The account menu is in another component, so it asks the tour to open with
// a browser event instead of sharing state through every layout.
const OPEN_EVENT = "philfreela-open-guide";

export function openWelcomeGuide() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

// Listens for that request; returns the function that stops listening.
export function onOpenWelcomeGuide(handler) {
  window.addEventListener(OPEN_EVENT, handler);
  return () => window.removeEventListener(OPEN_EVENT, handler);
}
