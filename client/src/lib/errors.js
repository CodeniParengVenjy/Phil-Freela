// supabase-js surfaces a network-level failure (DNS, offline, blocked by an ad
// blocker/firewall/VPN, CORS) as a raw browser fetch error, e.g. "Failed to
// fetch" (Chrome), "NetworkError when attempting to fetch resource." (Firefox),
// or "Load failed" (Safari). None of those tell the user anything actionable,
// so translate them into one clear message. Errors we threw ourselves
// (e.g. "Invalid credentials.") pass through unchanged.
export function getFriendlyErrorMessage(error) {
  const message = error?.message || "Something went wrong. Please try again.";
  const lower = message.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower === "load failed") {
    return "Could not reach the server. Check your internet connection, and make sure nothing (an ad blocker, firewall, or VPN) is blocking requests to supabase.co, then try again.";
  }
  if (lower.includes("email rate limit exceeded")) {
    return "Too many account emails were sent in a short time. Please wait a while before trying again.";
  }
  if (lower.includes("email not confirmed")) {
    return "Please confirm your email address before signing in. Check your inbox (and spam folder) for the confirmation link.";
  }
  if (lower.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  return message;
}
