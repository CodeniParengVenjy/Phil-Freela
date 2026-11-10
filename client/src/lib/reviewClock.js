import { supabase } from "./supabaseClient";

// Work the client does not review (database/supabase_auto_accept_schema.sql,
// PLAN-delays.md Step 4): after the freelancer sends the work, the client has 7 days to
// mark it done or ask for changes. On day 6 the client is warned, and on day 7 the
// work is accepted automatically (the project becomes Done and the payment days start).
// Sending the work again after "Ask for changes" starts the 7 days over. The database
// does the accepting at 8:00 AM Philippine time; these only say so on the project page.
// If the database can't answer (for example before that SQL is run), they report
// nothing, so the page shows no notice.

// The same number as the database's daily job ("days_left >= 7" in send_daily_notices),
// so change both together.
export const REVIEW_DAYS = 7;

// The two marks the project page needs: { countedFrom, autoAccepted } or null.
// countedFrom: for work that was already waiting when the rule began, the day its 7 days
// are counted from ("YYYY-MM-DD"); empty for everything else.
export async function getReviewClock(projectId) {
  const { data, error } = await supabase
    .from("projects")
    .select("review_counted_from, auto_accepted")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  return { countedFrom: data.review_counted_from, autoAccepted: Boolean(data.auto_accepted) };
}

// The day the work is accepted if the client says nothing ("YYYY-MM-DD", Philippine
// day): 7 days after the latest sending, or after countedFrom when that is later.
export function reviewDeadline(project, clock) {
  const sentDay = new Date(project.submitted_at).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const from = clock?.countedFrom && clock.countedFrom > sentDay ? clock.countedFrom : sentDay;
  const due = new Date(`${from}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + REVIEW_DAYS);
  return due.toISOString().slice(0, 10);
}
