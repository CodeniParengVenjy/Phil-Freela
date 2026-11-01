import { supabase } from "./supabaseClient";
import { checkResume } from "./aiService";
import { shrinkImage } from "./shrinkImage";

// Job applications (Find Jobs > a job > "Send your resume"), see
// database/supabase_applications_schema.sql. The resumes (a PDF, a Word file or
// a picture, see supabase_resume_formats_schema.sql) are in the PRIVATE
// "resumes" bucket: only the freelancer and that job's client can open one
// (Data Privacy Act, RA 10173: a resume is personal data).
const BUCKET = "resumes";
// 4 MB, not 5: the resume check sends the file to the AI service on Vercel,
// which takes 4.5 MB per request.
const MAX_RESUME_BYTES = 4 * 1024 * 1024;
const NOT_A_RESUME = "This doesn't look like a resume. A resume lists your experience, education and skills. Please choose your resume.";
// A picture can be bigger than that when it is picked (a phone photo is often 5
// to 12 MB): it is shrunk before it is sent, so this only stops a file too big
// to open at all.
const MAX_PICTURE_BYTES = 30 * 1024 * 1024;
// A resume picture is shrunk to this many pixels on its longest side. Smaller
// than that and the small print of a resume can't be read.
const RESUME_PICTURE_SIDE = 2000;
export const MAX_NOTE_LENGTH = 1000;

const WORD_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// The three kinds of resume file. "ending" is how the saved name ends and "type"
// is what Storage is told; both are the only ones the database allows. Every
// picture (JPG, PNG or WebP) is saved as a JPEG.
const KINDS = {
  pdf: { ending: "pdf", type: "application/pdf", icon: "bi-file-earmark-pdf" },
  word: { ending: "docx", type: WORD_TYPE, icon: "bi-file-earmark-word" },
  picture: { ending: "jpg", type: "image/jpeg", icon: "bi-file-earmark-image" }
};

// What the file picker offers. The file's first bytes are checked again once it
// is chosen, because the picker's list is only a hint.
export const RESUME_ACCEPT = `.pdf,.docx,.jpg,.jpeg,.png,.webp,application/pdf,${WORD_TYPE},image/jpeg,image/png,image/webp`;

// The icon for a resume's button, by the ending of its saved name.
export function resumeIcon(resumePath) {
  const ending = resumePath.split(".").pop();
  return (Object.values(KINDS).find((kind) => kind.ending === ending) || KINDS.pdf).icon;
}

// The job details shown with an application.
const JOB_FIELDS = "id, title, client_id, client:profiles!job_posts_client_id_fkey(id, full_name, username)";

// The project made when the client hired this applicant (null = not hired).
// One application has at most one project, so it comes back as one object.
const PROJECT_FIELD = "project:projects(id, status)";

// What a file really is, read from its first bytes and not from its name:
// "pdf", "picture", "zip" (a Word file is a zip, so this only says "zip"), or ""
// for anything else.
async function realKind(file) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const starts = (...values) => values.every((value, index) => bytes[index] === value);
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf"; // "%PDF-"
  if (starts(0x50, 0x4b, 0x03, 0x04)) return "zip"; // "PK"
  if (starts(0xff, 0xd8, 0xff)) return "picture"; // JPEG
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "picture"; // PNG
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "picture"; // "RIFF....WEBP"
  return "";
}

