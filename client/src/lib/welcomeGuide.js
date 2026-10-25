// The opening guide (components/WelcomeGuide.jsx): a short pop-up that explains
// how PhilFreela works. It opens by itself once for each person on each browser,
// and again whenever they choose "How PhilFreela works" in the account menu.

// Three short slides for each role: an icon, a title and two sentences.
export const GUIDE_SLIDES = {
  freelancer: [
    { icon: "bi-patch-check", title: "Get verified first", text: "Send a photo of your ID and a quick face scan. Only verified freelancers can post services and apply to jobs." },
    { icon: "bi-images", title: "Show your work", text: "Write a short description, add your skills and your best work to your profile, then post a service. A service is what clients book from you." },
    { icon: "bi-briefcase", title: "Find jobs and get booked", text: "Your dashboard lists jobs from clients: open one and send your resume. Clients can also message you or book your service." }
  ],
  client: [
    { icon: "bi-search", title: "Find the right freelancer", text: "Browse services on your dashboard, or search with words. Drop a picture on the search box to find freelancers whose work looks like it." },
    { icon: "bi-clipboard-plus", title: "Post what you need", text: "Post a project (one price) or an ongoing job (paid per day or month) and freelancers send you their resumes. Or open a service and book it." },
    { icon: "bi-chat-dots", title: "Chat and follow the work", text: "Message freelancers any time. Follow your projects in Projects & Resumes, mark them done, and rate the freelancer." }
  ]
};

// "Already seen" is kept in this browser only (a per-person convenience, nothing
// is saved in the database). If the browser won't keep it (a private window),
// the guide is treated as seen so it doesn't pop up on every page load; the
// account menu can still open it.
const seenKey = (userId) => `philfreela-welcome-guide-seen-${userId}`;

export function hasSeenGuide(userId) {
  try { return localStorage.getItem(seenKey(userId)) === "1"; } catch { return true; }
}

export function markGuideSeen(userId) {
  try { localStorage.setItem(seenKey(userId), "1"); } catch { /* nothing to keep it in */ }
}

// The account menu is in another component, so it asks the guide to open with
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
