import { supabase } from "./supabaseClient";

// Projects, see database/supabase_projects_schema.sql. A project is made when
// a client hires someone who applied to their job (Projects & Resumes > Hire).
// Feature 5, Profile transparency and transaction history: a project that
// both sides confirm as Done is the "completed transaction" (no money).
// The browser can only READ projects. Every change goes through a database
// function that checks who is asking and what status the project is in.
export const MAX_PROJECT_NOTE_LENGTH = 1000;

// The freelancer's submitted work (Step 3), in the private "deliverables"
// bucket. Only the project's client and freelancer can open one.
const DELIVERABLES_BUCKET = "deliverables";
const MAX_DELIVERABLE_BYTES = 50 * 1024 * 1024;
export const MAX_SUBMISSION_MESSAGE_LENGTH = 1000;

// Allowed file types: extension -> { mime, magicBytes }. magicBytes lists
// every way a real file of that type can start (like the resume's "%PDF-"
// check); it's left out for video, since container formats vary too much
// to check this simply.
const DELIVERABLE_TYPES = {
  mp4: { mime: "video/mp4" },
  webm: { mime: "video/webm" },
  mov: { mime: "video/quicktime" },
  jpg: { mime: "image/jpeg", magicBytes: [[0xff, 0xd8, 0xff]] },
  jpeg: { mime: "image/jpeg", magicBytes: [[0xff, 0xd8, 0xff]] },
  png: { mime: "image/png", magicBytes: [[0x89, 0x50, 0x4e, 0x47]] },
  webp: { mime: "image/webp" },
  pdf: { mime: "application/pdf", magicBytes: [[0x25, 0x50, 0x44, 0x46]] }, // "%PDF"
  zip: { mime: "application/zip", magicBytes: [[0x50, 0x4b, 0x03, 0x04]] }, // "PK\x03\x04"
  // A Blender file (3D modeling) starts with "BLENDER". One saved with
  // Blender's Compress option starts with the Zstandard signature instead
  // (gzip before Blender 3.0); the browser can't look inside those, so any
  // file compressed that way and named .blend gets through this check.
  blend: {
    mime: "application/x-blender",
    magicBytes: [
      [0x42, 0x4c, 0x45, 0x4e, 0x44, 0x45, 0x52], // "BLENDER"
      [0x28, 0xb5, 0x2f, 0xfd], // Zstandard
      [0x1f, 0x8b] // gzip
    ]
  }
};

