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
const SERVICES = "/dashboard/services";
const POST = "/dashboard/post-need";
const PROJECTS = "/dashboard/projects";
const PROFILE = "/dashboard/profile";
const SETTINGS = "/dashboard/settings";

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
//   later:   true = that button means "not now": the note comes back at the
//            person's next visit (Skip itself ends the tour).
//   icon:    the icon of a card in the middle, when not the part's own.
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
    next: "Try again", skip: "Later", later: true
  }
];

export const TOUR = {
  freelancer: {
    welcome: [
      { page: "home", target: null, when: "unverified", title: "Welcome to PhilFreela!", text: "This tour shows you around step by step. First a quick look at your dashboard, then we'll verify your identity together. Once you're verified, it shows you how to post your first service, find jobs and get paid. You can skip it any time.", next: "Start tour" },
      { page: "home", target: null, when: "verified", title: "Welcome to PhilFreela!", text: "This tour shows you around step by step: your dashboard first, then how to post services, find jobs, handle bookings and projects, and get paid. You can skip it any time.", next: "Start tour" },
      { page: "home", target: "sidebar", menu: true, title: "Your menu", text: "Your work is here: My Services, Bookings, Project and Premium. The menu button at the top left opens and closes it." },
      { page: "home", target: "search", title: "Search", text: "Type here to look for jobs, services or people, then press Enter." },
      { page: "home", target: "account", title: "Your account", text: "Your profile, your settings, switching between freelancer and client, and signing out are in this menu." },
      { page: "home", target: "get-started", scroll: true, title: "Start here", text: "This checklist shows what to do first. It ticks itself as you go, and only the next step has a button." },
      { page: "home", target: "get-started-verify", when: "unverified", scroll: true, title: "First step: verify your identity", text: "Freelancers must be verified before they can post a service or apply to a job. It takes about 3 minutes: a photo of a government ID and a quick face scan.", next: "Let's verify" }
    ],
    verify: verifyNotes("An admin checks your ID soon, and you'll get a notification. The rest of the tour (posting your first service, finding jobs, getting paid) starts once you're verified."),
    retry: retryNotes,
    // Each page starts with a note on its link in the side menu (page: null, so
    // it shows on whatever page the person is on), and Next opens the page.
    full: [
      { page: null, target: null, title: "You're verified!", text: "Your Verified badge is on. Now the full tour: posting your first service, finding jobs, bookings, projects, payments and your settings. It takes about 5 minutes.", next: "Start", skip: "Later", later: true },

      { page: null, target: "menu-services", menu: true, title: "My Services", text: "This is where you post what you offer and keep your offers. Next opens it." },
      { page: SERVICES, target: "service-title", scroll: true, title: "Service title", text: "Say what you do in a few words, like \"Video editing for ads and reels\". It's the first thing clients read." },
      { page: SERVICES, target: "service-category", scroll: true, title: "Category", text: "Pick the kind of work. Clients browse offers by category, and it helps the AI show your offer to the right clients." },
      { page: SERVICES, target: "service-description", scroll: true, title: "Description", text: "Tell clients what they get: what's included, how long it takes and how many revisions. Bad words are hidden automatically." },
      { page: SERVICES, target: "service-skill", scroll: true, title: "Skill", text: "The main skill this offer needs. It helps clients and the AI find you." },
      { page: SERVICES, target: "service-price", scroll: true, title: "Starting price", text: "The lowest price you'd take, in pesos. Clients see it on your offer's card." },
      { page: SERVICES, target: "service-media", scroll: true, title: "Photos, videos and documents", text: "Show samples of your work as a slideshow. Your files get an invisible watermark that proves they're yours. Mark a file as Promo when it's an ad." },
      { page: SERVICES, target: "service-publish", scroll: true, title: "Upload & Publish", text: "When it's ready, press this and clients can find your offer. A free account can have 3 offers, Premium up to 15." },
      { page: SERVICES, target: "service-list", scroll: true, title: "Your offers", text: "Your offers show here. Edit or delete them any time, or pay to Feature one so it shows first." },
      { page: SERVICES, target: "service-check-file", scroll: true, title: "Found your work somewhere?", text: "Check a picture, video or text you found online: PhilFreela reads its hidden watermark and shows whose work it is." },

      { page: null, target: "menu-home", menu: true, title: "Dashboard: jobs", text: "Your dashboard lists jobs from clients, the ones that fit you first. Next opens it." },
      { page: "home", target: "jobs-search", scroll: true, title: "Search the jobs", text: "Type to narrow the list by job title, client or category." },
      { page: "home", target: "jobs-filter", scroll: true, title: "Projects or jobs", text: "A project is one piece of work for one price; a job is ongoing work paid per day or per month. Pick one to see only those." },
      { page: "home", target: "first-item", optional: true, scroll: true, title: "Open a job", text: "Tap a job to read it. On its page you apply with your resume (a PDF), message the client, or report the post." },

      { page: null, target: "menu-bookings", menu: true, title: "Bookings", text: "When a client books one of your offers, the request comes here. Next opens it." },
      { page: "/dashboard/bookings", target: "bookings", scroll: true, title: "Booking requests", text: "Accept or decline each request. An accepted booking becomes a project. The number on the menu shows how many are waiting." },

      { page: null, target: "menu-projects", menu: true, title: "Project", text: "Your applications and the work you were hired for. Next opens it." },
      { page: PROJECTS, target: "applications", scroll: true, title: "My Applications", text: "The jobs you applied to, and whether the client hired you." },
      { page: PROJECTS, target: "projects", scroll: true, title: "My Projects", text: "Work you were hired for. Open one to see the agreed price and due date, send your work, ask for payment by GCash and, at the end, see the client's rating." },

      // The chat icon and the bell are in the top bar, so no side menu here.
      { page: null, target: "topbar-messages", title: "Messages", text: "Your chats with clients. A red number here shows new messages, and pressing it lists your latest chats. Next opens your Inbox." },
      { page: "/dashboard/inbox", target: "inbox", scroll: true, title: "Chats", text: "Open a chat to talk with a client: send files and voice messages, make a voice or video call, or ask for payment." },

      { page: null, target: "topbar-notifications", title: "Notifications", text: "Bookings, hires, payments, your ID check and news from PhilFreela. A red number here shows the new ones, and pressing it lists the latest. Next opens all of them." },
      { page: "/dashboard/notifications", target: "notifications", scroll: true, title: "Your notifications", text: "Each one says what happened and takes you to the right page." },

      { page: null, target: "account", title: "Your profile and settings", text: "Both are in this menu: My Profile and Account Settings. Next opens your profile." },
      { page: PROFILE, target: "profile-description", scroll: true, title: "Your profile", text: "This is what clients see about you. Your description is written in Settings; a clear one helps the AI match you with jobs." },
      { page: PROFILE, target: "profile-skills", scroll: true, title: "Skills", text: "Add your skills here. They show on your profile and help the AI suggest you for jobs." },
      { page: PROFILE, target: "profile-portfolio", scroll: true, title: "Portfolio", text: "Add your best past work. Clients choose freelancers by it, and your files get your watermark." },
      { page: PROFILE, target: "profile-performance", scroll: true, title: "Your numbers", text: "Completed projects, on-time delivery, your rating and how fast you reply, all from real projects and chats." },

      { page: SETTINGS, target: "settings-tabs", scroll: true, title: "Settings", text: "Profile Settings: your name, picture, cover and description. Account Security: your password. Watermark Settings: the mark on your files. Appearance: dark or light, and your color. Privacy & Notifications: emails and your data." },
      { page: SETTINGS, target: "settings-gcash", scroll: true, title: "GCash Payment", text: "Add your GCash number so clients know where to pay you. PhilFreela never holds your money." },

      { page: null, target: "menu-pro", menu: true, title: "Premium", text: "More offers, a free Featured post every month and a gold Premium badge, if you want them. Next opens it." },
      { page: "/dashboard/pro", target: "pro-plan", scroll: true, title: "Free or Premium", text: "Free stays free. Premium is ₱149 for 30 days, paid online with GCash, Maya or QR Ph: up to 15 offers instead of 3, a free Featured post every month, view counts, bigger chat files, your own watermark look, and a gold Premium badge." },

      { page: "home", target: null, icon: "bi-flag-fill", title: "That's the tour!", text: "You know your way around PhilFreela now. Good luck with your first client!", next: "Done" }
    ]
  },
  client: {
    welcome: [
      { page: "home", target: null, when: "unverified", title: "Welcome to PhilFreela!", text: "This tour shows you around step by step. First a quick look at your dashboard, then we'll verify your identity together. Once you're verified, it shows you how to post a project, hire freelancers and pay them. You can skip it any time.", next: "Start tour" },
      { page: "home", target: null, when: "verified", title: "Welcome to PhilFreela!", text: "This tour shows you around step by step: your dashboard first, then how to post a project, book services, hire freelancers and pay them. You can skip it any time.", next: "Start tour" },
      { page: "home", target: "sidebar", menu: true, title: "Your menu", text: "Your work is here: Bookings, Post a Project, Projects & Resumes and Premium. The menu button at the top left opens and closes it." },
      { page: "home", target: "search", title: "Search", text: "Type here to find freelancers and services, then press Enter. On a computer, the camera button lets you search with a picture." },
      { page: "home", target: "account", title: "Your account", text: "Your profile, your settings, switching between client and freelancer, and signing out are in this menu." },
      { page: "home", target: "get-started", scroll: true, title: "Start here", text: "This checklist shows what to do first. It ticks itself as you go, and only the next step has a button." },
      { page: "home", target: "get-started-verify", when: "unverified", scroll: true, title: "First step: verify your identity", text: "Clients must be verified before they can post a project, and freelancers trust a verified client more. It takes about 3 minutes: a photo of a government ID and a quick face scan.", next: "Let's verify" }
    ],
    verify: verifyNotes("An admin checks your ID soon, and you'll get a notification. The rest of the tour (posting a project, hiring freelancers, paying them) starts once you're verified."),
    retry: retryNotes,
    full: [
      { page: null, target: null, title: "You're verified!", text: "Your Verified badge is on. Now the full tour: posting your first project, finding and booking freelancers, hiring, paying, and your settings. It takes about 5 minutes.", next: "Start", skip: "Later", later: true },

      { page: null, target: "menu-post", menu: true, title: "Post a Project", text: "This is where you tell freelancers what you need. Next opens it." },
      { page: POST, target: "post-type", click: true, scroll: true, title: "What are you posting?", text: "A project is one piece of work for one price. A job is ongoing work, paid per day or per month. Press one to see its form; nothing is posted until you press the button at the end." },
      { page: POST, target: "post-title", scroll: true, title: "Title", text: "Say what you need in a few words, like \"Logo for my bakery\". It's the first thing freelancers read." },
      { page: POST, target: "post-category", scroll: true, title: "Category", text: "The kind of work. Freelancers look for jobs by category, and it helps the AI show your post to the right people." },
      { page: POST, target: "post-description", scroll: true, title: "Description", text: "Explain the work: what you need, what you'll give the freelancer, and what the result should be. Bad words are hidden automatically." },
      { page: POST, target: "post-skills", scroll: true, title: "Skills", text: "The skills the work needs. The AI reads your title and description and fills them in by itself (the ones with a star). Remove one that doesn't fit, press another of its ideas, or type your own." },
      { page: POST, target: "post-budget", scroll: true, title: "Budget", text: "How much you'll pay, in pesos: for the whole project, or per day or per month for a job. Leave it empty to agree on it with the freelancer." },
      { page: POST, target: "post-dates", scroll: true, title: "Dates", text: "When the work starts and when it's due. After the due date, the post stops showing to freelancers." },
      { page: POST, target: "post-needed", scroll: true, title: "Freelancers needed", text: "How many people you want to hire. Once you've hired that many, the post is hidden from freelancers." },
      { page: POST, target: "post-submit", scroll: true, title: "Post it", text: "When it's ready, press this and freelancers can find your post and send you their resumes." },
      { page: POST, target: "post-list", scroll: true, title: "Your posts", text: "Your posts show here: open, filled or expired. Edit, delete or reopen them, see who you hired, or pay to Feature one so it shows first." },

      { page: null, target: "menu-home", menu: true, title: "Dashboard: services", text: "Your dashboard lists freelancers' services, the ones that fit you first. Next opens it." },
      { page: "home", target: "services-filter", scroll: true, title: "Find a service", text: "Pick a category or type a word to narrow the list." },
      { page: "home", target: "search-picture", optional: true, title: "Search with a picture", text: "Press the camera, or drop a picture on the search box, and the AI finds freelancers whose work looks like it." },
      { page: "home", target: "first-item", optional: true, scroll: true, title: "Open an offer", text: "Press View offer to read about a service. On its page you book it, message the freelancer, or report it." },

      { page: null, target: "menu-bookings", menu: true, title: "Bookings", text: "The services you booked. Next opens it." },
      { page: "/dashboard/bookings", target: "bookings", scroll: true, title: "My bookings", text: "Each booking waits for the freelancer to accept it, and then it becomes a project. You can cancel one that is still waiting." },

      { page: null, target: "menu-projects", menu: true, title: "Projects & Resumes", text: "The people who applied to your posts, and the work you hired them for. Next opens it." },
      { page: PROJECTS, target: "applications", scroll: true, title: "Applications & resumes", text: "Freelancers who applied to your posts. Open a resume, message the person, or hire them." },
      { page: PROJECTS, target: "projects", scroll: true, title: "My projects", text: "The freelancers you hired. Open one to see the agreed price and the work they send, record your GCash payment, mark it done and rate the freelancer." },

      // The chat icon and the bell are in the top bar, so no side menu here.
      { page: null, target: "topbar-messages", title: "Messages", text: "Your chats with freelancers. A red number here shows new messages, and pressing it lists your latest chats. Next opens your Inbox." },
      { page: "/dashboard/inbox", target: "inbox", scroll: true, title: "Chats", text: "Open a chat to talk with a freelancer: send files and voice messages, or make a voice or video call." },

      { page: null, target: "topbar-notifications", title: "Notifications", text: "Applications, bookings, payments, your ID check and news from PhilFreela. A red number here shows the new ones, and pressing it lists the latest. Next opens all of them." },
      { page: "/dashboard/notifications", target: "notifications", scroll: true, title: "Your notifications", text: "Each one says what happened and takes you to the right page." },

      { page: null, target: "account", title: "Your profile and settings", text: "Both are in this menu: My Profile and Account Settings. Next opens your profile." },
      { page: PROFILE, target: "profile-description", scroll: true, title: "Your profile", text: "This is what freelancers see about you. Your description is written in Settings; it also helps the AI recommend freelancers for you." },
      { page: PROFILE, target: "profile-completed", scroll: true, title: "Completed projects", text: "The projects you marked done. They show freelancers that you're a real client who finishes work." },
      { page: PROFILE, target: "profile-performance", scroll: true, title: "Your numbers", text: "From real projects and chats: projects done, the ratings freelancers gave you, and how fast you reply." },

      { page: SETTINGS, target: "settings-tabs", scroll: true, title: "Settings", text: "Profile Settings: your name, picture, cover and description. Account Security: your password. Watermark Settings: the mark on your files. Appearance: dark or light, and your color. Privacy & Notifications: emails and your data." },

      { page: null, target: "menu-pro", menu: true, title: "Premium", text: "A free Featured job post every month and a gold Premium badge, if you want them. Next opens it." },
      { page: "/dashboard/pro", target: "pro-plan", scroll: true, title: "Free or Premium", text: "Free stays free. Premium is ₱149 for 30 days, paid online with GCash, Maya or QR Ph: a free Featured post every month, half-price ones after, view counts on your posts, bigger chat files, the two-color look, and a gold Premium badge." },

      { page: "home", target: null, icon: "bi-flag-fill", title: "That's the tour!", text: "You know your way around PhilFreela now. Good luck with your first hire!", next: "Done" }
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
// on a new phone). Older accounts don't get it.
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
//   mode:  "on" (showing the note at part/index), "paused" (Later, or the
//          browser's Back button: it goes on at the next visit), "waiting"
//          (hidden until the note's waitFor part shows up), "review" (the ID
//          was sent, waiting for an admin; checked on every dashboard page) or
//          "done" (finished, or Skip)
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
// itself, or it would start again on every visit.
export function canKeepTour() {
  try {
    localStorage.setItem("philfreela-tour-check", "1");
    localStorage.removeItem("philfreela-tour-check");
    return true;
  } catch {
    return false;
  }
}

// "Later" (and leaving the tour's page with the browser's Back button) pauses
// the tour until the person's next visit. This flag is kept for this browser
// tab only (sessionStorage), so the tour stays away for the rest of the visit
// and goes on when PhilFreela is opened again in a new tab or window. If the
// browser won't keep it, the tour stays paused.
const laterKey = (userId) => `philfreela-tour-later-${userId}`;

export function pausedThisVisit(userId) {
  try { return sessionStorage.getItem(laterKey(userId)) === "1"; } catch { return true; }
}

export function markPausedThisVisit(userId) {
  try { sessionStorage.setItem(laterKey(userId), "1"); } catch { /* the tour stays paused */ }
}
