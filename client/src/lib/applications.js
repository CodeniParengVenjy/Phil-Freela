import { supabase } from "./supabaseClient";

// Job applications (Find Jobs > a job > "Send your resume"), see
// database/supabase_applications_schema.sql. The PDF resumes are in the
// PRIVATE "resumes" bucket: only the freelancer and that job's client can
// open one (Data Privacy Act, RA 10173: a resume is personal data).
const BUCKET = "resumes";
const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_NOTE_LENGTH = 1000;

// The job details shown with an application.
const JOB_FIELDS = "id, title, client_id, client:profiles!job_posts_client_id_fkey(id, full_name, username)";

// The project made when the client hired this applicant (null = not hired).
// One application has at most one project, so it comes back as one object.
const PROJECT_FIELD = "project:projects(id, status)";

// Checks a picked resume. Returns "" when it's fine, or a message to show.
// Besides the name and type the browser reports, it reads the file's first
// bytes: every real PDF starts with "%PDF-", so a renamed file is refused.
export async function checkResumeFile(file) {
  if (!file) return "Please attach your resume as a PDF.";
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) return "Your resume must be a PDF file.";
  if (file.size > MAX_RESUME_BYTES) return "Your resume must be 5 MB or smaller.";
  if ((await file.slice(0, 5).text()) !== "%PDF-") return "That file isn't a real PDF. Please export your resume as a PDF.";
  return "";
}

// Sends an application. Returns {} when sent, or { error } with a message.
export async function applyToJob(freelancerId, jobPostId, file, note) {
  const problem = await checkResumeFile(file);
  if (problem) return { error: problem };

  // A new file name for every attempt, so a failed or repeated try can never
  // overwrite a resume that was already sent.
  const path = `${freelancerId}/${jobPostId}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf" });
  if (uploadError) {
    console.error("Resume upload failed:", uploadError);
    return { error: "Couldn't upload your resume. Please try again." };
  }

  const { error } = await supabase.from("job_applications").insert({
    job_post_id: jobPostId,
    freelancer_id: freelancerId,
    resume_path: path,
    cover_note: note.trim() || null
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]); // don't leave an unused file behind
    if (error.code === "23505") return { error: "You already applied to this job." };
    // The database rules refused it: not verified, blocked, or their own job.
    if (error.code === "42501") return { error: "Only verified freelancers can apply to jobs." };
    console.error("Saving the application failed:", error);
    return { error: "Couldn't send your application. Please try again." };
  }
  return {};
}

// The signed-in freelancer's application for one job, or null.
export async function getMyApplicationForJob(freelancerId, jobPostId) {
  const { data } = await supabase
    .from("job_applications")
    .select(`id, resume_path, cover_note, created_at, ${PROJECT_FIELD}`)
    .eq("freelancer_id", freelancerId)
    .eq("job_post_id", jobPostId)
    .maybeSingle();
  return data;
}

// "My Applications" for a freelancer, newest first.
export function getMyApplications(freelancerId) {
  return supabase
    .from("job_applications")
    .select(`id, resume_path, cover_note, created_at, ${PROJECT_FIELD}, job:job_posts(${JOB_FIELDS})`)
    .eq("freelancer_id", freelancerId)
    .order("created_at", { ascending: false });
}

// Everyone who applied to this client's job posts, newest first. The job's
// due date comes along so the Hire popup can start with it.
export function getApplicantsForMyJobs(clientId) {
  return supabase
    .from("job_applications")
    .select(`id, resume_path, cover_note, created_at, ${PROJECT_FIELD}, job:job_posts!inner(id, title, client_id, due_date), freelancer:profiles(id, full_name, username, avatar_path)`)
    .eq("job.client_id", clientId)
    .order("created_at", { ascending: false });
}

// Opens a resume in a new tab through a link that stops working after 60
// seconds, so a copied link can't be passed around. Returns "" or a message.
export async function openResume(resumePath) {
  // Open the tab right away (browsers block tabs opened after a wait), then
  // point it at the resume once the link is ready.
  const tab = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(resumePath, 60);
  if (error || !data?.signedUrl) {
    tab?.close();
    return "Couldn't open that resume. Please try again.";
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
  return "";
}

// Withdraws an application and deletes its resume. Returns "" or a message.
export async function withdrawApplication(application) {
  // .select("id") returns the deleted row, so an empty result means nothing was deleted.
  const { data, error } = await supabase.from("job_applications").delete().eq("id", application.id).select("id");
  if (error || !data?.length) return "Couldn't withdraw your application. Please try again.";
  // If this fails it only leaves an unused file behind, so it isn't an error.
  await supabase.storage.from(BUCKET).remove([application.resume_path]);
  return "";
}