// Checks a picked resume. Returns { kind } ("pdf", "word" or "picture") when
// it's fine, or { error } with a message to show. The kind comes from the
// file's first bytes, so a renamed file is refused; only a Word file also needs
// the .docx name, because any zip starts the same way.
export async function checkResumeFile(file) {
  if (!file) return { error: "Please attach your resume (a PDF, a Word file or a picture)." };
  if (file.size === 0) return { error: "That file is empty. Please choose your resume." };

  const found = await realKind(file);
  const name = file.name.toLowerCase();
  let kind = "";
  if (found === "pdf" || found === "picture") kind = found;
  else if (found === "zip" && name.endsWith(".docx")) kind = "word";

  if (!kind) {
    // The usual mistakes get a message that says what to do.
    if (name.endsWith(".doc")) return { error: "Old Word files (.doc) can't be used. Please save your resume as a PDF or DOCX." };
    if (name.endsWith(".heic") || name.endsWith(".heif")) return { error: "HEIC pictures can't be used. Please send a JPG or PNG picture, or a PDF." };
    if (name.endsWith(".pdf")) return { error: "That file isn't a real PDF. Please export your resume as a PDF." };
    if (name.endsWith(".docx")) return { error: "That file isn't a real Word file. Please save your resume as a DOCX again." };
    return { error: "Your resume must be a PDF, a Word file (.docx) or a picture (JPG, PNG or WebP)." };
  }
  if (kind === "picture" && file.size > MAX_PICTURE_BYTES) return { error: "That picture is too big. Please send a smaller one." };
  if (kind !== "picture" && file.size > MAX_RESUME_BYTES) return { error: "Your resume must be 4 MB or smaller." };
  return { kind };
}

// Sends an application. Returns {} when sent, or { error } with a message.
export async function applyToJob(freelancerId, jobPostId, file, note, onChecking) {
  const { kind, error: problem } = await checkResumeFile(file);
  if (problem) return { error: problem };

  // A picture is shrunk and saved as a JPEG (a phone photo is often over 4 MB).
  // This comes BEFORE the check, so the AI reads the same small, upright
  // picture that will be saved, and it travels faster.
  let upload = file;
  if (kind === "picture") {
    try {
      upload = await shrinkImage(file, RESUME_PICTURE_SIDE);
    } catch (error) {
      return { error: error.message };
    }
    if (upload.size > MAX_RESUME_BYTES) return { error: "That picture is too big. Please send a smaller one." };
  }

  // Does it look like a resume? (the AI service, ai-service/resume_check.py;
  // it reads the words of a PDF or Word file, and of a picture or a scanned
  // PDF). Only a clear "no" stops the application. "Not sure", and no answer
  // at all (the AI service is off or slow), go on, so the check can never be
  // the reason an application can't be sent. onChecking(true / false) lets the
  // button say "Checking...".
  onChecking?.(true);
  const answer = await checkResume(upload);
  onChecking?.(false);
  if (answer?.verdict === "no") return { error: answer.message || NOT_A_RESUME };

  // A new file name for every attempt, so a failed or repeated try can never
  // overwrite a resume that was already sent.
  const { ending, type } = KINDS[kind];
  const path = `${freelancerId}/${jobPostId}-${Date.now()}.${ending}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, upload, { contentType: type });
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
// due date and budget come along so the Hire popup can start with the date and
// say what the project's price will be.
export function getApplicantsForMyJobs(clientId) {
  return supabase
    .from("job_applications")
    .select(`id, resume_path, cover_note, created_at, ${PROJECT_FIELD}, job:job_posts!inner(id, title, client_id, due_date, budget, budget_type), freelancer:profiles(id, full_name, username, avatar_path)`)
    .eq("job.client_id", clientId)
    .order("created_at", { ascending: false });
}

// Opens a resume through a link that stops working after 60 seconds, so a
// copied link can't be passed around. A PDF or a picture opens in a new tab. A
// Word file can't be shown in a tab, so it is downloaded (named after its
// owner) and the page stays where it is. Returns "" or a message.
export async function openResume(resumePath, ownerName = "") {
  const isWord = resumePath.endsWith(".docx");
  // Open the tab right away (browsers block tabs opened after a wait), then
  // point it at the resume once the link is ready.
  const tab = isWord ? null : window.open("", "_blank");
  const downloadAs = { download: ownerName ? `${ownerName} - resume.docx` : "resume.docx" };
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(resumePath, 60, isWord ? downloadAs : undefined);
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
