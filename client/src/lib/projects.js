import { supabase } from "./supabaseClient";

// Projects, see database/supabase_projects_schema.sql. A project is made when
// a client hires someone who applied to their job (Projects & Resumes > Hire).
// Feature 5, Profile transparency and transaction history: a project that
// both sides confirm as Done is the "completed transaction" (no money).
// The browser can only READ projects. Every change goes through a database
// function that checks who is asking and what status the project is in.
export const MAX_PROJECT_NOTE_LENGTH = 1000;

// The name and picture of both people on a project.
const PEOPLE_FIELDS =
  "client:profiles!projects_client_id_fkey(id, full_name, username, avatar_path), " +
  "freelancer:profiles!projects_freelancer_id_fkey(id, full_name, username, avatar_path)";

// The label and badge colors for each status.
export const projectStatuses = {
  started: { label: "Started", className: "bg-warning text-dark" },
  submitted: { label: "Submitted", className: "bg-info text-dark" },
  done: { label: "Done", className: "bg-success text-white" }
};

// Today in the Philippines as "YYYY-MM-DD" (the format a date box uses).
// The database checks the due date against the same Philippine date.
export function todayInManila() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

// Shows a "YYYY-MM-DD" date in the user's own format. The added time keeps
// it on the right day (a bare date is read as UTC and can slip back a day).
export function formatDay(day) {
  return day ? new Date(`${day}T00:00:00`).toLocaleDateString() : "";
}

// A person's display name.
export function personName(person, fallback) {
  return person?.full_name || person?.username || fallback;
}

// Hires an applicant. Returns { projectId }, or { error } with a message.
export async function hireApplicant(applicationId, note, dueDate) {
  if (!dueDate) return { error: "Please pick a due date." };
  if (dueDate < todayInManila()) return { error: "The due date can't be in the past." };
  if (note.length > MAX_PROJECT_NOTE_LENGTH) return { error: `The note can be up to ${MAX_PROJECT_NOTE_LENGTH} characters.` };

  const { data, error } = await supabase.rpc("hire_applicant", {
    target_application: applicationId,
    project_note: note.trim() || null,
    project_due_date: dueDate
  });
  if (error) {
    // P0001 = a problem the database function explains in plain words
    // (not the job's client, already hired, date in the past...).
    if (error.code === "P0001") return { error: error.message };
    // Two Hire clicks at once: the second one hits the "one project per
    // application" rule.
    if (error.code === "23505") return { error: "You already hired this freelancer for this job." };
    console.error("Hiring failed:", error);
    return { error: "Couldn't hire this freelancer. Please try again." };
  }
  return { projectId: data };
}

// The signed-in user's projects on their current side: the jobs they were
// hired for (freelancer) or the freelancers they hired (client). Newest first.
export function getMyProjects(userId, asFreelancer) {
  return supabase
    .from("projects")
    .select(`id, title, status, started_at, due_date, ${PEOPLE_FIELDS}`)
    .eq(asFreelancer ? "freelancer_id" : "client_id", userId)
    .order("started_at", { ascending: false });
}

// One project, or null when it doesn't exist or isn't the user's.
export async function getProject(projectId) {
  const { data } = await supabase
    .from("projects")
    .select(`id, title, note, status, started_at, due_date, completed_at, job_post_id, client_id, freelancer_id, ${PEOPLE_FIELDS}`)
    .eq("id", projectId)
    .maybeSingle();
  return data;
}
