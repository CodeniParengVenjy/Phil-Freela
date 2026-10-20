import { supabase } from "./supabaseClient";
import { removeItemFiles } from "./slides";

// Taking down your own service or job post (PLAN-edit-posts.md, step 2).
// Each function returns "" when it worked, or one plain sentence to show.

// Removes a service. The row goes first (its slides, ratings and search
// numbers go with it); bookings already sent stay, they keep their own copy.
// Then its photos, videos and documents are removed from Storage. The service
// needs its slides and image_url loaded (SLIDES_SELECT) for that last part.
export async function deleteService(service) {
  // .select("id") returns the removed rows, so an empty result means nothing was removed.
  const { data, error } = await supabase.from("services").delete().eq("id", service.id).select("id");
  if (error || !data?.length) return "Couldn't delete that service. Please try again.";

  // If removing the files fails it only leaves unused files behind, so it isn't an error.
  await removeItemFiles(service);
  return "";
}

// How many freelancers applied to a job, for the "N people applied" line in
// the confirm pop-up. null when it couldn't be counted.
export async function countApplicants(jobId) {
  const { count, error } = await supabase
    .from("job_applications")
    .select("id", { count: "exact", head: true })
    .eq("job_post_id", jobId);
  return error ? null : count;
}

// Removes a job post. Its applications go with it; a project already started
// from it keeps going (the project only forgets which job it came from).
export async function deleteJobPost(job) {
  // The resumes sent to this job are private PDFs in Storage. They are removed
  // first, while the applications still prove the job is this client's (a rule
  // in supabase_post_remove_resumes_schema.sql); afterwards nobody could.
  const { data: applications } = await supabase.from("job_applications").select("resume_path").eq("job_post_id", job.id);
  const resumePaths = (applications || []).map((application) => application.resume_path);
  if (resumePaths.length) await supabase.storage.from("resumes").remove(resumePaths);

  const { data, error } = await supabase.from("job_posts").delete().eq("id", job.id).select("id");
  if (error || !data?.length) return "Couldn't delete that job post. Please try again.";
  return "";
}
