import { supabase } from "./supabaseClient";

// Late freelancers (database/supabase_late_block_schema.sql; the user,
// 2026-11-10): a freelancer who didn't send a client's project by its due date
// can't apply to that client's job posts until the client presses "Allow to
// apply again" on that project. The database's apply rule is what really
// decides; these only explain it on the pages. If the database can't answer
// (for example before that SQL is run), they report "nothing late".

// The signed-in freelancer's late project with this client that still blocks
// them, { id, title, due_date }, or null.
export async function getBlockingLateProject(freelancerId, clientId) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, title, due_date")
    .eq("freelancer_id", freelancerId)
    .eq("client_id", clientId)
    .eq("missed_deadline", true)
    .is("late_allowed_at", null)
    .order("due_date")
    .limit(1);
  if (error || !data?.length) return null;
  return data[0];
}

// One project's lateness for its page: { missed, allowedAt } or null.
export async function getProjectLateness(projectId) {
  const { data, error } = await supabase
    .from("projects")
    .select("missed_deadline, late_allowed_at")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  return { missed: data.missed_deadline, allowedAt: data.late_allowed_at };
}

// The client lets the late freelancer apply to their job posts again (it also
// answers a waiting appeal and tells the freelancer). Returns "" or a message to show.
export async function allowLateFreelancer(projectId) {
  const { error } = await supabase.rpc("allow_late_freelancer", { target_project: projectId });
  if (error) {
    console.error("Allowing the late freelancer failed:", error);
    return "Couldn't allow it right now. Please try again.";
  }
  return "";
}

// ---------------------------------------------------------------------------
// Appeals (PLAN-late-appeals.md, database/supabase_late_appeals_schema.sql; the
// user, 2026-11-24: "add appeal function"). The blocked freelancer appeals to the
// client from the late project's page with a short message; the CLIENT decides:
// Allow (the same as "Allow to apply again") or Decline with an optional reason.
// No admin is involved. The database checks everything again.
// ---------------------------------------------------------------------------

// The limits. The same numbers are in appeal_late_block() and answer_late_appeal()
// in the database, so change them together.
export const APPEAL_MAX = 2;                 // 2 appeals per late project, whatever the answer
export const APPEAL_MIN_LENGTH = 10;
export const APPEAL_MAX_LENGTH = 500;
export const APPEAL_REASON_MAX_LENGTH = 300; // the client's optional reason for declining

// One project's appeals, oldest first, or null when they can't be read (for
// example before that SQL is run).
export async function listLateAppeals(projectId) {
  const { data, error } = await supabase
    .from("late_appeals")
    .select("id, message, status, client_note, created_at, answered_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return error ? null : data;
}

// Each of these returns "" when it worked, or a message to show. P0001 = a
// sentence the database wrote in plain words.
const messageFrom = (error, fallback) => (error.code === "P0001" ? error.message : fallback);

export async function sendLateAppeal(projectId, message) {
  const { error } = await supabase.rpc("appeal_late_block", { target_project: projectId, appeal_message: message.trim() });
  if (error) {
    console.error("Sending the appeal failed:", error);
    return messageFrom(error, "Couldn't send your appeal right now. Please try again.");
  }
  return "";
}

export async function answerLateAppeal(appealId, accept, reason = "") {
  const { error } = await supabase.rpc("answer_late_appeal", {
    target_appeal: appealId,
    accept,
    decline_reason: accept ? null : reason.trim() || null
  });
  if (error) {
    console.error("Answering the appeal failed:", error);
    return messageFrom(error, "Couldn't save your answer right now. Please try again.");
  }
  return "";
}

export async function cancelLateAppeal(appealId) {
  const { error } = await supabase.rpc("cancel_late_appeal", { target_appeal: appealId });
  if (error) {
    console.error("Cancelling the appeal failed:", error);
    return messageFrom(error, "Couldn't cancel the appeal right now. Please try again.");
  }
  return "";
}
