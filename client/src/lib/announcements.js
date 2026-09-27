import { supabase } from "./supabaseClient";

// Who an admin can send an announcement to. The values match the check on
// the announcements table (database), so do not rename them.
export const announcementAudiences = [
  { value: "all", label: "All users" },
  { value: "freelancer", label: "Freelancers only" },
  { value: "client", label: "Clients only" }
];

export function audienceLabel(value) {
  return announcementAudiences.find((a) => a.value === value)?.label || value;
}

// The signed-in user's announcements, newest first. The database rules only
// return the ones meant for them (for everyone + for their account type).
export function getMyAnnouncements() {
  return supabase
    .from("announcements")
    .select("id, title, message, created_at")
    .order("created_at", { ascending: false });
}
