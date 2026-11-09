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

// The client lets the late freelancer apply to their job posts again.
// Returns "" or a message to show.
export async function allowLateFreelancer(projectId) {
  const { error } = await supabase.rpc("allow_late_freelancer", { target_project: projectId });
  if (error) {
    console.error("Allowing the late freelancer failed:", error);
    return "Couldn't allow it right now. Please try again.";
  }
  return "";
}
