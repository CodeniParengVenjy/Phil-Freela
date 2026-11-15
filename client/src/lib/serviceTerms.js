// Revisions and the freelancer's own terms on an offer (panel revision,
// PLAN-panel-revisions.md, item 7). The freelancer says how many rounds of
// changes the price includes, and can add their own short terms (what's
// included, what costs extra...). The client reads both on the offer page
// before booking, and both are copied into the booking when it is sent
// (database/supabase_service_terms_schema.sql), so a later edit of the offer
// never changes what a client already agreed to. They are also written in the
// Contract of Service (lib/contractPdf.js).
//
// The values match the check on services.revisions and bookings.revisions,
// so do not rename them. An empty value (older offers) means "not stated".
export const REVISION_OPTIONS = [
  { value: "0", label: "No revisions" },
  { value: "1", label: "1 revision" },
  { value: "2", label: "2 revisions" },
  { value: "3", label: "3 revisions" },
  { value: "4", label: "4 revisions" },
  { value: "5", label: "5 revisions" },
  { value: "unlimited", label: "Unlimited revisions" }
];

// The longest "Your terms" text (the same limit as the database).
export const MAX_EXTRA_TERMS = 500;

// "2 revisions", or null when the offer doesn't say.
export function revisionsLabel(value) {
  return REVISION_OPTIONS.find((option) => option.value === value)?.label ?? null;
}
