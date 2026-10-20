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

// The Trust score ring (components/TrustRing.jsx): the average stars out of 5,
// as a whole percentage. 4.5 stars = 90%, and the lowest possible (1 star) is 20%.
export function trustPercent(avgStars) {
  return Math.round((Number(avgStars) / 5) * 100);
}

// The word and the color class for a Trust score. The classes are Bootstrap's
// (plus text-role, the user's accent), so they re-color themselves in light mode.
export function trustLevel(percent) {
  if (percent >= 80) return { word: "Highly trusted", tone: "text-success" };
  if (percent >= 60) return { word: "Trusted", tone: "text-role" };
  if (percent >= 40) return { word: "Fair", tone: "text-warning" };
  return { word: "Low", tone: "text-danger" };
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
