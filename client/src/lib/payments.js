import { readReceipt } from "./aiService";
import { todayInManila } from "./projects";
import { supabase } from "./supabaseClient";
import { shrinkImage } from "./shrinkImage";

// GCash payments, see database/supabase_payments_schema.sql and
// PLAN-gcash-payments.md. PhilFreela never touches the money: a freelancer saves
// a GCash number and the name on the account (others see only its initials), the
// client pays in the GCash app and records it here with a screenshot of the
// receipt, which the AI reads (amount, reference number, date, initials) and
// checks for signs of a fake (PLAN-receipt-ai.md), and the freelancer checks their
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

export const GCASH_NUMBER_DIGITS = 11;

// What a GCash number box keeps as it is typed or pasted: digits only, at most
// 11, spaced like 0917 123 4567. A pasted +63 917 123 4567 becomes 0917 123 4567.
// A box that already has 11 digits takes no more (`previous` is what it showed).
export function typeGcashNumber(typed, previous = "") {
  let digits = String(typed ?? "").replace(/\D/g, "");
  if (/^63\d{10}$/.test(digits)) digits = `0${digits.slice(2)}`;
  if (digits.length > GCASH_NUMBER_DIGITS) {
    const before = String(previous ?? "").replace(/\D/g, "");
    digits = before.length === GCASH_NUMBER_DIGITS ? before : digits.slice(0, GCASH_NUMBER_DIGITS);
  }
  return [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7)].filter(Boolean).join(" ");
}

// 4021358091742 -> "4021 358 091742" (the way GCash prints it).
export function formatReference(reference) {
  const match = /^(\d{4})(\d{3})(\d{6})$/.exec(reference || "");
  return match ? `${match[1]} ${match[2]} ${match[3]}` : reference || "";
}

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

// A payment the freelancer answered "Received less" (PLAN-short-payment.md):
// confirmed, but less arrived than the client recorded.
export const isShortPayment = (payment) =>
  payment.status === "confirmed" && payment.received_amount != null && Number(payment.received_amount) < Number(payment.amount);

// The badge of one payment: a short one shows "Received less" instead of "Confirmed".
export const paymentBadge = (payment) =>
  isShortPayment(payment)
    ? { label: "Received less", className: "bg-warning text-dark" }
    : paymentStatuses[payment.status] || { label: payment.status, className: "bg-secondary text-white" };

// Money is added up in centavos, so 0.1 + 0.2 never turns into 0.30000000000000004.
const cents = (value) => Math.round(Number(value || 0) * 100);

// A project's balance (PLAN-short-payment.md). Only a one-time project with an
// agreed price has one; for any other project this returns null. The same rule
// as the database (project_paid_amount()): what counts toward the price is the
// smaller of what arrived and (amount - tip), so when less arrived, the tip is
// the first thing missing.
//   agreed      the agreed price
//   paid        what the freelancer confirmed toward the price
//   waiting     what the client recorded and the freelancer hasn't answered yet
//   left        what is still unpaid (agreed - paid)
//   leftForNew  what a new payment may still pay (agreed - paid - waiting)
//   tips        tips that really arrived
//   fullyPaid   nothing is left
export function projectMoney(project, payments) {
  if (!project || project.price_status !== "agreed" || project.price_basis !== "project" || !payments) return null;
  const agreed = cents(project.agreed_amount);
  let paid = 0;
  let waiting = 0;
  let tips = 0;
  for (const payment of payments) {
    const pricePart = cents(payment.amount) - cents(payment.tip_amount);
    if (payment.status === "confirmed") {
      const arrived = cents(payment.received_amount ?? payment.amount);
      const toward = Math.min(arrived, pricePart);
      paid += toward;
      tips += arrived - toward;
    } else if (payment.status === "sent") {
      waiting += pricePart;
    }
  }
  const left = Math.max(agreed - paid, 0);
  return {
    agreed: agreed / 100,
    paid: paid / 100,
    waiting: waiting / 100,
    left: left / 100,
    leftForNew: Math.max(left - waiting, 0) / 100,
    tips: tips / 100,
    fullyPaid: left === 0
  };
}

// True when the project's original file opens only once it is fully paid (the
// user's choice, 2026-11-08). Any other project opens on any confirmed payment.
export const unlocksWhenFullyPaid = (project) => project?.price_status === "agreed" && project?.price_basis === "project";

// ---------------------------------------------------------------------------
// When the rest must be paid (PLAN-delays.md, Step 1)
// ---------------------------------------------------------------------------

