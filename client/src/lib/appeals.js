import { supabase } from "./supabaseClient";

// Appeals: a suspended or banned user asks an admin to lift their penalty.
// Each penalty can be appealed once (database rule).

export const APPEAL_MIN_LENGTH = 10;
export const APPEAL_MAX_LENGTH = 1000;

const APPEAL_COLUMNS = "id, message, status, admin_note, created_at, reviewed_at";

// The user's appeal for this penalty (their user_suspensions row), or null if
// they haven't sent one. The penalty's created_at says which penalty it is.
export async function getAppealFor(suspension) {
  const { data } = await supabase
    .from("appeals")
    .select(APPEAL_COLUMNS)
    .eq("user_id", suspension.user_id)
    .eq("suspension_started_at", suspension.created_at)
    .maybeSingle();
  return data;
}

// Sends an appeal for the user's current penalty. Only the message is sent:
// the database fills in which penalty it's about.
export async function sendAppeal(userId, message) {
  const { data, error } = await supabase
    .from("appeals")
    .insert({ user_id: userId, message })
    .select(APPEAL_COLUMNS)
    .single();

  if (error) {
    // 23505 = the one-appeal-per-penalty rule.
    const text = error.code === "23505"
      ? "You've already appealed this penalty."
      : "Couldn't send your appeal. Please try again.";
    return { data: null, error: text };
  }
  return { data, error: null };
}
