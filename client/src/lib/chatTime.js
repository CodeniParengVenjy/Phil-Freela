// Messenger-style time dividers in the chat: "—— Tuesday 4:12 AM ——".

// A new divider after an hour with no messages.
const DIVIDER_GAP_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// True when a divider goes above `message`: it's the first message, or it's
// on a new day, or an hour or more has passed since `previous`.
export function needsTimeDivider(previous, message) {
  if (!previous) return true;
  const before = new Date(previous.created_at);
  const now = new Date(message.created_at);
  return now - before >= DIVIDER_GAP_MS || before.toDateString() !== now.toDateString();
}

// Today: "4:12 AM". This week: "Tuesday 4:12 AM".
// Older: "September 23, 2026 4:12 AM".
export function timeDividerLabel(dateString) {
  const date = new Date(dateString);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // Whole days between that day and today (midnight to midnight).
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const startOfThatDay = new Date(date).setHours(0, 0, 0, 0);
  const daysAgo = Math.round((startOfToday - startOfThatDay) / DAY_MS);

  if (daysAgo <= 0) return time;
  if (daysAgo < 7) return `${date.toLocaleDateString("en-US", { weekday: "long" })} ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} ${time}`;
}

// The short time in the top bar's lists (the bell and the chat icon):
// "now", "5m", "3h", "6d", then the date ("Oct 3").
export function shortTimeAgo(dateString) {
  const minutes = Math.floor((Date.now() - new Date(dateString).getTime()) / 60000);
  if (!(minutes >= 1)) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d`;
  return new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
