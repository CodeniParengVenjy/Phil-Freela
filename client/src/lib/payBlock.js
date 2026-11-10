import { listPaymentsOfProjects, payDueInfo, projectMoney } from "./payments";
import { supabase } from "./supabaseClient";

// A client who is late paying a freelancer can't hire or book that freelancer
// again until it is paid, or until the freelancer allows it
// (database/supabase_unpaid_client_block_schema.sql, PLAN-delays.md Step 2). The
// database's Hire and Book rules are what really decide; these only explain it on
// the pages. "Late" is worked out here the same way as in the database (a Done
// project with an agreed one-time price, past its payment day, money still
// unpaid, lib/payments.js payDueInfo). If the database can't answer (for example
// before that SQL is run), they report "nothing owed".

// The signed-in client's late project with this freelancer that the freelancer
// hasn't allowed, or null: { id, title, left, days } (left = what is still
// unpaid, days = how late). If there are several, the one that is the most late.
export async function getOwedProject(freelancerId) {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId || !freelancerId) return null;

  const { data: rows, error } = await supabase
    .from("projects")
    .select("id, title, status, completed_at, agreed_amount, price_basis, price_status, payment_due_override")
    .eq("client_id", userId)
    .eq("freelancer_id", freelancerId)
    .eq("status", "done")
    .eq("price_status", "agreed")
    .eq("price_basis", "project")
    .is("pay_allowed_at", null);
  if (error || !rows?.length) return null;

  const { data: payments } = await listPaymentsOfProjects(rows.map((row) => row.id));
  if (!payments) return null;

  let found = null;
  for (const row of rows) {
    const money = projectMoney(row, payments[row.id] || []);
    const due = payDueInfo(row, money);
    if (due?.late && (!found || due.days > found.days)) {
      found = { id: row.id, title: row.title, left: money.leftForNew, days: due.days };
    }
  }
  return found;
}

// One project's "allowed" mark for its page: { allowedAt } (empty = not allowed),
// or null when it can't be read.
export async function getPayAllowance(projectId) {
  const { data, error } = await supabase
    .from("projects")
    .select("pay_allowed_at")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  return { allowedAt: data.pay_allowed_at };
}

// The freelancer lets the late client hire or book them again. Returns "" or a
// message to show.
export async function allowUnpaidClient(projectId) {
  const { error } = await supabase.rpc("allow_unpaid_client", { target_project: projectId });
  if (error) {
    console.error("Allowing the client failed:", error);
    // P0001 = a problem the database function explains in plain words.
    return error.code === "P0001" ? error.message : "Couldn't allow it right now. Please try again.";
  }
  return "";
}