// A project with an agreed one-time price is due for payment this many days after
// it was marked Done. The same number as payment_due_date() in the database
// (database/supabase_payment_due_schema.sql), which the 8:00 AM reminders use, so
// change both together.
export const PAYMENT_DUE_DAYS = 7;

// Whole days from one "YYYY-MM-DD" day to another (both read as UTC, so the
// computer's clock and time zone can't shift the answer).
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// The day payment is due, as "YYYY-MM-DD" in the Philippines, or "" when it
// doesn't apply (the project isn't Done, or has no agreed one-time price).
export function paymentDueDate(project) {
  if (project?.status !== "done" || !project.completed_at) return "";
  if (project.price_status !== "agreed" || project.price_basis !== "project") return "";
  // A later day the freelancer agreed to (a request for more time, PLAN-delay-requests.md)
  // wins over the normal 7 days; payment_due_date() in the database does the same.
  if (project.payment_due_override) return project.payment_due_override;
  const doneDay = new Date(project.completed_at).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  const due = new Date(`${doneDay}T00:00:00Z`);
  due.setUTCDate(due.getUTCDate() + PAYMENT_DUE_DAYS);
  return due.toISOString().slice(0, 10);
}

// True when payment is due within 3 days or already late: the projects whose
// payments the My Projects list reads to show the payment pill.
export function paymentNearOrLate(project, today = todayInManila()) {
  const dueDate = paymentDueDate(project);
  return Boolean(dueDate) && daysBetween(today, dueDate) <= 3;
}

// How the payment stands against its due day. money is projectMoney(project,
// payments). Money the freelancer hasn't answered yet counts as paid (leftForNew),
// the same as the database, so a client is never "late" because the freelancer
// didn't answer. Gives back
//   { late: true,  soon: false, days: 3, dueDate, text: "Payment 3 days late" }
//   { late: false, soon: true,  days: 2, dueDate, text: "Pay in 2 days" }   (up to 3 days before)
//   { late: false, soon: false, days: 6, dueDate, text: "Pay in 6 days" }
// or null when it doesn't apply: not Done, no agreed one-time price, the balance
// isn't loaded yet, or nothing is left to pay.
export function payDueInfo(project, money, today = todayInManila()) {
  const dueDate = paymentDueDate(project);
  if (!dueDate || !money || money.leftForNew <= 0) return null;
  const daysLeft = daysBetween(today, dueDate);
  if (daysLeft < 0) {
    const days = -daysLeft;
    return { late: true, soon: false, days, dueDate, text: `Payment ${days} day${days === 1 ? "" : "s"} late` };
  }
  const text = daysLeft === 0 ? "Pay today" : daysLeft === 1 ? "Pay by tomorrow" : `Pay in ${daysLeft} days`;
  return { late: false, soon: daysLeft <= 3, days: daysLeft, dueDate, text };
}

// ---------------------------------------------------------------------------
// A payment the freelancer has not answered (PLAN-delays.md, Step 3)
// ---------------------------------------------------------------------------

// After this many days without an answer the client can report the payment. The same
// number as the database's 8:00 AM reminders (wait_7 in send_daily_notices(),
// database/supabase_payment_waiting_schema.sql), so change both together.
export const PAYMENT_REPORT_AFTER_DAYS = 7;

