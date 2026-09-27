import { supabase } from "./supabaseClient";

// Shared by the Verify Identity page, the status card in Profile Settings,
// and (later) the admin page.

// Must match the id_type values allowed in the identity_verifications table.
// Passports have no card back, so they're the only type without a back photo
// (the database enforces the same rule).
export const ID_TYPES = [
  { value: "philsys", label: "PhilSys National ID", hasBack: true },
  { value: "drivers_license", label: "Driver's License", hasBack: true },
  { value: "passport", label: "Passport", hasBack: false },
  { value: "umid", label: "UMID", hasBack: true },
  { value: "prc", label: "PRC ID", hasBack: true }
];

export function idTypeHasBack(value) {
  return ID_TYPES.find((type) => type.value === value)?.hasBack ?? true;
}

// SFace "distance" between the ID face and the face scan: the lower, the more
// alike. 0.637 or lower counts as the same person (the AI service's cutoff,
// OpenCV's recommended value); 0.50 or lower is a strong match (on sample
// photos, the same person measured 0.49 or lower, different people 0.64 or higher).
export const MATCH_DISTANCE = 0.637;
export const STRONG_MATCH_DISTANCE = 0.5;

// The AI's suggestion for the admin: level "good", "careful" or "reject",
// with the text shown. It only reads the results the AI service saved.
export function aiSuggestion(verification) {
  if (!verification.liveness_passed) {
    return { level: "reject", icon: "🔴", text: "The face scan looks suspicious (different faces in the scan). Likely reject." };
  }
  if (!verification.face_match) {
    return { level: "reject", icon: "🔴", text: "The face doesn't match the ID. Likely reject." };
  }
  if (verification.face_distance > STRONG_MATCH_DISTANCE) {
    return { level: "careful", icon: "🟡", text: "Only a weak face match. Compare the photos carefully." };
  }
  return { level: "good", icon: "🟢", text: "Looks good. Likely safe to approve." };
}

// Short labels and colors for the suggestion badge in the admin list.
export const suggestionLabels = { good: "Looks good", careful: "Check carefully", reject: "Likely reject" };
export const suggestionBadgeClass = { good: "bg-success", careful: "bg-warning text-dark", reject: "bg-danger" };

// True when the user has an approved verification (the Verified badge).
// Uses the database's is_verified check, which only answers yes/no: it
// never exposes anyone's photos or details.
export async function fetchIsVerified(userId) {
  const { data, error } = await supabase.rpc("is_verified", { target: userId });
  return !error && data === true;
}

// Which of these users are verified, as a Set of their ids. Pages that show
// many names (services, job posts, inbox, chat) ask once for all of them.
export async function fetchVerifiedIds(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase.rpc("verified_user_ids", { ids });
  return new Set(error ? [] : data);
}

// True on phones and tablets, which take photos with their own cameras
// instead of a webcam and don't need a QR code.
export function isPhone() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// The website address a phone should open. "localhost" only works on the
// laptop itself, so VITE_PUBLIC_APP_URL in client/.env holds the laptop's
// Wi-Fi address (e.g. http://192.168.1.5:5173) for the QR code.
export const PUBLIC_APP_URL = import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin;

// The user's newest verification attempt, or null if they never sent one.
// Users can only read their own rows (database rule), so this can never
// return someone else's.
export function fetchLatestVerification(userId) {
  return supabase
    .from("identity_verifications")
    .select("status, admin_note, created_at, reviewed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}
