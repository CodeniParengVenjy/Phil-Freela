import { supabase } from "./supabaseClient";
import { formatMoneyCode } from "./money";
import { receiptTime } from "./payments";
import { logoForPaper } from "./receiptPdf";
import { formatUserNumber } from "./userNumber";
import { revisionsLabel } from "./serviceTerms";

// Contract of Service (panel revision, PLAN-panel-revisions.md, item 12).
//
// A PDF both people on a project can download once they have agreed on a price.
// It is drawn in the browser with jsPDF, like the receipts (lib/receiptPdf.js),
// from what PhilFreela already saved: the two people, the work, the dates, the
// agreed price, the revisions and terms from the booked offer, and PhilFreela's
// rules for delivery, payment and ending a project (the same rules as the Terms
// of Service). No database change: making it twice gives the same contract,
// except for the "made on" date and anything that changed in between (for
// example a due date moved by an accepted request for more time).

// "PFC-" + the first 8 characters of the project id: one number per project.
export const contractNumber = (projectId) => `PFC-${String(projectId).replace(/-/g, "").slice(0, 8).toUpperCase()}`;

// Only a project with an agreed price gets a contract (a price is what makes it one).
export const hasContract = (project) => project?.price_status === "agreed";

const BASIS_WORDS = { project: "for the whole project", day: "per day", month: "per month" };
const SOURCE_WORDS = { service: "the booked offer's price", job: "the job post's budget", proposal: "proposed and agreed on the project page" };
const STATUS_WORDS = { started: "In progress", submitted: "Work sent, waiting for the client's review", done: "Done", ended: "Ended" };

const dayOnly = (value) => new Date(value).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", dateStyle: "long" });

// Everything the contract prints, read fresh from the database. Returns the
// facts, or { error }.
async function loadContractFacts(projectId) {
  const { data: p, error } = await supabase
    .from("projects")
    .select(`id, title, note, status, started_at, due_date, completed_at, ended_at,
      agreed_amount, price_basis, price_status, price_source, price_agreed_at, currency, job_post_id, booking_id,
      booking:bookings(revisions, extra_terms, created_at, service:services(title)),
      job_post:job_posts(title),
      client:profiles!projects_client_id_fkey(full_name, username, user_number),
      freelancer:profiles!projects_freelancer_id_fkey(full_name, username, user_number)`)
    .eq("id", projectId)
    .maybeSingle();
  if (error || !p) return { error: "Couldn't load the contract. Please try again." };
  if (!hasContract(p)) return { error: "The contract can be made once you both agree on a price." };
  const person = (row) => ({
    name: row?.full_name || row?.username || "PhilFreela user",
    username: row?.username || "",
    number: row?.user_number ? formatUserNumber(row.user_number) : ""
  });
  return { ...p, client: person(p.client), freelancer: person(p.freelancer) };
}

