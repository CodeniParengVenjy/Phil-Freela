import { supabase } from "./supabaseClient";
import { SLIDES_SELECT, removeItemFiles } from "./slides";

// Portfolio projects (watermarking system, step 2): a title, a short
// description, and up to 10 photos and videos (slides, see lib/slides.js).
// The database rules decide who can see, add, and delete them.

export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1000;

const PORTFOLIO_COLUMNS = `id, freelancer_id, title, description, created_at, ${SLIDES_SELECT}`;

// A freelancer's projects, newest first.
export async function fetchPortfolio(freelancerId) {
  const { data, error } = await supabase
    .from("portfolio_items")
    .select(PORTFOLIO_COLUMNS)
    .eq("freelancer_id", freelancerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load the portfolio right now.");
  return data;
}

// Saves a new project (without slides; those are uploaded next).
export async function createPortfolioItem(freelancerId, { title, description }) {
  const { data, error } = await supabase
    .from("portfolio_items")
    .insert({ freelancer_id: freelancerId, title: title.trim(), description: description.trim() || null })
    .select(PORTFOLIO_COLUMNS)
    .single();
  if (error) throw new Error("Couldn't save that project. Please try again.");
  return data;
}

// Deletes a project; its slides go with it (the database deletes the rows,
// this deletes their files).
export async function deletePortfolioItem(item) {
  // .select("id") returns the deleted rows, so an empty result means nothing was deleted.
  const { data, error } = await supabase.from("portfolio_items").delete().eq("id", item.id).select("id");
  if (error || !data?.length) throw new Error("Couldn't delete that project. Please try again.");
  await removeItemFiles(item);
}
