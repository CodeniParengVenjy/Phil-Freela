import { supabase } from "./supabaseClient";
import { formatReference, projectMoney, receiptTime, unlocksWhenFullyPaid } from "./payments";

// The PDF receipt of a confirmed payment (PLAN-payment-receipt.md). Both the
// client and the freelancer can download it once the freelancer answered
// Confirm received or Received less. It is drawn in the browser with jsPDF, so
// no server and no database change are needed: everything printed on it is
// already saved with the payment.

// "PF-" + the first 8 characters of the payment id: the same payment always gets
// the same receipt number.
export const receiptNumber = (payment) => `PF-${String(payment.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`;

// Only a confirmed payment has a receipt (a "Received less" one is confirmed too).
export const hasReceipt = (payment) => payment?.status === "confirmed";

// The built-in PDF font has no peso sign, so amounts are written "PHP 1,500.00".
const peso = (n) => `PHP ${Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// The logo for paper: the site's SVG with "Freela" dark instead of white and no
// shadow, drawn on a canvas, empty edges cut off, kept as a PNG.
async function logoForPaper() {
  const svg = (await (await fetch("/logo-philfreela.svg")).text())
    .replace('fill="#f5f5f5"', 'fill="#212529"')
    .replace('filter="url(#softShadow)" ', "");
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 520;
  const pen = canvas.getContext("2d");
  pen.drawImage(img, 0, 0, canvas.width, canvas.height);
  // Find the box around the drawn pixels.
  const pixels = pen.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }
  if (right < left) return null; // nothing drawn: the receipt goes without a logo
  const cut = document.createElement("canvas");
  cut.width = right - left + 1;
  cut.height = bottom - top + 1;
  cut.getContext("2d").drawImage(canvas, -left, -top);
  return { data: cut.toDataURL("image/png"), width: cut.width, height: cut.height };
}

// Reads what the receipt needs besides the payment row: the two people, and for
// a project payment the project and its other payments (for the balance).
// Returns the facts to print, or { error }.
async function loadReceiptFacts(payment) {
  const people = await supabase.from("profiles").select("id, full_name, username").in("id", [payment.client_id, payment.freelancer_id]);
  if (people.error) return { error: "Couldn't load the receipt. Please try again." };
  const person = (id) => {
    const row = people.data.find((p) => p.id === id);
    return { name: row?.full_name || row?.username || "PhilFreela user", username: row?.username || "" };
  };

  let forLine = payment.note ? `Chat payment: ${payment.note}` : "Chat payment";
  let balance = null;
  if (payment.project_id) {
    const project = await supabase
      .from("projects")
      .select("id, title, agreed_amount, price_status, price_basis")
      .eq("id", payment.project_id)
      .maybeSingle();
    if (project.error || !project.data) return { error: "Couldn't load the receipt. Please try again." };
    forLine = `Project: ${project.data.title}`;
    if (unlocksWhenFullyPaid(project.data)) {
      const all = await supabase.from("payments").select("id, amount, tip_amount, received_amount, status, answered_at").eq("project_id", payment.project_id);
      if (all.error) return { error: "Couldn't load the receipt. Please try again." };
      // The balance right after THIS payment: only payments confirmed up to it count.
      const upToThis = all.data.filter((p) => p.status === "confirmed" && p.answered_at <= payment.answered_at);
      balance = projectMoney(project.data, upToThis);
    }
  }

  return {
    receiptNo: receiptNumber(payment),
    madeOn: receiptTime(new Date()),
    amount: Number(payment.amount),
    tip: Number(payment.tip_amount || 0),
    receivedAmount: payment.received_amount == null ? null : Number(payment.received_amount),
    client: person(payment.client_id),
    freelancer: { ...person(payment.freelancer_id), initials: payment.receipt_initials || "" },
    forLine,
    balance,
    reference: formatReference(payment.reference_no) || "-",
    paidOn: payment.paid_at ? receiptTime(payment.paid_at) : "Not shown on the receipt",
    recordedOn: receiptTime(payment.created_at),
    confirmedOn: payment.answered_at ? receiptTime(payment.answered_at) : "-"
  };
}

// Draws the receipt on one A4 page. r = the facts from loadReceiptFacts().
function drawReceipt(jsPDF, r, logo) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const W = 210; // page width
  const M = 18; // left and right margin
  const ink = [33, 37, 41];
  const gray = [108, 117, 125];
  const rule = [222, 226, 230];
  const orange = [245, 134, 0];
  const green = [25, 135, 84];
  const text = (value, x, y, { size = 10, bold = false, color = ink, align = "left" } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(String(value), x, y, { align });
  };
  // A line of text cut with "..." so it never runs off the page or out of its box.
  const fit = (value, width, size, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    let line = String(value);
    if (doc.getTextWidth(line) <= width) return line;
    while (line.length > 1 && doc.getTextWidth(`${line}...`) > width) line = line.slice(0, -1);
    return `${line.trimEnd()}...`;
  };

  // 1. Header: logo on the left, title and receipt number on the right.
  if (logo) doc.addImage(logo.data, "PNG", M, 12, (24 * logo.width) / logo.height, 24, undefined, "FAST");
  else text("PhilFreela", M, 28, { size: 22, bold: true, color: orange });
  text("PAYMENT RECEIPT", W - M, 20, { size: 18, bold: true, align: "right" });
  text(`Receipt no. ${r.receiptNo}`, W - M, 27, { size: 10, color: gray, align: "right" });
  text(`Made on ${r.madeOn}`, W - M, 32, { size: 10, color: gray, align: "right" });
  doc.setDrawColor(...orange);
  doc.setLineWidth(0.8);
  doc.line(M, 42, W - M, 42);

  // 2. Status band: green "Confirmed" or orange "Received less".
  const short = r.receivedAmount != null && r.receivedAmount < r.amount;
  const statusColor = short ? [176, 96, 0] : green;
  doc.setFillColor(...(short ? [255, 243, 224] : [232, 245, 237]));
  doc.roundedRect(M, 48, W - 2 * M, 12, 2, 2, "F");
  doc.setDrawColor(...statusColor);
  doc.setLineWidth(0.9);
  doc.line(M + 5, 54.2, M + 6.8, 56); // a drawn check mark (the font has none)
  doc.line(M + 6.8, 56, M + 10, 52.2);
  text(short ? "RECEIVED LESS" : "CONFIRMED", M + 13, 55.6, { size: 10, bold: true, color: statusColor });
  text(
    short ? `The freelancer received ${peso(r.receivedAmount)} on ${r.confirmedOn}` : `The freelancer confirmed the money arrived on ${r.confirmedOn}`,
    M + (short ? 44 : 38), 55.6, { size: 10 }
  );

  // 3. The big amount.
  text(short ? "Amount the client recorded" : "Amount paid", M, 70, { size: 10, color: gray });
  text(peso(r.amount), M, 81, { size: 26, bold: true });
  text("Paid through", W - M, 70, { size: 10, color: gray, align: "right" });
  text("GCash", W - M, 78, { size: 14, bold: true, align: "right" });

  // 4. Who paid and who was paid, in two boxes.
  const boxW = (W - 2 * M - 6) / 2;
  const box = (x, label, who, extra) => {
    doc.setDrawColor(...rule);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, 90, boxW, 32, 2, 2, "S");
    text(label, x + 5, 97, { size: 8, bold: true, color: gray });
    text(fit(who.name, boxW - 10, 12, true), x + 5, 105, { size: 12, bold: true });
    if (who.username) text(fit(`@${who.username}`, boxW - 10, 10), x + 5, 111, { size: 10, color: gray });
    if (extra) text(extra, x + 5, 117, { size: 10, color: gray });
  };
  box(M, "PAID BY (CLIENT)", r.client);
  box(M + boxW + 6, "PAID TO (FREELANCER)", r.freelancer, r.freelancer.initials ? `GCash name: ${r.freelancer.initials}` : "");

  // 5. What it was for.
  text("FOR", M, 132, { size: 8, bold: true, color: gray });
  text(fit(r.forLine, W - 2 * M, 12, true), M, 139, { size: 12, bold: true });

  // 6. Label / value rows, in sections.
  let y = 150;
  const section = (title) => {
    text(title.toUpperCase(), M, y, { size: 8, bold: true, color: gray });
    y += 3;
  };
  const row = (label, value, { bold = false, color = ink } = {}) => {
    doc.setDrawColor(...rule);
    doc.setLineWidth(0.3);
    doc.line(M, y, W - M, y);
    text(label, M, y + 5.3, { size: 10, color: bold ? ink : gray, bold });
    text(value, W - M, y + 5.3, { size: 10, bold, color, align: "right" });
    y += 7.5;
  };

  section("Payment");
  if (short) {
    // Less arrived: what was recorded, then what really arrived.
    row("Recorded by the client", peso(r.amount));
    if (r.tip > 0) row("Tip (included above)", peso(r.tip));
    row("Received by the freelancer", peso(r.receivedAmount), { bold: true });
  } else {
    row(r.balance ? "Toward the project price" : "Amount", peso(r.amount - r.tip));
    if (r.tip > 0) row("Tip", peso(r.tip));
    row("Total of this payment", peso(r.amount), { bold: true });
  }
  y += 8;

  if (r.balance) {
    section("Project balance (after this payment)");
    row("Agreed price", peso(r.balance.agreed));
    row("Paid so far", peso(r.balance.paid));
    row("Balance left", r.balance.fullyPaid ? "PHP 0.00  (Fully paid)" : peso(r.balance.left), {
      bold: true,
      color: r.balance.fullyPaid ? green : ink
    });
    y += 8;
  }

  section("GCash details");
  row("Reference no.", r.reference);
  row("Date paid (on the GCash receipt)", r.paidOn);
  row("Recorded on PhilFreela", r.recordedOn);
  row("Confirmed by the freelancer", r.confirmedOn);

  // 7. Footer: what this receipt is and is not.
  doc.setDrawColor(...rule);
  doc.line(M, 266, W - M, 266);
  const note =
    "PhilFreela only records this payment. The money was sent directly through GCash from the client to the " +
    "freelancer; PhilFreela did not hold, move or guarantee it. This is an acknowledgement receipt, not an " +
    "Official Receipt (BIR).";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...gray);
  doc.text(doc.splitTextToSize(note, W - 2 * M), M, 272);
  text("phil-freela.pages.dev", M, 287, { size: 8.5, color: gray });
  text(`Receipt ${r.receiptNo}  |  Page 1 of 1`, W - M, 287, { size: 8.5, color: gray, align: "right" });

  doc.setProperties({ title: `PhilFreela Receipt ${r.receiptNo}`, author: "PhilFreela" });
  return doc;
}

// Makes the receipt of one confirmed payment and downloads it as
// PhilFreela-Receipt-PF-XXXXXXXX.pdf. Returns "" when done, or a message to show.
export async function downloadPaymentReceipt(payment) {
  if (!hasReceipt(payment)) return "A receipt is made once the freelancer confirms the payment.";
  try {
    // jsPDF is loaded only now, so pages without a receipt don't get bigger.
    const [{ jsPDF }, facts, logo] = await Promise.all([import("jspdf"), loadReceiptFacts(payment), logoForPaper().catch(() => null)]);
    if (facts.error) return facts.error;
    drawReceipt(jsPDF, facts, logo).save(`PhilFreela-Receipt-${facts.receiptNo}.pdf`);
    return "";
  } catch (error) {
    console.error("Making the receipt failed:", error);
    return "Couldn't make the receipt. Please try again.";
  }
}
