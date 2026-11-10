import { supabase } from "./supabaseClient";
import { formatReference, projectMoney, receiptTime, unlocksWhenFullyPaid } from "./payments";
import { getPurchase, purchaseNumber } from "./purchases";

// PDF receipts (PLAN-payment-receipt.md), drawn in the browser with jsPDF, so no
// server and no database change are needed: everything printed on them is
// already saved. Two kinds share one look:
//  - a GCash payment between a client and a freelancer, once the freelancer
//    answered Confirm received or Received less (both people can download it)
//  - something the person paid PhilFreela for online through Xendit: Premium, a
//    Featured post or a Community Billboard ad (Settings > Purchases)

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

// The pieces both receipts are made of, on one A4 page (sizes in millimetres).
// Each piece draws itself at the right height; rows move down the page by themselves.
function receiptKit(jsPDF) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const W = 210; // page width
  const M = 18; // left and right margin
  const ink = [33, 37, 41];
  const gray = [108, 117, 125];
  const rule = [222, 226, 230];
  const orange = [245, 134, 0];
  const green = [25, 135, 84];
  let y = 0; // where the next row goes

  const text = (value, x, top, { size = 10, bold = false, color = ink, align = "left", angle = 0 } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.text(String(value), x, top, { align, angle });
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

  return {
    doc,
    green,
    // A big light word across the page ("TEST PAYMENT"), drawn first so
    // everything else sits on top of it.
    stamp(word) {
      text(word, 40, 230, { size: 70, bold: true, color: [241, 243, 245], angle: 40 });
    },
    // Logo on the left, title, receipt number and date on the right, orange line.
    header(logo, number, madeOn) {
      if (logo) doc.addImage(logo.data, "PNG", M, 12, (24 * logo.width) / logo.height, 24, undefined, "FAST");
      else text("PhilFreela", M, 28, { size: 22, bold: true, color: orange });
      text("PAYMENT RECEIPT", W - M, 20, { size: 18, bold: true, align: "right" });
      text(`Receipt no. ${number}`, W - M, 27, { size: 10, color: gray, align: "right" });
      text(`Made on ${madeOn}`, W - M, 32, { size: 10, color: gray, align: "right" });
      doc.setDrawColor(...orange);
      doc.setLineWidth(0.8);
      doc.line(M, 42, W - M, 42);
    },
    // The colored band under the header: green, or orange when warn is true.
    band({ warn, label, sentence }) {
      const color = warn ? [176, 96, 0] : green;
      doc.setFillColor(...(warn ? [255, 243, 224] : [232, 245, 237]));
      doc.roundedRect(M, 48, W - 2 * M, 12, 2, 2, "F");
      doc.setDrawColor(...color);
      doc.setLineWidth(0.9);
      doc.line(M + 5, 54.2, M + 6.8, 56); // a drawn check mark (the font has none)
      doc.line(M + 6.8, 56, M + 10, 52.2);
      text(label, M + 13, 55.6, { size: 10, bold: true, color });
      const after = M + 13 + doc.getTextWidth(label) + 4;
      text(fit(sentence, W - M - 4 - after, 10, false), after, 55.6, { size: 10 });
    },
    // The big amount on the left, a small label and value on the right.
    amount(label, value, sideLabel, sideValue) {
      text(label, M, 70, { size: 10, color: gray });
      text(peso(value), M, 81, { size: 26, bold: true });
      text(sideLabel, W - M, 70, { size: 10, color: gray, align: "right" });
      text(sideValue, W - M, 78, { size: 14, bold: true, align: "right" });
    },
    // Two boxes side by side: { label, lines: [bold line, gray line, gray line] }.
    boxes(left, right) {
      const boxW = (W - 2 * M - 6) / 2;
      [left, right].forEach(({ label, lines }, i) => {
        const x = M + i * (boxW + 6);
        doc.setDrawColor(...rule);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, 90, boxW, 32, 2, 2, "S");
        text(label, x + 5, 97, { size: 8, bold: true, color: gray });
        if (lines[0]) text(fit(lines[0], boxW - 10, 12, true), x + 5, 105, { size: 12, bold: true });
        if (lines[1]) text(fit(lines[1], boxW - 10, 10, false), x + 5, 111, { size: 10, color: gray });
        if (lines[2]) text(fit(lines[2], boxW - 10, 10, false), x + 5, 117, { size: 10, color: gray });
      });
    },
    // A small gray label and one bold line ("FOR / Project: Logo design").
    labelLine(label, value, top) {
      text(label, M, top, { size: 8, bold: true, color: gray });
      text(fit(value, W - 2 * M, 12, true), M, top + 7, { size: 12, bold: true });
    },
    moveTo(top) {
      y = top;
    },
    gap() {
      y += 8;
    },
    section(title) {
      text(title.toUpperCase(), M, y, { size: 8, bold: true, color: gray });
      y += 3;
    },
    // One label / value row with a thin line above it.
    row(label, value, { bold = false, color = ink } = {}) {
      doc.setDrawColor(...rule);
      doc.setLineWidth(0.3);
      doc.line(M, y, W - M, y);
      const valueText = fit(value, 110, 10, bold);
      text(fit(label, W - 2 * M - doc.getTextWidth(valueText) - 6, 10, bold), M, y + 5.3, { size: 10, color: bold ? ink : gray, bold });
      text(valueText, W - M, y + 5.3, { size: 10, bold, color, align: "right" });
      y += 7.5;
    },
    // What this receipt is and is not, the address and the receipt number.
    footer(note, number) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      const lines = doc.splitTextToSize(note, W - 2 * M);
      const top = 270 - 2 * lines.length;
      doc.setDrawColor(...rule);
      doc.setLineWidth(0.3);
      doc.line(M, top, W - M, top);
      doc.setTextColor(...gray);
      doc.text(lines, M, top + 6);
      text("phil-freela.pages.dev", M, 287, { size: 8.5, color: gray });
      text(`Receipt ${number}  |  Page 1 of 1`, W - M, 287, { size: 8.5, color: gray, align: "right" });
      doc.setProperties({ title: `PhilFreela Receipt ${number}`, author: "PhilFreela" });
    }
  };
}

