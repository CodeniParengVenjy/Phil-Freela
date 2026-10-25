import { supabase } from "./supabaseClient";
import { shrinkImage } from "./shrinkImage";

// GCash payments, see database/supabase_payments_schema.sql and
// PLAN-gcash-payments.md. PhilFreela never touches the money: a freelancer saves
// a GCash number (and an optional QR picture), the client pays in the GCash app
// and records it here, and the freelancer checks their own GCash and answers.
// The browser can only READ payments; every change goes through a database
// function that checks who is asking and what status the payment is in.

// ---------------------------------------------------------------------------
// Helpers for numbers, names and amounts
// ---------------------------------------------------------------------------

// "0917 123 4567", "+63 917 123 4567" and "9171234567" all become 09171234567.
export function normalizeGcashNumber(input) {
  let digits = String(input ?? "").replace(/[\s()-]/g, "");
  if (digits.startsWith("+63")) digits = `0${digits.slice(3)}`;
  else if (/^63\d{10}$/.test(digits)) digits = `0${digits.slice(2)}`;
  else if (/^9\d{9}$/.test(digits)) digits = `0${digits}`;
  return digits;
}

// The database rule: 09 and 9 more digits.
export const isValidGcashNumber = (number) => /^09\d{9}$/.test(number);

// 09171234567 -> "0917 123 4567" (anything else is shown as it is).
export function formatGcashNumber(number) {
  const match = /^(\d{4})(\d{3})(\d{4})$/.exec(number || "");
  return match ? `${match[1]} ${match[2]} ${match[3]}` : number || "";
}

// 4021358091742 -> "4021 358 091742" (the way GCash prints it).
export function formatReference(reference) {
  const match = /^(\d{4})(\d{3})(\d{6})$/.exec(reference || "");
  return match ? `${match[1]} ${match[2]} ${match[3]}` : reference || "";
}

// The reference number as typed: spaces are fine, the rest must be 13 digits.
export const normalizeReference = (input) => String(input ?? "").replace(/\s+/g, "");
export const isValidReference = (reference) => /^\d{13}$/.test(reference);

// The name on the GCash account: letters (accents too), spaces, dots, hyphens
// and apostrophes, 2 to 60 characters, no double spaces. The same rule as the
// database. Extra spaces are tidied before it is checked.
export const tidyAccountName = (input) => String(input ?? "").trim().replace(/\s+/g, " ");
export const isValidAccountName = (name) => /^[A-Za-zÀ-ÖØ-öø-ɏ][A-Za-zÀ-ÖØ-öø-ɏ .'-]{1,59}$/.test(name);

export const MAX_PAYMENT_AMOUNT = 1000000;

// 1500 -> "₱1,500.00"
export function formatPeso(amount) {
  return `₱${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Reads an amount typed as "1,500" or "1500.5". Returns a number, or null when
// it isn't an amount the database would accept (more than 0, at most
// 1,000,000, up to 2 decimals).
export function parseAmount(input) {
  const text = String(input ?? "").replace(/[\s,₱]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const amount = Number(text);
  return amount > 0 && amount <= MAX_PAYMENT_AMOUNT ? amount : null;
}

// The label and badge colors for each status of a payment (Bootstrap classes,
// like the project statuses).
export const paymentStatuses = {
  requested: { label: "Requested", className: "bg-secondary text-white" },
  sent: { label: "Payment sent", className: "bg-warning text-dark" },
  confirmed: { label: "Confirmed", className: "bg-success text-white" },
  not_received: { label: "Not received", className: "bg-danger text-white" },
  cancelled: { label: "Cancelled", className: "bg-secondary text-white" }
};

// ---------------------------------------------------------------------------
// Pictures: the QR (freelancer) and the receipt (client)
// ---------------------------------------------------------------------------

const QR_BUCKET = "gcash-qr";
const RECEIPT_BUCKET = "receipts";
const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_QR_BYTES = 2 * 1024 * 1024;
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

// Checks a picked picture. Returns "" when it's fine, or a message to show.
function checkPicture(file, maxBytes, what) {
  if (!file) return `Please pick ${what}.`;
  if (!PICTURE_TYPES.includes(file.type)) return "Please pick a JPG, PNG or WebP picture.";
  if (file.size > maxBytes) return `That picture must be ${maxBytes / (1024 * 1024)} MB or smaller.`;
  return "";
}

export const checkQrFile = (file) => checkPicture(file, MAX_QR_BYTES, "your QR picture");
export const checkReceiptFile = (file) => checkPicture(file, MAX_RECEIPT_BYTES, "your receipt screenshot");

// Redraws the picture as a plain JPEG (this also makes sure it really is a
// picture and strips anything hidden inside the file), then uploads it into the
// person's own folder of a private bucket. Returns { path } or { error }.
async function uploadPicture(bucket, userId, file, maxSide, prefix) {
  let picture;
  try {
    picture = await shrinkImage(file, maxSide);
  } catch (error) {
    return { error: error.message };
  }
  const path = `${userId}/${prefix}-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, picture, { contentType: "image/jpeg" });
  if (error) {
    console.error(`Uploading to ${bucket} failed:`, error);
    return { error: "Couldn't upload that picture. Please try again." };
  }
  return { path };
}

