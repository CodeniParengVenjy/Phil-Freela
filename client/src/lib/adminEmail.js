// A person's user account and their admin account are two separate logins,
// so they need two different email addresses. Gmail delivers mail for
// name+anything@gmail.com to name@gmail.com, so for a Gmail address the admin
// login is that address with "+admin" added. The super admin types the email
// they know, the person's own account keeps its normal address, and mail for
// both arrives in the same inbox.
//
// Other mail providers may not deliver "+" addresses, so theirs stay exactly
// as typed. So does a Gmail address that already has a "+" in it.
const GMAIL_DOMAINS = ["gmail.com", "googlemail.com"];

// The reverse, as a suggestion: the person's own account email for a Gmail admin
// login (name+admin@gmail.com gives name@gmail.com). Anything else comes back
// empty, because there is no way to guess it.
export function userEmailSuggestionFor(adminEmail) {
  const match = /^(.+)\+admin@(gmail\.com|googlemail\.com)$/i.exec(adminEmail.trim());
  return match ? `${match[1]}@${match[2]}`.toLowerCase() : "";
}

export function adminEmailFor(email) {
  const typed = email.trim().toLowerCase();
  const at = typed.lastIndexOf("@");
  const name = typed.slice(0, at);
  const domain = typed.slice(at + 1);
  if (at < 1 || !GMAIL_DOMAINS.includes(domain) || name.includes("+")) return typed;
  return `${name}+admin@${domain}`;
}