// How many days a payment has been waiting for the freelancer's answer, counted in
// Philippine days from when the client recorded it (created_at; a chat request gets a
// new created_at when it is recorded). 0 for a payment that is not waiting.
export function waitingDays(payment, today = todayInManila()) {
  if (payment?.status !== "sent" || !payment.created_at) return 0;
  const recordedDay = new Date(payment.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return Math.max(daysBetween(recordedDay, today), 0);
}

// True when the client may report a payment the freelancer has not answered.
export const canReportUnanswered = (payment, today) => waitingDays(payment, today) >= PAYMENT_REPORT_AFTER_DAYS;

// ---------------------------------------------------------------------------
// The receipt picture (client)
// ---------------------------------------------------------------------------

const RECEIPT_BUCKET = "receipts";
const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

// Checks a picked picture. Returns "" when it's fine, or a message to show.
function checkPicture(file, maxBytes, what) {
  if (!file) return `Please pick ${what}.`;
  if (!PICTURE_TYPES.includes(file.type)) return "Please pick a JPG, PNG or WebP picture.";
  if (file.size > maxBytes) return `That picture must be ${maxBytes / (1024 * 1024)} MB or smaller.`;
  return "";
}

export const checkReceiptFile = (file) => checkPicture(file, MAX_RECEIPT_BYTES, "your receipt screenshot");

// The AI service takes at most 4 MB (Vercel's limit per request). A bigger
// screenshot is first redrawn smaller as a JPEG in the browser.
const MAX_READ_BYTES = 4 * 1024 * 1024;

// "Add screenshot": the AI service reads the receipt (PLAN-receipt-ai.md). It
// reads the amount, the reference number, the date and the initials, checks for
// signs of a fake, and keeps a clean copy of the picture itself, so the browser
// uploads nothing and types nothing. projectId or paymentId (a chat request).
// Returns { data } (see readReceipt in aiService.js) or { error }.
export async function readReceiptScreenshot({ projectId, paymentId, file }) {
  try {
    const picture = file.size > MAX_READ_BYTES ? await shrinkImage(file, 2000) : file;
    return { data: await readReceipt({ projectId, paymentId, file: picture }) };
  } catch (error) {
    return { error: error.message || "Couldn't read that receipt. Please try again." };
  }
}

// The receipt check's verdict on a recorded payment, for both people:
// { tone, text } or null for a payment from before the check existed.
export function receiptCheckLabel(payment) {
  if (payment.ai_verdict === "ok") return { tone: "success", icon: "bi-shield-check", text: "Receipt checked by AI: no signs of a fake." };
  if (payment.ai_verdict === "check") return { tone: "warning", icon: "bi-exclamation-triangle-fill", text: "Receipt checked by AI: look at it carefully." };
  return null;
}

// "the date on it ... is in the future" -> "The date on it ... is in the future."
export const asSentence = (reason) => (reason ? `${reason.charAt(0).toUpperCase()}${reason.slice(1)}${/[.!?]$/.test(reason) ? "" : "."}` : "");

// A date and time on a receipt, shown in Philippine time like GCash prints it.
export const receiptTime = (value) =>
  new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

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

const PAYMENT_FIELDS = "id, project_id, conversation_id, client_id, freelancer_id, amount, tip_amount, received_amount, note, reference_no, receipt_path, status, created_at, answered_at, paid_at, receipt_initials, ai_verdict, ai_reasons";

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

// The payments of several projects at once, grouped by project:
// { data: { [projectId]: [payment, ...] } } or { error }. The My Projects list uses
// it for the payment pill. A project with no payment has no entry.
export async function listPaymentsOfProjects(projectIds) {
  if (!projectIds.length) return { data: {} };
  const { data, error } = await supabase
    .from("payments")
    .select("project_id, amount, tip_amount, received_amount, status")
    .in("project_id", projectIds);
  if (error) {
    console.error("Loading the payments of the projects failed:", error);
    return { error: "Couldn't load the payments." };
  }
  const grouped = {};
  for (const payment of data || []) {
    if (!grouped[payment.project_id]) grouped[payment.project_id] = [];
    grouped[payment.project_id].push(payment);
  }
  return { data: grouped };
}

// "I've paid", after the AI read the receipt (readReceiptScreenshot). The
// database takes the amount, the reference number and the saved picture from the
// AI's reading (checkId), never from the browser; the client only says which part
// of the amount is a tip (0 for none). It then records the payment and tells the
// freelancer, or refuses (a reused reference, more than is left to pay...).
// Returns { id } or { error }.
export async function recordPayment({ projectId, checkId, tip = 0 }) {
  const { data, error } = await supabase.rpc("record_receipt_payment", {
    target_project: projectId,
    receipt_check: checkId,
    pay_tip: tip
  });
  if (error) {
    console.error("Recording the payment failed:", error);
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

// "Received less": only gotAmount arrived in the freelancer's GCash (less than
// the client recorded). The database saves the payment as confirmed with that
// amount and tells the client what is still unpaid. "" or a message.
export async function confirmShortPayment(paymentId, gotAmount) {
  const { error } = await supabase.rpc("confirm_short_payment", { target_payment: paymentId, got_amount: gotAmount });
  if (error) {
    console.error("Saving what arrived failed:", error);
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

// "I've paid" on a card, after the AI read the receipt: the same as
// recordPayment, for a chat payment request. { id } or { error }.
export async function recordChatPayment({ paymentId, checkId, tip = 0 }) {
  const { error } = await supabase.rpc("record_chat_receipt_payment", {
    target_payment: paymentId,
    receipt_check: checkId,
    pay_tip: tip
  });
  if (error) {
    console.error("Recording the chat payment failed:", error);
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
