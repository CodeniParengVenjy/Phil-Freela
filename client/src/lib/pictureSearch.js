// Search by picture: a client picks a picture with the camera button of a
// search box, or drops one on the top search bar, and a popup scans it
// (PictureSearchDialog.jsx; AI Moodboard Matching, feature 2 in
// PhilFreela-System-Functions.md: CLIP embeddings + cosine similarity).
// This file holds the rules for the picture.

export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PICTURE_BYTES = 10 * 1024 * 1024; // shrunk before it is sent

// Returns a message when the file can't be scanned, or "" when it's fine.
// (The AI service checks the picture again; this only answers faster.)
export function checkPicture(file) {
  if (!PICTURE_TYPES.includes(file.type)) return "Please choose a JPG, PNG, or WebP picture.";
  if (file.size > MAX_PICTURE_BYTES) return "Pictures must be 10 MB or smaller.";
  return "";
}
