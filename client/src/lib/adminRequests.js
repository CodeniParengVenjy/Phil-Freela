import { supabase } from "./supabaseClient";

// A regular admin can't suspend, ban, resolve, dismiss or remove a listing or
// a reported picture on their own: they send a request, and a super admin approves or declines it
// on the Approvals page. The admin_requests table and its database rules
// (database/supabase_admin_roles_schema.sql) enforce this.

// What each kind of request is called on screen.
export const requestKindText = {
  suspend: "Suspend",
  ban: "Ban",
  resolve: "Resolve",
  dismiss: "Dismiss",
  remove_listing: "Remove listing",
  remove_picture: "Remove picture"
};

// What one request is called on screen. A reported portfolio project is
// removed with the same kind of request as a listing, under its own name.
export function requestText(request) {
  if (request.kind === "remove_listing" && request.listing_table === "portfolio_items") return "Remove project";
  return requestKindText[request.kind];
}

// Everything a request card needs. "decider" is the super admin who answered.
export const REQUEST_COLUMNS =
  "id, kind, report_id, target_user_id, listing_table, listing_id, details, status, decision_note, requested_by_name, created_at, decided_at, decider:admins!admin_requests_decided_by_fkey(full_name)";

// Sends a request as the signed-in regular admin. Returns { data, error } with
// a plain-words error message. The database allows only one open request per
// report (and per user on the Users page), which is the 23505 case.
export async function sendRequest({ adminId, kind, reportId = null, targetUserId = null, listingTable = null, listingId = null, details = {} }) {
  const { data, error } = await supabase
    .from("admin_requests")
    .insert({
      requested_by: adminId,
      kind,
      report_id: reportId,
      target_user_id: targetUserId,
      listing_table: listingTable,
      listing_id: listingId,
      details
    })
    .select(REQUEST_COLUMNS)
    .single();

  if (error) {
    return {
      data: null,
      error: error.code === "23505"
        ? "A request for this is already waiting for a super admin."
        : "Couldn't send the request. Please try again."
    };
  }
  return { data, error: null };
}

// Loads requests with the given statuses, newest first. A regular admin gets
// only their own (database rule); a super admin gets everyone's.
export function loadRequests(statuses) {
  return supabase
    .from("admin_requests")
    .select(REQUEST_COLUMNS)
    .in("status", statuses)
    .order("created_at", { ascending: false });
}

// Keeps the newest request for each key, e.g. each report id. The list must
// already be newest first (loadRequests does that).
export function newestBy(requests, keyOf) {
  const map = {};
  requests.forEach((request) => {
    const key = keyOf(request);
    if (key && !map[key]) map[key] = request;
  });
  return map;
}
