import { paymentDueDate, projectMoney } from "./payments";
import { todayInManila } from "./projects";
import { supabase } from "./supabaseClient";

// Asking for more time (PLAN-delay-requests.md, database/supabase_delay_requests_schema.sql).
// The one who owes asks the other for more days:
//   - the freelancer asks for more time to SEND the work ("work", the client answers)
//   - the client asks for more time to PAY ("payment", the freelancer answers)
// Accepting moves the date, declining leaves it. The database decides everything
// (who may ask, the limits, the new date); these helpers only explain it on the page.
// If the database can't answer (for example before that SQL is run), they show nothing.

// The limits. The same numbers are in request_delay() in the database, so change
// them together.
export const DELAY_MAX_DAYS = 7;        // up to 7 more days than the current date, each time
export const DELAY_MAX_REQUESTS = 2;    // 2 requests per project for each kind, whatever the answer
export const MAX_DELAY_REASON_LENGTH = 300;

// A "YYYY-MM-DD" day plus some days (read as UTC, so the computer's time zone can't shift it).
export function addDays(day, count) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

// The words for each kind: "ask for more time to ___".
export const delayWhat = (kind) => (kind === "work" ? "send the work" : "pay");

// One project's requests, oldest first, or null when they can't be read.
export async function listDelayRequests(projectId) {
  const { data, error } = await supabase
    .from("delay_requests")
    .select("id, kind, asked_by, from_date, to_date, reason, status, created_at, answered_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return error ? null : data;
}

// Each of these returns "" when it worked, or a message to show. P0001 = a
// sentence the database wrote in plain words.
const messageFrom = (error, fallback) => (error.code === "P0001" ? error.message : fallback);

export async function requestDelay(projectId, kind, newDate, reason) {
  const { error } = await supabase.rpc("request_delay", {
    target_project: projectId,
    delay_kind: kind,
    new_date: newDate,
    delay_reason: reason.trim()
  });
  if (error) {
    console.error("Asking for more time failed:", error);
    return messageFrom(error, "Couldn't send your request right now. Please try again.");
  }
  return "";
}

export async function answerDelay(requestId, accept) {
  const { error } = await supabase.rpc("answer_delay", { target_request: requestId, accept });
  if (error) {
    console.error("Answering the request failed:", error);
    return messageFrom(error, "Couldn't save your answer right now. Please try again.");
  }
  return "";
}

export async function cancelDelayRequest(requestId) {
  const { error } = await supabase.rpc("cancel_delay_request", { target_request: requestId });
  if (error) {
    console.error("Cancelling the request failed:", error);
    return messageFrom(error, "Couldn't cancel the request right now. Please try again.");
  }
  return "";
}

// What the signed-in person can do about delays on this project, or null when they
// aren't one of its two people.
//   requests: from listDelayRequests; payments: the project's payments (null while loading)
// Gives back
//   myKind        what they may ask for ("work" for the freelancer, "payment" for the client)
//   currentDay    the date that request would move ("" when it doesn't matter now)
//   canAsk        they may ask now (nothing waiting, requests left, on or before the date)
//   left          how many of their 2 requests are left
//   minDay/maxDay the days the date box allows
//   myPending     their own request still waiting for an answer
//   waitingForMe  the other person's request they can accept or decline
//   history       the answered and cancelled ones
// A waiting request that no longer matters (the work was sent, the money was paid,
// the new day has passed) is not shown, and the database refuses to accept it.
export function delayView({ project, requests, payments, userId, today = todayInManila() }) {
  const iAmFreelancer = project.freelancer_id === userId;
  if (!iAmFreelancer && project.client_id !== userId) return null;
  const myKind = iAmFreelancer ? "work" : "payment";
  const theirKind = iAmFreelancer ? "payment" : "work";
  const money = projectMoney(project, payments);

  // The date each kind of request would move, "" when it doesn't matter now.
  const dayOf = (kind) => {
    if (kind === "work") return project.status === "started" ? project.due_date || "" : "";
    return money && money.leftForNew > 0 ? paymentDueDate(project) : "";
  };
  const stillMatters = (request) => request.status === "pending" && request.from_date === dayOf(request.kind) && request.to_date >= today;

  const mine = requests.filter((request) => request.kind === myKind && request.asked_by === userId);
  const currentDay = dayOf(myKind);
  const canAsk =
    Boolean(currentDay) &&
    today <= currentDay &&
    !mine.some((request) => request.status === "pending") &&
    mine.length < DELAY_MAX_REQUESTS;

  return {
    myKind,
    currentDay,
    canAsk,
    left: DELAY_MAX_REQUESTS - mine.length,
    minDay: currentDay ? addDays(currentDay, 1) : "",
    maxDay: currentDay ? addDays(currentDay, DELAY_MAX_DAYS) : "",
    myPending: mine.find(stillMatters) || null,
    waitingForMe: requests.find((request) => request.kind === theirKind && stillMatters(request)) || null,
    history: requests.filter((request) => request.status !== "pending")
  };
}
