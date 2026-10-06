// Search by picture: a client drops a picture on the top search bar and the
// Moodboard Match page scans it (AI Moodboard Matching, feature 2 in
// PhilFreela-System-Functions.md: CLIP embeddings + cosine similarity).
// This file holds the rules for the picture and carries it from the search
// bar to that page.

export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PICTURE_BYTES = 10 * 1024 * 1024; // shrunk before it is sent
export const PICTURE_HINT = "JPG, PNG, or WebP, up to 10 MB.";

// Returns a message when the file can't be scanned, or "" when it's fine.
// (The AI service checks the picture again; this only answers faster.)
export function checkPicture(file) {
  if (!PICTURE_TYPES.includes(file.type)) return "Please choose a JPG, PNG, or WebP picture.";
  if (file.size > MAX_PICTURE_BYTES) return "Pictures must be 10 MB or smaller.";
  return "";
}

// The picture on its way from the search bar to the Moodboard Match page. A
// picture can't be put in a web address, so it waits here under a number (the
// ticket) and the address carries only the number. It is kept in memory only:
// refreshing the page forgets it, and nothing is saved.
let waiting = { ticket: null, file: null };

// Keeps the picture and returns its ticket.
export function holdPicture(file) {
  waiting = { ticket: Date.now(), file };
  return waiting.ticket;
}

// The picture for this ticket, or null when there isn't one (the page was
// opened from the menu, or refreshed).
export function pictureFor(ticket) {
  return ticket && ticket === waiting.ticket ? waiting.file : null;
}
