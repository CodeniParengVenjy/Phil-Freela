// Cloudflare Pages Function at /turn: gives a logged-in user the TURN relay
// servers for voice/video calls (see src/lib/calls.js).
//
// Why: two devices on different networks (a phone on mobile data, school
// Wi-Fi) often can't connect to each other directly. A TURN server relays
// the call's voice and video between them instead.
//
// The relay's passwords stay here, in Cloudflare Pages > Settings >
// Variables and secrets, never in the website's code. Either:
//   - Cloudflare Realtime TURN: TURN_KEY_ID and TURN_KEY_API_TOKEN. Each
//     call gets passwords that expire after a few hours.
//   - or a TURN account with a fixed login (e.g. ExpressTURN): TURN_URL
//     (e.g. "turn:relay.example.com:3478", several separated by commas),
//     TURN_USERNAME and TURN_PASSWORD.
// With neither set, it answers with no servers and calls try a direct
// connection only.

const TTL_SECONDS = 4 * 60 * 60; // Cloudflare passwords work for 4 hours

export async function onRequestGet({ request, env }) {
  const noServers = () => json({ iceServers: [] });
  const useCloudflare = env.TURN_KEY_ID && env.TURN_KEY_API_TOKEN;
  if (!useCloudflare && !env.TURN_URL) return noServers();

  // Only for logged-in users: ask Supabase whether the login token is real.
  if (!(await isLoggedIn(request, env))) return json({ detail: "Please log in first." }, 401);

  if (!useCloudflare) {
    return json({
      iceServers: [{
        urls: env.TURN_URL.split(",").map((url) => url.trim()).filter(Boolean),
        username: env.TURN_USERNAME,
        credential: env.TURN_PASSWORD
      }]
    });
  }

  let response;
  try {
    response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: TTL_SECONDS })
    });
  } catch {
    return noServers();
  }
  if (!response.ok) return noServers();

  const { iceServers = [] } = await response.json();
  // Browsers block port 53, and waiting for it only slows the call down.
  const usable = iceServers
    .map((server) => ({ ...server, urls: [].concat(server.urls).filter((url) => !/:53(\?|$)/.test(url)) }))
    .filter((server) => server.urls.length > 0);
  return json({ iceServers: usable });
}

async function isLoggedIn(request, env) {
  const authorization = request.headers.get("authorization") || "";
  const supabaseUrl = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!authorization.startsWith("Bearer ") || !supabaseUrl || !anonKey) return false;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, authorization } });
    return response.ok;
  } catch {
    return false;
  }
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}
