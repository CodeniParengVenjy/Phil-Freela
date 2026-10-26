import { supabase } from "./supabaseClient";
import { shrinkImage } from "./shrinkImage";

// GCash payments, see database/supabase_payments_schema.sql and
// PLAN-gcash-payments.md. PhilFreela never touches the money: a freelancer saves
// a GCash number and the name on the account (others see only its initials), the
// client pays in the GCash app and records it here, and the freelancer checks their
// own GCash and answers.
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

// "Ana R. Santos" -> "A. R. S.": what other people see instead of the name. The
// same rule as the database (name_initials()): the first letter of every word. The
// database makes the real one for the client; this one is only the preview in
// Settings.
export function nameInitials(name) {
  return tidyAccountName(name)
    .split(" ")
    .filter((word) => /^[A-Za-zÀ-ÖØ-öø-ɏ]/.test(word))
    .map((word) => `${word[0].toUpperCase()}.`)
    .join(" ");
}

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
// The receipt picture (client)
// ---------------------------------------------------------------------------

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

// Not used for freelancers any more (they have no QR here). It stays because the
// earning plan's Admin > Site page checks PhilFreela's own GCash QR with it.
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

export const uploadReceipt = (userId, file) => uploadPicture(RECEIPT_BUCKET, userId, file, 1600, "receipt");

// If removing an unused file fails it only leaves the file behind, so it is
// never an error for the person.
export const removeReceiptFile = (path) => (path ? supabase.storage.from(RECEIPT_BUCKET).remove([path]) : null);

// A link that opens a private picture for an hour (null when it couldn't be made).
async function signedLink(bucket, path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  return error ? null : data?.signedUrl ?? null;
}

export const getReceiptLink = (path) => signedLink(RECEIPT_BUCKET, path);

// ---------------------------------------------------------------------------
// The freelancer's own GCash details (Settings > GCash Payment)
// ---------------------------------------------------------------------------

// The saved details of the signed-in freelancer: { data } (null when none are
// saved yet) or { error }.
export async function getMyGcash(userId) {
  const { data, error } = await supabase
    .from("gcash_accounts")
    .select("gcash_number, account_name")
    .eq("freelancer_id", userId)
    .maybeSingle();
  if (error) {
    console.error("Loading the GCash details failed:", error);
    return { error: "Couldn't load your GCash details. Please try again." };
  }
  return { data: data || null };
}

