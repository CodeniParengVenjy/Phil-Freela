import { useEffect, useState } from "react";
import { countApplicants, deleteJobPost, deleteService } from "../../../lib/ownPosts";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

// The "Delete this ...?" pop-up for your own service or job post. kind is
// "service" or "job"; post is the one to delete ({ id, title, ... }, null =
// closed). A service needs its slides and image_url loaded so its files can be
// removed too. onDeleted(post) runs after it is gone. Give it key={post?.id} so
// the applicant count starts over for each job.
export default function DeletePostDialog({ kind, post, onCancel, onDeleted, showToast }) {
  const [busy, setBusy] = useState(false);
  // For a job: how many people applied (undefined = counting, null = couldn't count).
  const [applicants, setApplicants] = useState(undefined);

  useEffect(() => {
    if (!post || kind !== "job") return undefined;
    let active = true;
    countApplicants(post.id).then((count) => {
      if (active) setApplicants(count);
    });
    return () => {
      active = false;
    };
  }, [post, kind]);

  const handleConfirm = async () => {
    setBusy(true);
    const problem = kind === "job" ? await deleteJobPost(post) : await deleteService(post);
    setBusy(false);
    if (problem) {
      showToast(problem);
      return;
    }
    onDeleted(post);
    showToast(`"${post.title}" was deleted.`);
  };

  let message = "";
  if (post && kind === "service") {
    message = `"${post.title}" will be removed for good, together with its photos, videos and the ratings on it. Bookings you already received stay in Bookings. This can't be undone.`;
  } else if (post) {
    const applied = applicants > 0
      ? ` ${applicants} ${applicants === 1 ? "freelancer applied" : "freelancers applied"}: their applications and resumes will be removed too.`
      : "";
    message = `"${post.title}" will be removed for good.${applied} A project already started from it keeps going. This can't be undone.`;
  }

  return (
    <DeleteConfirmDialog
      open={Boolean(post)}
      title={kind === "job" ? "Delete this job post?" : "Delete this service?"}
      message={message}
      busy={busy}
      onConfirm={handleConfirm}
      onCancel={onCancel}
    />
  );
}