// The page, written top to bottom; a new page starts by itself when one is full.
function contractWriter(jsPDF) {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const W = 210;
  const M = 18;
  const BOTTOM = 272; // the footer lives below this
  const ink = [33, 37, 41];
  const gray = [108, 117, 125];
  const rule = [222, 226, 230];
  const orange = [245, 134, 0];
  let y = 20;

  const font = (size, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
  };
  const room = (height) => {
    if (y + height > BOTTOM) {
      doc.addPage();
      y = 20;
    }
  };

  return {
    doc,
    // Logo, title, number and date, then an orange line.
    header(logo, number, madeOn) {
      if (logo) doc.addImage(logo.data, "PNG", M, 12, (22 * logo.width) / logo.height, 22, undefined, "FAST");
      else { font(22, true); doc.setTextColor(...orange); doc.text("PhilFreela", M, 28); }
      font(18, true); doc.setTextColor(...ink); doc.text("CONTRACT OF SERVICE", W - M, 20, { align: "right" });
      font(10, false); doc.setTextColor(...gray);
      doc.text(`Contract no. ${number}`, W - M, 27, { align: "right" });
      doc.text(`Made on ${madeOn}`, W - M, 32, { align: "right" });
      doc.setDrawColor(...orange); doc.setLineWidth(0.8); doc.line(M, 40, W - M, 40);
      y = 50;
    },
    // A numbered heading ("3. Price and payment").
    heading(number, title) {
      room(14);
      y += 3;
      font(11, true); doc.setTextColor(...orange); doc.text(`${number}.`, M, y);
      doc.setTextColor(...ink); doc.text(title, M + 7, y);
      y += 6;
    },
    // A paragraph that wraps and breaks across pages.
    para(value, { color = ink, size = 10 } = {}) {
      font(size, false); doc.setTextColor(...color);
      for (const line of doc.splitTextToSize(String(value), W - 2 * M)) {
        room(5);
        doc.text(line, M, y);
        y += 5;
      }
      y += 1.5;
    },
    // A label on the left and its value on the right (the value may wrap).
    row(label, value) {
      // Measured in bold, the way the value is printed, so it never runs past the margin.
      font(10, true);
      const lines = doc.splitTextToSize(String(value), W - 2 * M - 52);
      room(5 * lines.length + 3);
      doc.setDrawColor(...rule); doc.setLineWidth(0.3); doc.line(M, y - 3.6, W - M, y - 3.6);
      font(10, false); doc.setTextColor(...gray); doc.text(label, M, y);
      font(10, true); doc.setTextColor(...ink); doc.text(lines, M + 52, y);
      y += 5 * lines.length + 2.5;
    },
    // Lines for signing a printed copy.
    signatures(left, right) {
      room(34);
      y += 16;
      const boxW = (W - 2 * M - 14) / 2;
      [left, right].forEach((who, i) => {
        const x = M + i * (boxW + 14);
        doc.setDrawColor(...ink); doc.setLineWidth(0.3); doc.line(x, y, x + boxW, y);
        font(10, true); doc.setTextColor(...ink); doc.text(who.name, x, y + 5);
        font(9, false); doc.setTextColor(...gray); doc.text(`${who.role} - signature over printed name`, x, y + 10);
      });
      y += 16;
    },
    // On every page: what this paper is, the address, the number and page count.
    footers(number) {
      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setDrawColor(...rule); doc.setLineWidth(0.3); doc.line(M, 277, W - M, 277);
        font(8, false); doc.setTextColor(...gray);
        doc.text("Made from PhilFreela's saved records. PhilFreela is not a party to this contract and does not hold, move or guarantee money.", M, 281);
        doc.text("phil-freela.pages.dev", M, 287);
        doc.text(`Contract ${number}  |  Page ${page} of ${pages}`, W - M, 287, { align: "right" });
      }
      doc.setProperties({ title: `PhilFreela Contract of Service ${number}`, author: "PhilFreela" });
    }
  };
}