export const uploadQr = (userId, file) => uploadPicture(QR_BUCKET, userId, file, 1200, "qr");
export const uploadReceipt = (userId, file) => uploadPicture(RECEIPT_BUCKET, userId, file, 1600, "receipt");

// If removing an unused file fails it only leaves the file behind, so it is
// never an error for the person.
export const removeQrFile = (path) => (path ? supabase.storage.from(QR_BUCKET).remove([path]) : null);
export const removeReceiptFile = (path) => (path ? supabase.storage.from(RECEIPT_BUCKET).remove([path]) : null);

// A link that opens a private picture for an hour (null when it couldn't be made).
async function signedLink(bucket, path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return error ? null : data?.signedUrl ?? null;
}

export const getQrLink = (path) => signedLink(QR_BUCKET, path);
export const getReceiptLink = (path) => signedLink(RECEIPT_BUCKET, path);

// ---------------------------------------------------------------------------
// The freelancer's own GCash details (Settings > GCash Payment)
// ---------------------------------------------------------------------------

// The saved details of the signed-in freelancer: { data } (null when none are
// saved yet) or { error }.
export async function getMyGcash(userId) {
  const { data, error } = await supabase
    .from("gcash_accounts")
    .select("gcash_number, account_name, qr_path")
    .eq("freelancer_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Loading the GCash details failed:", error);
    return { error: "Couldn't load your GCash details. Please try again." };
  }
  return { data: data || null };
}

// Saves the number, the name and the QR path (empty = no QR). Returns "" when
// saved, or a message to show.
export async function saveMyGcash(userId, { number, name, qrPath }) {
  const normalized = normalizeGcashNumber(number);
  const tidyName = tidyAccountName(name);
  if (!isValidGcashNumber(normalized)) return "Enter your 11-digit GCash number, like 0917 123 4567.";
  if (!isValidAccountName(tidyName)) return "Enter the name on your GCash account: letters, spaces, dots and hyphens only.";

  const { error } = await supabase.from("gcash_accounts").upsert(
    { freelancer_id: userId, gcash_number: normalized, account_name: tidyName, qr_path: qrPath || null },
    { onConflict: "freelancer_id" }
  );
  if (error) {
    console.error("Saving the GCash details failed:", error);
    return error.code === "23514"
      ? "Those details aren't accepted. Check the number and the name."
      : "Couldn't save your GCash details. Please try again.";
  }
  return "";
}

// Removes the saved details completely. Returns "" when done, or a message.
export async function removeMyGcash(userId) {
  const { error } = await supabase.from("gcash_accounts").delete().eq("freelancer_id", userId);
  if (error) {
    console.error("Removing the GCash details failed:", error);
    return "Couldn't remove your GCash details. Please try again.";
  }
  return "";
}