// What a submitted file is, by its extension. A "video" or an "image" can be
// shown right on the Project page; anything else ("file": PDF, ZIP, Blender)
// is only opened with View.
export function deliverableKind(path) {
  const ext = path?.split(".").pop()?.toLowerCase();
  if (["mp4", "webm", "mov"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return "image";
  return "file";
}

// The icon shown for a submitted file, by its extension.
export function deliverableIcon(path) {
  const kind = deliverableKind(path);
  const ext = path?.split(".").pop()?.toLowerCase();
  if (kind === "video") return "bi-camera-reels-fill";
  if (kind === "image") return "bi-image-fill";
  if (ext === "pdf") return "bi-file-earmark-pdf-fill";
  if (ext === "zip") return "bi-file-earmark-zip-fill";
  if (ext === "blend") return "bi-box-fill";
  return "bi-file-earmark-fill";
}

// Checks a picked deliverable. Returns "" when it's fine, or a message to
// show. Besides the size and the extension, it reads the file's first
// bytes for types with a known signature, so a renamed file is refused.
export async function checkDeliverable(file) {
  if (!file) return "";
  const ext = file.name.split(".").pop()?.toLowerCase();
  const type = DELIVERABLE_TYPES[ext];
  if (!type) return "That file type isn't supported. Use MP4, WebM, MOV, JPG, PNG, WebP, PDF, ZIP or BLEND.";
  if (file.size > MAX_DELIVERABLE_BYTES) return "Your file must be 50 MB or smaller.";
  if (type.magicBytes) {
    const longest = Math.max(...type.magicBytes.map((start) => start.length));
    const header = new Uint8Array(await file.slice(0, longest).arrayBuffer());
    const matches = type.magicBytes.some((start) => start.every((byte, i) => header[i] === byte));
    if (!matches) return "That file doesn't look like a real ." + ext + " file.";
  }
  return "";
}

// True for a submitted Blender file (the Project page adds a note to it).
export const isBlenderFile = (path) => /\.blend$/i.test(path || "");

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
// "ratings" is who rated each project, for the rating step beside a Done
// project's status (ratingStep below). Ratings are blind, so the database
// only lists the user's own rating, and the other person's once it is visible.
export function getMyProjects(userId, asFreelancer) {
  return supabase
    .from("projects")
    .select(`id, title, status, started_at, due_date, completed_at, ratings:project_ratings(rater_id), ${PEOPLE_FIELDS}`)
    .eq(asFreelancer ? "freelancer_id" : "client_id", userId)
    .order("started_at", { ascending: false });
}

// One project, or null when it doesn't exist or isn't the user's.
export async function getProject(projectId) {
  const { data } = await supabase
    .from("projects")
    .select(`id, title, note, status, started_at, due_date, completed_at,
      submission_path, submission_link, submission_message, submitted_at,
      job_post_id, client_id, freelancer_id, ${PEOPLE_FIELDS}`)
    .eq("id", projectId)
    .maybeSingle();
  return data;
}

// "Attach your files". Uploads the file (if any), then calls the database
// function that records it and moves the project to Submitted. Returns {}
// when sent, or { error } with a message.
export async function submitProject(freelancerId, projectId, file, link, message) {
  const problem = await checkDeliverable(file);
  if (problem) return { error: problem };
  if (!file && !link.trim()) return { error: "Attach a file or paste a link." };
  if (link.trim() && !/^https:\/\//i.test(link.trim())) return { error: "The link must start with https://." };
  if (message.length > MAX_SUBMISSION_MESSAGE_LENGTH) return { error: `Your message can be up to ${MAX_SUBMISSION_MESSAGE_LENGTH} characters.` };

  // A new file name for every attempt, like resumes: a failed or repeated
  // try can never overwrite work that was already sent.
  let path = null;
  if (file) {
    const ext = file.name.split(".").pop().toLowerCase();
    path = `${freelancerId}/${projectId}-${Date.now()}.${ext}`;
    // Sent with the type from our own list, not the browser's: a browser
    // gives a .blend no type at all (and can name a .zip differently), and
    // the bucket only takes the types it knows. slice() doesn't copy the file.
    const typedFile = file.slice(0, file.size, DELIVERABLE_TYPES[ext].mime);
    const { error: uploadError } = await supabase.storage.from(DELIVERABLES_BUCKET).upload(path, typedFile);
    if (uploadError) {
      console.error("Deliverable upload failed:", uploadError);
      return { error: "Couldn't upload your file. Please try again." };
    }
  }

  const { error } = await supabase.rpc("submit_project", {
    target_project: projectId,
    file_path: path,
    deliverable_link: link.trim() || null,
    deliverable_message: message.trim() || null
  });
  if (error) {
    if (path) await supabase.storage.from(DELIVERABLES_BUCKET).remove([path]); // don't leave an unused file behind
    if (error.code === "P0001") return { error: error.message };
    console.error("Submitting the project failed:", error);
    return { error: "Couldn't submit your work. Please try again." };
  }
  return {};
}

// How long the link behind the Project page's video player or photo lasts.
// A video keeps loading while it plays, so it needs more than View's 60
// seconds.
const PLAYER_LINK_SECONDS = 60 * 60;

// A private link to a submitted video or photo, for showing it on the
// Project page. Only the project's client and freelancer can get one (the
// "deliverables" bucket rules); it is never shown on the page and stops
// working after an hour. Returns the link, or null when it couldn't be made.
export async function getDeliverableLink(path) {
  const { data, error } = await supabase.storage.from(DELIVERABLES_BUCKET).createSignedUrl(path, PLAYER_LINK_SECONDS);
  return error ? null : data?.signedUrl || null;
}

// Opens a submitted deliverable in a new tab through a link that stops
// working after 60 seconds, like a resume. Returns "" or a message.
export async function openDeliverable(path) {
  const tab = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(DELIVERABLES_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    tab?.close();
    return "Couldn't open that file. Please try again.";
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
  return "";
}

// The client confirms the work is done. Returns "" or a message.
export async function markProjectDone(projectId) {
  const { error } = await supabase.rpc("mark_project_done", { target_project: projectId });
  if (error) return error.code === "P0001" ? error.message : "Couldn't mark this project as done. Please try again.";
  return "";
}

// The client sends the work back for changes. Returns "" or a message.
export async function requestProjectChanges(projectId) {
  const { error } = await supabase.rpc("request_project_changes", { target_project: projectId });
  if (error) return error.code === "P0001" ? error.message : "Couldn't request changes. Please try again.";
  return "";
}

// Ratings and feedback (Step 4), once a project is Done. Screen 4 (the
// client rates the freelancer) sends feedback too; screen 5 (the freelancer
// rates the client) is trust stars only, so feedback stays null for them.
// A rating can't be edited once sent (no update rule in the database).
//
// Ratings are blind (database/supabase_blind_ratings_schema.sql): a rating
// stays hidden from everyone but the person who gave it until both sides
// have rated, or until the time for rating is over. The database does the
// hiding; the pages here only explain it.
export const MAX_FEEDBACK_LENGTH = 1000;

// How many days each side has to rate after the project is marked Done.
// The database enforces the same number (rating_window() in that file).
export const RATING_WINDOW_DAYS = 14;

// When rating closes for a Done project, or null if it isn't Done:
//   day    the date it closes, like "October 21"
//   ended  true once that moment has passed
export function ratingDeadline(project) {
  if (!project?.completed_at) return null;
  const closesAt = new Date(new Date(project.completed_at).getTime() + RATING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    day: closesAt.toLocaleDateString(undefined, { month: "long", day: "numeric" }),
    ended: closesAt <= new Date()
  };
}

// The rating step of a Done project in a few words, shown beside its status
// (the Status box on the project page, and each card in My Projects). It is
// worked out only from what the signed-in user is allowed to know, so it
// never gives away whether the other person has rated yet:
//   iRated     they sent their own rating
//   seeTheirs  the database handed over the other person's rating (it only
//              does once both have rated, or the time for rating is over)
// Returns { label, icon, badgeClass, textClass }, or null when the project
// isn't Done.
export function ratingStep(project, iRated, seeTheirs) {
  const deadline = project?.status === "done" ? ratingDeadline(project) : null;
  if (!deadline) return null;
  if (iRated && seeTheirs) {
    return { label: "Both rated: ratings are shown", icon: "bi-eye-fill", badgeClass: "bg-success text-white", textClass: "text-success" };
  }
  if (deadline.ended) {
    return { label: "Rating closed", icon: "bi-lock-fill", badgeClass: "bg-secondary text-white", textClass: "text-secondary" };
  }
  if (iRated) {
    return { label: "Blind rating: yours is hidden for now", icon: "bi-eye-slash-fill", badgeClass: "bg-info text-dark", textClass: "text-info" };
  }
  return { label: "Blind rating: waiting for your rating", icon: "bi-eye-slash-fill", badgeClass: "bg-warning text-dark", textClass: "text-warning" };
}

// Sends a rating. Returns {} when sent, or { error } with a message.
export async function rateProject(raterId, projectId, rateeId, stars, feedback) {
  if (!stars || stars < 1 || stars > 5) return { error: "Pick 1 to 5 stars." };
  if (feedback && feedback.length > MAX_FEEDBACK_LENGTH) return { error: `Your feedback can be up to ${MAX_FEEDBACK_LENGTH} characters.` };

  const { error } = await supabase.from("project_ratings").insert({
    project_id: projectId,
    rater_id: raterId,
    ratee_id: rateeId,
    stars,
    feedback: feedback?.trim() || null
  });
  if (error) {
    if (error.code === "23505") return { error: "You already rated this project." };
    // The database rules refused it: not Done yet, not your project, or
    // the time for rating is over.
    if (error.code === "42501") return { error: `You can only rate a project once it's done, and within ${RATING_WINDOW_DAYS} days after that.` };
    console.error("Sending the rating failed:", error);
    return { error: "Couldn't send your rating. Please try again." };
  }
  return {};
}

// The signed-in user's own rating for a project, or null if they haven't
// rated it yet.
export async function getMyRating(raterId, projectId) {
  const { data } = await supabase
    .from("project_ratings")
    .select("stars, feedback, created_at")
    .eq("rater_id", raterId)
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}

// The other person's rating of the signed-in user for a project, or null.
// Blind ratings: the database only hands it over once it is visible (both
// sides rated, or the time for rating is over), so null can also mean
// "they rated, but you can't see it yet".
export async function getRatingOfMe(userId, projectId) {
  const { data } = await supabase
    .from("project_ratings")
    .select("stars, feedback, created_at")
    .eq("ratee_id", userId)
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}