// ----- 1. A GCash payment between a client and a freelancer -----

// Reads what the receipt needs besides the payment row: the two people, and for
// a project payment the project and its other payments (for the balance).
// Returns the facts to print, or { error }.
async function loadPaymentFacts(payment) {
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
    number: receiptNumber(payment),
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

function drawPaymentReceipt(kit, r, logo) {
  const short = r.receivedAmount != null && r.receivedAmount < r.amount;
  kit.header(logo, r.number, receiptTime(new Date()));
  kit.band(short
    ? { warn: true, label: "RECEIVED LESS", sentence: `The freelancer received ${peso(r.receivedAmount)} on ${r.confirmedOn}` }
    : { warn: false, label: "CONFIRMED", sentence: `The freelancer confirmed the money arrived on ${r.confirmedOn}` });
  kit.amount(short ? "Amount the client recorded" : "Amount paid", r.amount, "Paid through", "GCash");
  kit.boxes(
    { label: "PAID BY (CLIENT)", lines: [r.client.name, r.client.username && `@${r.client.username}`] },
    { label: "PAID TO (FREELANCER)", lines: [r.freelancer.name, r.freelancer.username && `@${r.freelancer.username}`, r.freelancer.initials && `GCash name: ${r.freelancer.initials}`] }
  );
  kit.labelLine("FOR", r.forLine, 132);

  kit.moveTo(150);
  kit.section("Payment");
  if (short) {
    // Less arrived: what was recorded, then what really arrived.
    kit.row("Recorded by the client", peso(r.amount));
    if (r.tip > 0) kit.row("Tip (included above)", peso(r.tip));
    kit.row("Received by the freelancer", peso(r.receivedAmount), { bold: true });
  } else {
    kit.row(r.balance ? "Toward the project price" : "Amount", peso(r.amount - r.tip));
    if (r.tip > 0) kit.row("Tip", peso(r.tip));
    kit.row("Total of this payment", peso(r.amount), { bold: true });
  }
  kit.gap();

  if (r.balance) {
    kit.section("Project balance (after this payment)");
    kit.row("Agreed price", peso(r.balance.agreed));
    kit.row("Paid so far", peso(r.balance.paid));
    kit.row("Balance left", r.balance.fullyPaid ? "PHP 0.00  (Fully paid)" : peso(r.balance.left), {
      bold: true,
      color: r.balance.fullyPaid ? kit.green : undefined
    });
    kit.gap();
  }

  kit.section("GCash details");
  kit.row("Reference no.", r.reference);
  kit.row("Date paid (on the GCash receipt)", r.paidOn);
  kit.row("Recorded on PhilFreela", r.recordedOn);
  kit.row("Confirmed by the freelancer", r.confirmedOn);

  kit.footer(
    "PhilFreela only records this payment. The money was sent directly through GCash from the client to the " +
      "freelancer; PhilFreela did not hold, move or guarantee it. This is an acknowledgement receipt, not an " +
      "Official Receipt (BIR).",
    r.number
  );
}

// ----- 2. Something bought from PhilFreela online (Premium, Featured, an ad) -----

// The buyer's own profile, for "Bought by". Returns { name, username, role } or null.
async function loadBuyer(userId) {
  const { data, error } = await supabase.from("profiles").select("full_name, username, account_type").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  return {
    name: data.full_name || data.username || "PhilFreela user",
    username: data.username || "",
    role: data.account_type === "freelancer" ? "Freelancer" : data.account_type === "client" ? "Client" : ""
  };
}

function drawPurchaseReceipt(kit, p, buyer, logo) {
  const paidOn = p.paid_at ? receiptTime(p.paid_at) : "-";
  const number = purchaseNumber(p);
  if (p.test_mode) kit.stamp("TEST PAYMENT");
  kit.header(logo, number, receiptTime(new Date()));
  kit.band(p.test_mode
    ? { warn: true, label: "TEST PAYMENT", sentence: `Xendit test mode on ${paidOn}: no real money was charged` }
    : { warn: false, label: "PAID", sentence: `Paid online through Xendit on ${paidOn}` });
  kit.amount("Amount paid", p.amount, "Paid through", "Xendit");
  kit.boxes(
    { label: "BOUGHT BY", lines: [buyer.name, buyer.username && `@${buyer.username}`, buyer.role] },
    { label: "SOLD BY", lines: ["PhilFreela", "phil-freela.pages.dev", "PhilFreela's own service"] }
  );

  kit.moveTo(133);
  kit.section("What you bought");
  kit.row(p.item, peso(p.amount));
  if (p.detail) kit.row(p.detail[0], p.detail[1]);
  if (p.startsAt) kit.row("Runs from", receiptTime(p.startsAt));
  if (p.endsAt) kit.row("Until", receiptTime(p.endsAt));
  kit.row("Total", peso(p.amount), { bold: true });
  kit.gap();

  kit.section("Payment details");
  kit.row("Paid through", "Xendit online checkout");
  if (p.xenditId) kit.row("Xendit payment ID", p.xenditId);
  kit.row("Checkout started", receiptTime(p.created_at));
  kit.row("Paid on", paidOn);
  kit.row("Mode", p.test_mode ? "Test (no real money)" : "Live");

  kit.footer(
    "This is PhilFreela's own service, paid online through Xendit, a payment company. PhilFreela never sees your GCash, " +
      "Maya or bank details. This is an acknowledgement receipt, not a BIR-registered invoice or Official Receipt." +
      (p.test_mode ? " While PhilFreela is a student project, payments run in Xendit's test mode: no real money was charged." : ""),
    number
  );
  return number;
}

// ----- Downloading -----

// jsPDF and the logo are loaded only when a receipt is asked for, so pages
// without one don't get bigger.
const loadTools = () => Promise.all([import("jspdf"), logoForPaper().catch(() => null)]);

// Makes the receipt of one confirmed payment and downloads it as
// PhilFreela-Receipt-PF-XXXXXXXX.pdf. Returns "" when done, or a message to show.
export async function downloadPaymentReceipt(payment) {
  if (!hasReceipt(payment)) return "A receipt is made once the freelancer confirms the payment.";
  try {
    const [[{ jsPDF }, logo], facts] = await Promise.all([loadTools(), loadPaymentFacts(payment)]);
    if (facts.error) return facts.error;
    const kit = receiptKit(jsPDF);
    drawPaymentReceipt(kit, facts, logo);
    kit.doc.save(`PhilFreela-Receipt-${facts.number}.pdf`);
    return "";
  } catch (error) {
    console.error("Making the receipt failed:", error);
    return "Couldn't make the receipt. Please try again.";
  }
}

// Makes the receipt of one paid purchase (a row from listMyPurchases(), or a
// checkout id right after paying) and downloads it as
// PhilFreela-Receipt-PFO-XXXXXXXX.pdf. Returns "" when done, or a message to show.
export async function downloadPurchaseReceipt(purchaseOrCheckoutId, userId) {
  try {
    let purchase = purchaseOrCheckoutId;
    if (typeof purchase === "string") {
      const found = await getPurchase(purchase);
      if (found.error) return found.error;
      purchase = found.data;
    }
    const [[{ jsPDF }, logo], buyer] = await Promise.all([loadTools(), loadBuyer(userId)]);
    if (!buyer) return "Couldn't load the receipt. Please try again.";
    const kit = receiptKit(jsPDF);
    const number = drawPurchaseReceipt(kit, purchase, buyer, logo);
    kit.doc.save(`PhilFreela-Receipt-${number}.pdf`);
    return "";
  } catch (error) {
    console.error("Making the receipt failed:", error);
    return "Couldn't make the receipt. Please try again.";
  }
}
