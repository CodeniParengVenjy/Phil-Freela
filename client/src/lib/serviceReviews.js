import { supabase } from "./supabaseClient";

// Ratings and comments on an offer (database/supabase_service_reviews_schema.sql):
// a signed-in client gives an offer 1 to 5 stars and may write a comment. One
// per client per offer. The browser only READS this table (and removes its own
// row); adding one goes through the database function add_service_review,
// which checks who is asking and explains a refusal in plain words.
export const MAX_REVIEW_COMMENT_LENGTH = 1000;

const REVIEW_COLUMNS =
  "id, stars, comment, created_at, author_id, author:profiles!service_reviews_author_id_fkey(id, full_name, username, avatar_path)";

// The ratings on one offer, newest first, each with who wrote it. Returns
// { reviews } or { error } with a message to show.
export async function fetchServiceReviews(serviceId) {
  const { data, error } = await supabase
    .from("service_reviews")
    .select(REVIEW_COLUMNS)
    .eq("service_id", serviceId)
    .order("created_at", { ascending: false });
  if (error) return { error: "Couldn't load the ratings and comments right now." };
  return { reviews: data };
}

// The average stars and the number of ratings of several offers at once, for
// the cards in Browse, Search and on profiles: one request for the whole list
// (the database function service_rating_summaries). Returns a Map of offer id ->
// { count, average }; an offer with no ratings isn't in it. If the request
// fails the cards simply show no rating.
export async function fetchServiceRatings(serviceIds) {
  const ratings = new Map();
  if (!serviceIds.length) return ratings;
  const { data, error } = await supabase.rpc("service_rating_summaries", { ids: serviceIds });
  if (error) return ratings;
  (data || []).forEach((row) => ratings.set(row.service_id, { count: row.rating_count, average: Number(row.avg_stars) }));
  return ratings;
}

// How many ratings a list has and their average stars (one decimal), or null
// as the average when there are none.
export function summarizeReviews(reviews) {
  const count = reviews.length;
  if (count === 0) return { count: 0, average: null };
  const average = Math.round((reviews.reduce((sum, review) => sum + review.stars, 0) / count) * 10) / 10;
  return { count, average };
}

// Posts a rating. Returns { reviewId } or { error } with a message to show (the
// database words its own refusals, like "You already rated this offer").
export async function addServiceReview(serviceId, stars, comment) {
  if (!stars) return { error: "Please pick 1 to 5 stars." };
  const { data, error } = await supabase.rpc("add_service_review", {
    target_service: serviceId,
    review_stars: stars,
    review_comment: comment.trim() || null
  });
  if (error) {
    // P0001 = a problem the database function explains in plain words.
    if (error.code === "P0001") return { error: error.message };
    return { error: "Couldn't post your rating. Please try again." };
  }
  return { reviewId: data };
}

// Removes your own rating (the database only lets an author remove their own;
// .select("id") returns the removed rows, so an empty result means nothing was).
export async function removeOwnReview(reviewId) {
  const { data, error } = await supabase.from("service_reviews").delete().eq("id", reviewId).select("id");
  return !error && Boolean(data?.length);
}
