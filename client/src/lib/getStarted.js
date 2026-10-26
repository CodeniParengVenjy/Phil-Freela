import { supabase } from "./supabaseClient";
import { fetchDescription, fetchSkills } from "./profile";
import { fetchIsVerified, fetchLatestVerification } from "./verification";

// The "Get started" card on the dashboard home (components/GetStartedCard.jsx):
// a short checklist that tells a new user what to do next. Nothing is saved for
// it. Every step is worked out from what the person already has, so it ticks
// itself, and the card goes away once everything is done.

// One step: where its button goes, and whether it is done.
//   done:    true when the person already has it
//   waiting: true when they did their part and an admin must act (ID review),
//            so the card shows it but never makes it the "next" step
const step = (key, title, hint, to, button, done, waiting = false) => ({ key, title, hint, to, button, done, waiting });

// How many rows a person has in a table (null if it couldn't be counted).
// head: true = just the count, no rows. Row rules let people count only their own.
async function countOf(query) {
  const { count, error } = await query;
  return error ? null : count || 0;
}
const countMine = (table, column, userId) =>
  countOf(supabase.from(table).select("id", { count: "exact", head: true }).eq(column, userId));

// What each role can't do until the ID is approved (the database refuses it):
// freelancers can't post services or apply to jobs, clients can't post projects.
const VERIFY_WORDS = {
  freelancer: {
    hint: "Needed to post services and apply to jobs.",
    waiting: "An admin will check it soon. Until then you can't post services or apply to jobs."
  },
  client: {
    hint: "Needed to post a project. Freelancers trust a verified client more, too.",
    waiting: "An admin will check it soon. Until then you can't post a project, but you can message freelancers and book their services."
  }
};

// The ID check: not sent yet, waiting for an admin, or sent back.
function verifyStep(accountType, verified, latest) {
  const words = VERIFY_WORDS[accountType];
  const status = latest.data?.status ?? "none";
  if (status === "pending") {
    return step("verify", "Your ID is waiting for review", words.waiting, "/dashboard/verify-identity", "View status", verified, true);
  }
  if (status === "rejected" && !verified) {
    return step("verify", "Your ID was not approved", "Send it again, with a clear photo of your ID.", "/dashboard/verify-identity", "Try again", false);
  }
  return step("verify", "Verify your identity", words.hint, "/dashboard/verify-identity", "Verify now", verified);
}

// The steps for this person's role, in the order to do them, or null when
// something couldn't be loaded (the card then stays hidden instead of asking
// for things the person may already have done).
export async function fetchGetStartedSteps(userId, accountType) {
  if (accountType === "freelancer") {
    const [verified, latest, description, skills, portfolio, services] = await Promise.all([
      fetchIsVerified(userId),
      fetchLatestVerification(userId),
      fetchDescription(userId),
      fetchSkills(userId),
      countMine("portfolio_items", "freelancer_id", userId),
      countMine("services", "freelancer_id", userId)
    ]);
    if (latest.error || description === null || skills === null || portfolio === null || services === null) return null;

    return [
      verifyStep(accountType, verified, latest),
      step("description", "Write a short description about yourself", "Clients and the AI use it to match you with work.", "/dashboard/settings", "Add description", description.trim() !== ""),
      step("skills", "Add your skills", "They show on your profile and help the AI match you with jobs.", "/dashboard/profile", "Add skills", skills.length > 0),
      step("portfolio", "Add a piece of your work to your portfolio", "Clients choose freelancers by their past work.", "/dashboard/profile", "Add work", portfolio > 0),
      step("service", "Post your first service", "A service is what clients book from you.", "/dashboard/services", "Post a service", services > 0)
    ];
  }

  // A client: verify (needed to post), tell about yourself, then do one real
  // thing (post, chat or book).
  const [verified, latest, description, posts, chats, bookings] = await Promise.all([
    fetchIsVerified(userId),
    fetchLatestVerification(userId),
    fetchDescription(userId),
    countMine("job_posts", "client_id", userId),
    countOf(supabase.from("conversations").select("id", { count: "exact", head: true }).or(`user_a.eq.${userId},user_b.eq.${userId}`)),
    countMine("bookings", "client_id", userId)
  ]);
  if (latest.error || description === null || posts === null || chats === null || bookings === null) return null;

  return [
    verifyStep(accountType, verified, latest),
    step("description", "Write a short description about yourself", "It helps the AI recommend freelancers that fit what you need.", "/dashboard/settings", "Add description", description.trim() !== ""),
    step("first", "Post a project, or message a freelancer", "Tell freelancers what you need, or open a service below and message the person.", "/dashboard/post-need", "Post a Project", posts + chats + bookings > 0)
  ];
}
