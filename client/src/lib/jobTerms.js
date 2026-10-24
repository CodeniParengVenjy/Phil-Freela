import { formatDay, todayInManila } from "./projects";

// The words and rules for a client's job post (PLAN-posting-job.md), shared by
// Post What You Need, Find Jobs, the job's page and the search results so they
// always say the same thing.

// What is being posted (job_posts.job_type), and how its budget can be counted:
// a one-time project has one price for the whole project, an ongoing job is
// paid per day or per month. `budgetTypes` is what the type allows (the database
// refuses any other pair, job_posts_type_budget_check) and `budgetType` is the
// one preselected.
export const JOB_TYPES = [
  { value: "project", label: "One-time Project", short: "Project", icon: "bi-box-seam-fill", hint: "Work with a clear end result, like a logo, a video or a website.", budgetTypes: ["project"], budgetType: "project" },
  { value: "job", label: "Ongoing Job", short: "Job", icon: "bi-calendar2-week-fill", hint: "Regular work over days or months, like a virtual assistant.", budgetTypes: ["day", "month"], budgetType: "month" }
];

// What the budget amount counts (job_posts.budget_type).
export const BUDGET_TYPES = [
  { value: "project", label: "Per project", unit: "per project" },
  { value: "day", label: "Per day", unit: "per day" },
  { value: "month", label: "Per month", unit: "per month" }
];

// The database allows 1 to 10 (job_posts_freelancers_needed_check).
export const MAX_FREELANCERS_NEEDED = 10;

export function getJobType(value) {
  return JOB_TYPES.find((type) => type.value === value) || JOB_TYPES[0];
}

// "₱5,000 per project", or "" when the client gave no amount.
export function budgetText(job) {
  if (!job.budget) return "";
  const unit = BUDGET_TYPES.find((type) => type.value === job.budget_type)?.unit;
  return `₱${Number(job.budget).toLocaleString()}${unit ? ` ${unit}` : ""}`;
}

// "Starts 10/25/2026 • Due 11/15/2026" ("" for a post without dates).
export function datesText(job) {
  const parts = [];
  if (job.start_date) parts.push(`Starts ${formatDay(job.start_date)}`);
  if (job.due_date) parts.push(`Due ${formatDay(job.due_date)}`);
  return parts.join(" • ");
}

// Whether a job post can still be seen and applied to. The same rule as
// job_state() in database/supabase_job_post_details_schema.sql, which is the
// one the database enforces; this copy is only for the badges the owner sees.
//   filled   as many freelancers were hired as the post needed
//   expired  its due date has passed (the day ends at midnight, Philippine time)
// `hired` is how many freelancers were hired from this post so far.
export function jobState(job, hired = 0) {
  if (hired >= job.freelancers_needed) return "filled";
  if (job.due_date && job.due_date < todayInManila()) return "expired";
  return "open";
}

// The label and badge colors for each state.
export const JOB_STATES = {
  open: { label: "Open", className: "bg-success text-white" },
  filled: { label: "Filled", className: "bg-info text-dark" },
  expired: { label: "Expired", className: "bg-secondary text-white" }
};

// How many freelancers were hired from a post. The owner's queries ask for
// `hired:projects(count)`, which comes back as [{ count: 2 }].
export function hiredCount(job) {
  return job.hired?.[0]?.count || 0;
}
