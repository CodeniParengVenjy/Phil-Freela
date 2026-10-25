// The opening guide (components/WelcomeGuide.jsx): a short guided tour for
// beginners. The page goes dim, one real button or box is outlined, and a small
// note next to it says what it is for. It opens by itself once for each person
// on each browser, and again whenever they choose "Take the tour" in the
// account menu.

// The steps for each role, in the order they appear on the page. For each step:
//   target: the name of the part of the page to point at. The page marks those
//           parts with data-tour="name" (the menu, the search box, the account
//           button, the Get started card, the first job or service). null = a
//           card in the middle of the screen (the welcome).
//   menu:   true = the side menu must be open for this step (the tour opens it
//           and closes it again afterwards, because it starts closed).
//   scroll: true = scroll the page so the part is in view first.
//   next:   the words on the button, when it isn't "Next".
// A step whose target isn't on the page (an empty job list, a hidden Get
// started card) is skipped.
export const TOUR_STEPS = {
  freelancer: [
    { target: null, title: "Welcome to PhilFreela!", text: "Let's take a quick look around. It takes less than a minute, and you can skip it any time.", next: "Start tour" },
    { target: "sidebar", menu: true, title: "Your menu", text: "My Services is where you post what you offer. Inbox has your messages, Bookings your booking requests, and Project your work in progress." },
    { target: "search", title: "Search", text: "Type here to look for jobs, services or people, then press Enter." },
    { target: "account", title: "Your account", text: "Open this to see your profile and settings, switch between freelancer and client, sign out, or take this tour again." },
    { target: "get-started", scroll: true, title: "Start here", text: "This checklist shows what to do first, like getting verified and adding your skills. Only the next step has a button." },
    { target: "first-item", scroll: true, title: "Jobs for you", text: "Jobs from clients appear here. Tap one to read it, then send your resume." }
  ],
  client: [
    { target: null, title: "Welcome to PhilFreela!", text: "Let's take a quick look around. It takes less than a minute, and you can skip it any time.", next: "Start tour" },
    { target: "sidebar", menu: true, title: "Your menu", text: "Post a Project is where you tell freelancers what you need. Inbox has your messages, Bookings your booking requests, and Projects & Resumes the people who applied and your work in progress." },
    { target: "search", title: "Search", text: "Type here to find freelancers and services. On a computer, the camera button lets you search with a picture." },
    { target: "account", title: "Your account", text: "Open this to see your profile and settings, switch between client and freelancer, sign out, or take this tour again." },
    { target: "get-started", scroll: true, title: "Start here", text: "This checklist shows what to do first, like writing a short description about yourself. Only the next step has a button." },
    { target: "first-item", scroll: true, title: "Services to book", text: "Freelancers' services appear here. Tap View offer to read about one, then book it or message the freelancer." }
  ]
};

// "Already seen" is kept in this browser only (a per-person convenience, nothing
// is saved in the database). If the browser won't keep it (a private window),
// the tour is treated as seen so it doesn't pop up on every page load; the
// account menu can still open it.
const seenKey = (userId) => `philfreela-tour-seen-${userId}`;

export function hasSeenGuide(userId) {
  try { return localStorage.getItem(seenKey(userId)) === "1"; } catch { return true; }
}

export function markGuideSeen(userId) {
  try { localStorage.setItem(seenKey(userId), "1"); } catch { /* nothing to keep it in */ }
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
