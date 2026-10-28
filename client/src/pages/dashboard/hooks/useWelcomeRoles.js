import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { pickWelcomeRoles } from "../../../lib/welcomeTitles";

// The job names for the welcome banner (lib/welcomeTitles.js): one for each
// category of the freelancer's own services, and one for each category of a job
// they were hired for (a project, started or done). Two small reads, no new table.
// Returns [{ role, compliment, line }], empty for a new account, while it loads,
// and when it can't be read (then the banner just says "Welcome, Name").
// Pass null to skip the reads (clients).
export function useWelcomeRoles(userId) {
  const [picks, setPicks] = useState([]);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    Promise.all([
      supabase.from("services").select("category").eq("freelancer_id", userId),
      // job: the job post this project came from (empty if it was deleted, or
      // if the project came from a booking, whose service is counted above).
      supabase.from("projects").select("job:job_posts(category)").eq("freelancer_id", userId)
    ]).then(([services, hires]) => {
      if (!active) return;
      const categories = [
        ...(services.data || []).map((row) => row.category),
        ...(hires.data || []).map((row) => row.job?.category)
      ];
      setPicks(pickWelcomeRoles(categories));
    });
    return () => {
      active = false;
    };
  }, [userId]);

  return picks;
}