// Saves the number and the name. Returns "" when saved, or a message to show.
export async function saveMyGcash(userId, { number, name }) {
  const normalized = normalizeGcashNumber(number);
  const tidyName = tidyAccountName(name);
  if (!isValidGcashNumber(normalized)) return "Enter your 11-digit GCash number, like 0917 123 4567.";
  if (!isValidAccountName(tidyName)) return "Enter the name on your GCash account: letters, spaces, dots and hyphens only.";

  const { error } = await supabase.from("gcash_accounts").upsert(
    { freelancer_id: userId, gcash_number: normalized, account_name: tidyName },
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

// ---------------------------------------------------------------------------
// Payments on a project (the Payments section of the project page)
// ---------------------------------------------------------------------------

// What the database says in plain words (P0001) is shown as it is; any other
// problem gets a general message.
const plainMessage = (error, fallback) => (error?.code === "P0001" && error.message ? error.message : fallback);

// Where to send the money, for the client of a project: { data } with the
// freelancer's { initials, gcash_number } (the database never sends the full name),
// { data: null } when they have not saved any details yet, or { error }.
export async function getPayDetails(projectId) {
  const { data, error } = await supabase.rpc("get_pay_details", { target_project: projectId });
  if (error) {
    console.error("Loading where to pay failed:", error);
    return { error: plainMessage(error, "Couldn't load where to pay. Please try again.") };
  }
  return { data: data?.[0] || null };
}

const PAYMENT_FIELDS = "id, project_id, conversation_id, client_id, freelancer_id, amount, note, reference_no, receipt_path, status, created_at, answered_at";

// The payments of one project, newest first: { data } or { error }.
export async function listProjectPayments(projectId) {
  const { data, error } = await supabase
    .from("payments")
    .select(PAYMENT_FIELDS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Loading the payments failed:", error);
    return { error: "Couldn't load the payments. Please try again." };
  }
  return { data: data || [] };
}

// "I've paid". The receipt picture goes up first, then the database records the
// payment and tells the freelancer; if the database refuses (a reused reference,
// a wrong amount...), the picture is removed again so no unused file stays.
// Returns { id } or { error }.
export async function recordPayment({ userId, projectId, amount, reference, receiptFile }) {
  const upload = await uploadReceipt(userId, receiptFile);
  if (upload.error) return { error: upload.error };

  const { data, error } = await supabase.rpc("record_payment", {
    target_project: projectId,
    pay_amount: amount,
    pay_reference: reference,
    pay_receipt_path: upload.path
  });
  if (error) {
    console.error("Recording the payment failed:", error);
    await removeReceiptFile(upload.path);
    return { error: plainMessage(error, "Couldn't record that payment. Please try again.") };
  }
  return { id: data };
}

// The freelancer's answers. Both return "" when done, or a message to show.
export async function confirmPayment(paymentId) {
  const { error } = await supabase.rpc("confirm_payment", { target_payment: paymentId });
  if (error) {
    console.error("Confirming the payment failed:", error);
    return plainMessage(error, "Couldn't confirm that payment. Please try again.");
  }
  return "";
}

export async function markNotReceived(paymentId) {
  const { error } = await supabase.rpc("mark_payment_not_received", { target_payment: paymentId });
  if (error) {
    console.error("Answering the payment failed:", error);
    return plainMessage(error, "Couldn't save that answer. Please try again.");
  }
  return "";
}

// Opens a receipt in a new tab through a link that stops working after 60
// seconds, like a deliverable. Returns "" or a message.
export async function openReceipt(path) {
  const tab = window.open("", "_blank");
  const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    tab?.close();
    return "Couldn't open that receipt. Please try again.";
  }
  if (tab) tab.location.href = data.signedUrl;
  else window.location.href = data.signedUrl;
  return "";
}

// Calls onChange whenever a payment of this project is added or answered, so
// the page shows the other person's answer without a reload. Returns a function
// that stops listening.
export function watchProjectPayments(projectId, onChange) {
  const channel = supabase
    .channel(`payments:project:${projectId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `project_id=eq.${projectId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---------------------------------------------------------------------------
// Payments from a chat (the payment card in a private message)
// ---------------------------------------------------------------------------

export const MAX_PAYMENT_NOTE_LENGTH = 100;

// "Request payment": the freelancer asks the other person in the chat to pay.
// The database writes the card into the chat and tells them. Returns { id } or
// { error } (the database's own sentence for a refusal, like "Add your GCash
// details in Settings first...").
export async function requestPayment({ conversationId, amount, note }) {
  const { data, error } = await supabase.rpc("request_payment", {
    target_conversation: conversationId,
    req_amount: amount,
    req_note: note || null
  });
  if (error) {
    console.error("Requesting the payment failed:", error);
    return { error: plainMessage(error, "Couldn't send that request. Please try again.") };
  }
  return { id: data };
}

// The freelancer takes a request back before it is paid. "" or a message.
export async function cancelPaymentRequest(paymentId) {
  const { error } = await supabase.rpc("cancel_payment_request", { target_payment: paymentId });
  if (error) {
    console.error("Cancelling the request failed:", error);
    return plainMessage(error, "Couldn't cancel that request. Please try again.");
  }
  return "";
}

// Where to pay, for the person asked to pay (same answer as getPayDetails).
export async function getRequestPayDetails(paymentId) {
  const { data, error } = await supabase.rpc("get_request_pay_details", { target_payment: paymentId });
  if (error) {
    console.error("Loading where to pay failed:", error);
    return { error: plainMessage(error, "Couldn't load where to pay. Please try again.") };
  }
  return { data: data?.[0] || null };
}

// "I've paid" on a card: the receipt goes up first, then the database records
// the payment; if it refuses, the picture is removed again. { id } or { error }.
export async function recordChatPayment({ userId, paymentId, amount, reference, receiptFile }) {
  const upload = await uploadReceipt(userId, receiptFile);
  if (upload.error) return { error: upload.error };

  const { error } = await supabase.rpc("record_chat_payment", {
    target_payment: paymentId,
    pay_amount: amount,
    pay_reference: reference,
    pay_receipt_path: upload.path
  });
  if (error) {
    console.error("Recording the chat payment failed:", error);
    await removeReceiptFile(upload.path);
    return { error: plainMessage(error, "Couldn't record that payment. Please try again.") };
  }
  return { id: paymentId };
}

// The payments of one chat: { data } or { error }.
export async function listConversationPayments(conversationId) {
  const { data, error } = await supabase.from("payments").select(PAYMENT_FIELDS).eq("conversation_id", conversationId);
  if (error) {
    console.error("Loading the chat's payments failed:", error);
    return { error: "Couldn't load the payment cards. Please try again." };
  }
  return { data: data || [] };
}

// Calls onChange whenever a payment of this chat changes (paid, answered,
// cancelled). Returns a function that stops listening.
export function watchConversationPayments(conversationId, onChange) {
  const channel = supabase
    .channel(`payments:chat:${conversationId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `conversation_id=eq.${conversationId}` }, onChange)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
