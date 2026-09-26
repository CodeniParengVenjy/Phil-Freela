// Cloudflare Pages Function: on the live site, forwards the website's /ai/...
// requests to the Python AI service (running on the laptop, shared through its
// ngrok link). It does the same job the dev server's /ai forwarding does on the
// laptop (see vite.config.js).
//
// Why: the browser only ever talks to phil-freela.pages.dev, which every
// network can find. Some Wi-Fi networks can't look up (or block) ngrok links,
// but Cloudflare can reach them from its side, so visitors never need to
// change any settings.
//
// The ngrok link is set in Cloudflare Pages > Settings > Variables and
// secrets as AI_SERVICE_URL (no slash at the end). VITE_AI_SERVICE_URL is the
// older name for the same setting and still works.

const OFFLINE = "The verification service is offline right now. Please try again later.";

// Only these request headers are passed on (the login token, and the photo
// form's type). Cookies and anything else from the browser stay here.
const FORWARDED_HEADERS = ["authorization", "content-type", "accept"];

export async function onRequest({ request, env, params }) {
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ detail: "Method not allowed." }, { status: 405 });
  }

  const serviceUrl = (env.AI_SERVICE_URL || env.VITE_AI_SERVICE_URL || "").replace(/\/+$/, "");
  if (!serviceUrl) return offline();

  // "/ai/checks/id-front?x=1" -> "<ngrok link>/checks/id-front?x=1"
  const path = [].concat(params.path || []).map(encodeURIComponent).join("/");
  const target = `${serviceUrl}/${path}${new URL(request.url).search}`;

  const headers = new Headers({ "ngrok-skip-browser-warning": "true" });
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  let response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "POST" ? request.body : undefined
    });
  } catch {
    return offline();
  }

  // Passed back as-is. When the laptop isn't running the service, ngrok
  // answers with its own web page, which the website already treats as
  // "offline" (it only accepts JSON replies).
  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "text/plain",
      "cache-control": "no-store"
    }
  });
}

function offline() {
  return Response.json({ detail: OFFLINE }, { status: 502 });
}
