import { supabase } from "./supabaseClient";
import { SLIDES_SELECT, removeItemFiles } from "./slides";

// Portfolio items (watermarking system, steps 2 and 6): projects (a title, a
// short description, and up to 10 photos and videos, see lib/slides.js) and
// documents (writing, added through the AI service so it gets watermarked,
// see addDocument in lib/aiService.js). The database rules decide who can
// see, add, and delete them.

export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_DOCUMENT_CHARACTERS = 20000;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const DOCUMENT_ACCEPT = ".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Invisible characters (the hidden code), removed where text is only
// previewed; the full text keeps them so copies carry the code.
export const withoutHiddenCharacters = (text) => (text || "").replace(/[​-‏⁠-⁤﻿]/g, "");

// kind: "project" (photos/videos) or "document" (writing in body, step 6).
// status: "flagged" = held back by the copy check until an admin reviews it.
const PORTFOLIO_COLUMNS = `id, freelancer_id, kind, title, description, body, status, created_at, ${SLIDES_SELECT}`;

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
