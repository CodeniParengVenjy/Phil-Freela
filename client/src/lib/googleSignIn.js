import { supabase } from "./supabaseClient";

// "Sign in with Google" using Google's own button (Google Identity Services).
// Google's window then opens from phil-freela.pages.dev, so it says
// "to continue to phil-freela.pages.dev" instead of the Supabase address that
// the redirect sign-in shows. Google hands back an ID token (a signed "this is
// who they are" note), and Supabase turns it into a normal PhilFreela session.

// The "PhilFreela Web" OAuth client in Google Cloud (project "philfreela").
// A client ID is public (it's in every Google sign-in link), so it can live
// here. The client SECRET is only saved in Supabase, never in this code.
export const GOOGLE_CLIENT_ID = "527197462879-l66i0tcstulkckmof1lghnaalf39ulkl.apps.googleusercontent.com";

const SCRIPT_URL = "https://accounts.google.com/gsi/client";
let scriptPromise = null;

// Loads Google's sign-in script once, and gives back its sign-in tools.
function loadGoogleScript() {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) {
        resolve(window.google.accounts.id);
        return;
      }
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("Google sign-in didn't load.")));
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("Google sign-in couldn't be loaded."));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

// A one-time random code (a "nonce"). Google puts its SHA-256 hash inside the
// ID token; Supabase hashes the original again and checks that they match, so
// a token copied from somewhere else can't be used to sign in.
async function makeNonce() {
  const raw = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const hashed = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { raw, hashed };
}

// What the page wants done after a Google sign-in (set by renderGoogleButton).
let currentHandlers = null;
let setupPromise = null;

// Google asks to be set up only once per page load, so this runs one time and
// later calls reuse it.
function setUpGoogle() {
  if (!setupPromise) {
    setupPromise = (async () => {
      const googleId = await loadGoogleScript();
      const nonce = await makeNonce();
      googleId.initialize({
        client_id: GOOGLE_CLIENT_ID,
        nonce: nonce.hashed,
        callback: async ({ credential }) => {
          const { data, error } = await supabase.auth.signInWithIdToken({ provider: "google", token: credential, nonce: nonce.raw });
          if (error) currentHandlers?.onError(error);
          else currentHandlers?.onSignedIn(data.user);
        }
      });
      return googleId;
    })().catch((error) => {
      setupPromise = null; // lets a later visit try again
      throw error;
    });
  }
  return setupPromise;
}

// Draws Google's "Continue with Google" button inside `container`. After the
// person picks their Google account, onSignedIn(user) runs with the signed-in
// Supabase user, or onError(error) if it failed. Throws if Google's script
// can't load, so the page can show the old redirect button instead.
export async function renderGoogleButton(container, { onSignedIn, onError }) {
  currentHandlers = { onSignedIn, onError };
  const googleId = await setUpGoogle();

  // Google only allows 200 to 400 px wide, so match the card as closely as possible.
  const width = Math.max(200, Math.min(400, container.offsetWidth || 400));
  googleId.renderButton(container, { theme: "filled_black", size: "large", text: "continue_with", shape: "rectangular", logo_alignment: "center", width });
  await waitForVisibleButton(container);
}

// Google hides its button when something is set up wrong, for example when
// this site's address isn't in the OAuth client's "Authorized JavaScript
// origins". Waits up to 3 seconds for it to show, and throws if it doesn't,
// so the page can use the older redirect button instead.
async function waitForVisibleButton(container) {
  for (let waited = 0; waited < 3000; waited += 250) {
    if (container.querySelector("iframe")?.offsetHeight > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Google's sign-in button didn't appear.");
}
