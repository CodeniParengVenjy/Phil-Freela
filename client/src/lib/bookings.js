import { supabase } from "./supabaseClient";
import { todayInManila } from "./projects";

// Bookings, see database/supabase_bookings_schema.sql. A client books one of
// a freelancer's services (the Book button), and the freelancer accepts or
// declines. An accepted booking starts a project, the same kind Hire makes,
// so it carries on in the Project pages (Started, Submitted, Done, ratings).
// There is no price: no money is involved anywhere on PhilFreela.
// The browser can only READ bookings. Every change goes through a database
// function that checks who is asking and what status the booking is in.
export const MAX_BOOKING_NOTE_LENGTH = 1000;

// The label and badge colors for each status.
export const bookingStatuses = {
  pending: { label: "Pending", className: "bg-warning text-dark" },
  accepted: { label: "Accepted", className: "bg-success text-white" },
  declined: { label: "Declined", className: "bg-danger text-white" },
  cancelled: { label: "Cancelled", className: "bg-secondary text-white" }
};

// The name and picture of both people on a booking.
const PEOPLE_FIELDS =
  "client:profiles!bookings_client_id_fkey(id, full_name, username, avatar_path), " +
  "freelancer:profiles!bookings_freelancer_id_fkey(id, full_name, username, avatar_path)";

// Sends a booking request. Returns { bookingId }, or { error } with a message.
export async function createBooking(serviceId, note, dueDate) {
  if (!serviceId) return { error: "Please choose a service." };
  if (!dueDate) return { error: "Please pick the date you need it by." };
  if (dueDate < todayInManila()) return { error: "The date can't be in the past." };
  if (note.length > MAX_BOOKING_NOTE_LENGTH) return { error: `The note can be up to ${MAX_BOOKING_NOTE_LENGTH} characters.` };

  const { data, error } = await supabase.rpc("create_booking", {
    target_service: serviceId,
    booking_note: note.trim() || null,
    booking_due_date: dueDate
  });
  if (error) {
    // P0001 = a problem the database function explains in plain words
    // (not a client, own service, not verified, a suspension...).
    if (error.code === "P0001") return { error: error.message };
    // Two clicks at once: the second one hits the "one pending booking per
    // service" rule.
    if (error.code === "23505") return { error: "You already have a pending booking for this service." };
    console.error("Booking failed:", error);
    return { error: "Couldn't send your booking. Please try again." };
  }
  return { bookingId: data };
}

// The signed-in user's bookings on their current side: the ones they made
// (client) or the ones made for their services (freelancer). Newest first.
// "project" is the project an accepted booking started (null until then); one
// booking has at most one project, so it comes back as one object.
export function getMyBookings(userId, asFreelancer) {
  return supabase
    .from("bookings")
    .select(`id, title, note, due_date, status, created_at, responded_at, project:projects(id, status), ${PEOPLE_FIELDS}`)
    .eq(asFreelancer ? "freelancer_id" : "client_id", userId)
    .order("created_at", { ascending: false });
}

// The freelancer accepts a pending booking. That starts a project (the client's
// note and the date needed become its note and due date). Returns
// { projectId }, or { error } with a message.
export async function acceptBooking(bookingId) {
  const { data, error } = await supabase.rpc("accept_booking", { target_booking: bookingId });
  if (error) {
    // P0001 = a problem the database function explains in plain words
    // (already answered, the date passed, a suspension...).
    if (error.code === "P0001") return { error: error.message };
    console.error("Accepting the booking failed:", error);
    return { error: "Couldn't accept this booking. Please try again." };
  }
  return { projectId: data };
}

// The freelancer declines a pending booking. Returns "" or a message.
export async function declineBooking(bookingId) {
  const { error } = await supabase.rpc("decline_booking", { target_booking: bookingId });
  if (error) return error.code === "P0001" ? error.message : "Couldn't decline this booking. Please try again.";
  return "";
}

// The client cancels a booking that is still pending. Returns "" or a message.
export async function cancelBooking(bookingId) {
  const { error } = await supabase.rpc("cancel_booking", { target_booking: bookingId });
  if (error) return error.code === "P0001" ? error.message : "Couldn't cancel this booking. Please try again.";
  return "";
}
