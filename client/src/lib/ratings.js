import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Each user's average stars and rating count, for showing "★ 4.8 (5)" next
// to a name (Job Details, a freelancer's public page). See rating_summaries
// in database/supabase_projects_schema.sql. Ratings are open to every
// signed-in user to read (Feature 5, Profile transparency).
export async function fetchRatingSummaries(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.rpc("rating_summaries", { ids });
  if (error) return new Map();
  return new Map(data.map((row) => [row.user_id, { avgStars: row.avg_stars, count: row.rating_count }]));
}

// The summaries of every user in userIds, as a Map of id -> summary, for
// lists (Find Jobs): one request for the whole page instead of one per row.
// Asks the database again only when the list of users on the page changes.
export function useRatingSummaries(userIds) {
  const key = [...new Set(userIds.filter(Boolean))].sort().join(",");
  const [summaries, setSummaries] = useState(() => new Map());

  useEffect(() => {
    if (!key) return undefined;
    let active = true;
    fetchRatingSummaries(key.split(",")).then((result) => {
      if (active) setSummaries(result);
    });
    return () => {
      active = false;
    };
  }, [key]);

  return summaries;
}

// A user's own summary, or undefined while loading / no ratings yet.
export function useRatingSummary(userId) {
  const [summary, setSummary] = useState(undefined);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    fetchRatingSummaries([userId]).then((summaries) => {
      if (active) setSummary(summaries.get(userId));
    });
    return () => {
      active = false;
    };
  }, [userId]);

  return summary;
}
