// send-offline-email: sends one "you have something waiting" email.
//
// Only the database calls this (see queue_offline_email in
// database/supabase_email_notifications_schema.sql). The database has already
// checked the rules (the user is offline, has the setting on, and wasn't
// emailed about this chat in the last 30 minutes); this function just writes
// the email and sends it through PhilFreela's Gmail account.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   GMAIL_USER          the Gmail address the emails come from
//   GMAIL_APP_PASSWORD  a Gmail "App Password" for it (not the real password)
//   EMAIL_HOOK_SECRET   the same code saved in Vault as email_hook_secret
import nodemailer from "npm:nodemailer@6.9.16";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://phil-freela.pages.dev";

// Gmail's secure port (465). Supabase blocks the other mail ports.
const mailer = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: Deno.env.get("GMAIL_USER"), pass: Deno.env.get("GMAIL_APP_PASSWORD") }
});

// Names and job titles are typed by users, so they're escaped before going
// into the email's HTML (otherwise someone could name themselves "<a href=...>").
function escapeHtml(text: unknown): string {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

type Details = {
  kind: "message" | "missed_call" | "application" | "notification";
  to: string;
  name?: string;
  from?: string;
  call_kind?: string;
  job_title?: string;
  title?: string;
  message?: string;
  link?: string;
};

// The subject, the main sentence and the button text for each kind of email.
// A chat email never includes the message itself (privacy).
function writeEmail(d: Details) {
  const from = d.from || "Someone";
  switch (d.kind) {
    case "message":
      return { subject: `${from} sent you a message on PhilFreela`, line: `${from} sent you a new message.`, button: "Open chat" };
    case "missed_call": {
      const callKind = d.call_kind === "video" ? "video" : "voice";
      return { subject: `Missed ${callKind} call from ${from}`, line: `You missed a ${callKind} call from ${from}.`, button: "Open chat" };
    }
    case "application":
      return { subject: `${from} applied to your job "${d.job_title ?? ""}"`, line: `${from} applied to your job "${d.job_title ?? ""}" and sent a resume.`, button: "See applicants" };
    case "notification":
      return { subject: d.title || "News about your PhilFreela account", line: d.message || "", button: "Open PhilFreela" };
  }
}

// Same colors as the sign-up email (database/email-templates).
function emailHtml(name: string, line: string, button: string, url: string) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background-color:#090a0f;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#090a0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#1c2130;border-radius:16px;padding:32px;">
        <tr><td style="font-size:22px;font-weight:bold;color:#ff6b00;padding-bottom:20px;">PhilFreela</td></tr>
        <tr><td style="font-size:16px;color:#f8fafc;padding-bottom:8px;">Hi ${escapeHtml(name)},</td></tr>
        <tr><td style="font-size:15px;line-height:1.5;color:#f8fafc;padding-bottom:24px;">${escapeHtml(line)}</td></tr>
        <tr><td style="padding-bottom:24px;">
          <a href="${escapeHtml(url)}" style="display:inline-block;background-color:#ff6b00;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 28px;border-radius:999px;">${escapeHtml(button)}</a>
        </td></tr>
        <tr><td style="font-size:12px;line-height:1.5;color:#94a3b8;">
          You got this because you weren't on PhilFreela at the time. To stop these emails, turn off
          "Email me when I'm offline" in Settings &gt; Privacy &amp; Notifications.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Only the database knows this code, so nobody else can use this function
  // to send emails.
  const secret = Deno.env.get("EMAIL_HOOK_SECRET");
  if (!secret || req.headers.get("x-email-secret") !== secret) {
    return new Response("Not allowed", { status: 401 });
  }

  let details: Details;
  try {
    details = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const email = details.to ? writeEmail(details) : undefined;
  if (!email) return new Response("Bad request", { status: 400 });

  // Links from the database are always paths like "/dashboard/chat/<id>";
  // anything else goes to the home page, so the button can't point to
  // another website.
  const path = typeof details.link === "string" && details.link.startsWith("/") && !details.link.startsWith("//")
    ? details.link
    : "/";
  const url = SITE_URL + path;
  const name = details.name || "there";

  try {
    await mailer.sendMail({
      from: `"PhilFreela" <${Deno.env.get("GMAIL_USER")}>`,
      to: details.to,
      subject: email.subject,
      // Plain-text copy for email apps that don't show HTML.
      text: `Hi ${name},\n\n${email.line}\n\n${email.button}: ${url}\n\nTo stop these emails, turn off "Email me when I'm offline" in Settings > Privacy & Notifications.`,
      html: emailHtml(name, email.line, email.button, url)
    });
  } catch (error) {
    console.error("Sending failed:", error);
    return new Response("Sending failed", { status: 502 });
  }

  return new Response("Sent", { status: 200 });
});