function drawContract(w, c, logo) {
  const number = contractNumber(c.id);
  const money = (n) => formatMoneyCode(n, c.currency || "PHP");
  const fromOffer = Boolean(c.booking_id);
  const oneTime = c.price_basis === "project";
  const personLine = (who) => [who.name, who.username && `@${who.username}`, who.number && `(user no. ${who.number})`].filter(Boolean).join(" ");

  w.header(logo, number, receiptTime(new Date()));
  w.para(
    `This Contract of Service is between the Client and the Freelancer named below, for the project they agreed on ` +
      `through PhilFreela. It is made from the project's details as they were saved on PhilFreela, and PhilFreela's ` +
      `Terms of Service apply to it.`,
    { color: [73, 80, 87] }
  );

  w.heading(1, "The parties");
  w.row("Client", personLine(c.client));
  w.row("Freelancer", personLine(c.freelancer));

  w.heading(2, "The work");
  w.row("Project", c.title);
  w.row("How it started", fromOffer
    ? `The client booked the freelancer's offer${c.booking?.service?.title ? ` "${c.booking.service.title}"` : ""}, and the freelancer accepted.`
    : `The client hired the freelancer from the job post${c.job_post?.title ? ` "${c.job_post.title}"` : ""}.`);
  if (c.note) w.row("Details", c.note);
  w.row("Status today", STATUS_WORDS[c.status] || c.status);

  w.heading(3, "Dates");
  w.row("Started", receiptTime(c.started_at));
  w.row("Due date", `${dayOnly(`${c.due_date}T12:00:00+08:00`)} (end of the day, Philippine time)`);
  if (c.completed_at) w.row("Marked Done", receiptTime(c.completed_at));
  if (c.ended_at) w.row("Ended", receiptTime(c.ended_at));
  w.para(
    "The due date can move only when the client accepts the freelancer's request for more time (up to 7 days, twice). " +
      "Work first sent by the end of the due date is on time."
  );

  w.heading(4, "Price and payment");
  w.row("Agreed price", `${money(c.agreed_amount)} ${BASIS_WORDS[c.price_basis] || BASIS_WORDS.project}`);
  w.row("Agreed on", `${receiptTime(c.price_agreed_at)}${SOURCE_WORDS[c.price_source] ? ` (${SOURCE_WORDS[c.price_source]})` : ""}`);
  w.para(
    "The client pays the freelancer directly (GCash for pesos, or another way agreed between them for other currencies) " +
      "and records each payment on PhilFreela with its receipt. The freelancer confirms what arrived. Only what the " +
      "freelancer confirms counts as paid. PhilFreela never holds, moves or guarantees the money."
  );
  w.para(oneTime
    ? "Whatever is left of the price is due within 7 days after the project is marked Done. Files the freelancer " +
      "uploads stay locked, with only a watermarked preview, until the whole agreed price is paid."
    : "Files the freelancer uploads stay locked, with only a watermarked preview, until the freelancer confirms a payment.");
  w.para("Who pays first (a down payment, or the whole price after delivery) is agreed between the two people in the chat.");

  w.heading(5, "Revisions and the freelancer's terms");
  if (fromOffer) {
    w.row("Revisions included", revisionsLabel(c.booking?.revisions) || "Not stated in the offer: agreed in the chat");
    w.row("Freelancer's terms", c.booking?.extra_terms || "None written on the offer");
    w.para("These are the offer's revisions and terms as they were when the booking was sent. They can't override PhilFreela's Terms of Service.");
  } else {
    w.para("This project came from a job post, which doesn't set a number of revisions. The two people agree on revisions in the chat.");
  }

  w.heading(6, "Delivery and review");
  w.para(
    "The freelancer sends the work on the project page. The client then has 7 days to mark it Done or ask for " +
      "changes; with no answer after 7 days, the work is accepted automatically. Sending the work again after the " +
      "client asks for changes starts the 7 days over."
  );

  w.heading(7, "Use of the finished work");
  w.para(
    "The client gets the original files once they are paid as described in part 4. How the client may use the " +
      "finished work, and whether the freelancer may show it in their portfolio, is what the two people agreed in the " +
      "chat or in the freelancer's terms above."
  );

  w.heading(8, "Ending the project");
  w.para(
    "If the freelancer has sent nothing and the project is more than 7 days late, the client may end it. The " +
      "freelancer may withdraw while the project is still waiting for their work. PhilFreela ends a project that is 30 " +
      "days late with nothing sent. Ending a project moves no money: money already paid for work that never came is " +
      "returned directly, or reported."
  );

  w.heading(9, "Problems and reports");
  w.para(
    "Either person can report a problem (for example a payment that never arrived, or work that was paid for and " +
      "never sent) with PhilFreela's Report button. An admin reviews it under the Terms of Service and can suspend " +
      "or ban an account. A late project or payment alone is not a violation."
  );

  w.heading(10, "Agreement");
  w.para(fromOffer
    ? `The client agreed to this work by sending the booking, and the freelancer by accepting it. The price above was agreed on ${receiptTime(c.price_agreed_at)}.`
    : `The client agreed to this work by hiring the freelancer, and the freelancer by applying to the job post. The price above was agreed on ${receiptTime(c.price_agreed_at)}.`);
  w.signatures({ name: c.client.name, role: "Client" }, { name: c.freelancer.name, role: "Freelancer" });
  w.footers(number);
  return number;
}

// Makes the contract of one project and downloads it as
// PhilFreela-Contract-PFC-XXXXXXXX.pdf. Returns "" when done, or a message to show.
export async function downloadContract(projectId) {
  try {
    const [{ jsPDF }, logo, facts] = await Promise.all([import("jspdf"), logoForPaper().catch(() => null), loadContractFacts(projectId)]);
    if (facts.error) return facts.error;
    const writer = contractWriter(jsPDF);
    const number = drawContract(writer, facts, logo);
    writer.doc.save(`PhilFreela-Contract-${number}.pdf`);
    return "";
  } catch (error) {
    console.error("Making the contract failed:", error);
    return "Couldn't make the contract. Please try again.";
  }
}
