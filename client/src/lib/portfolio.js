import { supabase } from "./supabaseClient";
import { SLIDES_SELECT, removeItemFiles } from "./slides";

// Portfolio items (watermarking system, steps 2, 6 and 10): projects (a
// title, a short description, a category and up to 5 tags, and up to 10
// photos, videos and documents, see lib/slides.js). Writing added before step
// 10 is its own kind of item, a "document" (added through the AI service so it
// got watermarked, see addDocument in lib/aiService.js). The database rules
// decide who can see, add, and delete them.

export const MAX_TITLE_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_DOCUMENT_CHARACTERS = 20000;
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
export const DOCUMENT_ACCEPT = ".txt,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
// Tags: keywords like "Photoshop" or "Logo" (the database allows 5 of up to 30 characters).
export const MAX_TAGS = 5;
export const MAX_TAG_LENGTH = 30;

// Invisible characters (the hidden code), removed where text is only
// previewed; the full text keeps them so copies carry the code.
export const withoutHiddenCharacters = (text) => (text || "").replace(/[​-‏⁠-⁤﻿]/g, "");

// kind: "project" (files) or "document" (writing in body, from step 6 until
// step 10). status: "flagged" = held back by the copy check until an admin
// reviews it. category / tags: step 10 (none on older items).
const PORTFOLIO_COLUMNS = `id, freelancer_id, kind, title, description, body, status, category, tags, created_at, ${SLIDES_SELECT}`;

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

// How many projects a person has in their portfolio (0 when it couldn't be
// counted). head: true = just the count, no rows. The public profile uses it
// to decide whether to show a Portfolio box for someone who is a client today.
export async function countPortfolio(freelancerId) {
  const { count } = await supabase
    .from("portfolio_items")
    .select("id", { count: "exact", head: true })
    .eq("freelancer_id", freelancerId);
  return count || 0;
}

// Saves a new project (without slides; those are uploaded next).
export async function createPortfolioItem(freelancerId, { title, description, category, tags }) {
  const { data, error } = await supabase
    .from("portfolio_items")
    .insert({ freelancer_id: freelancerId, title: title.trim(), description: description.trim() || null, category, tags })
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
