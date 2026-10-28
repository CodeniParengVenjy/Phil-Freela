import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { pickWelcomeRoles } from "../../../lib/welcomeTitles";

// The job names for the welcome banner (lib/welcomeTitles.js). Two small reads
// at most, no new table.
//   Freelancer: one for each category of their own services, and one for each
//   category of a job they were hired for (a project, started or done).
//   Client (isClient): one for each category of their OPEN job posts, since the
//   banner says "looking for a Video Editor".
// Returns [{ phrase, line }], empty for a new account, while it loads, and when
// it can't be read (then the banner just says "Welcome, Name").
export function useWelcomeRoles(userId, isClient = false) {
  const [picks, setPicks] = useState([]);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    const reads = isClient
      ? [supabase.from("job_posts").select("category").eq("client_id", userId).eq("job_state", "open")]
      : [
          supabase.from("services").select("category").eq("freelancer_id", userId),
          // job: the job post this project came from (empty if it was deleted, or
          // if the project came from a booking, whose service is counted above).
          supabase.from("projects").select("job:job_posts(category)").eq("freelancer_id", userId)
        ];
    Promise.all(reads).then(([first, hires]) => {
      if (!active) return;
      const categories = [
        ...(first.data || []).map((row) => row.category),
        ...((hires && hires.data) || []).map((row) => row.job?.category)
      ];
      setPicks(pickWelcomeRoles(categories, isClient));
    });
    return () => {
      active = false;
    };
  }, [userId, isClient]);

  return picks;
}
