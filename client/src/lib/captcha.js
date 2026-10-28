import { useCallback, useState } from "react";
import "../styles/captcha.css";

// The "are you a robot?" check: Cloudflare Turnstile in Managed mode. Most
// people see a small box that ticks itself in about a second; only a browser
// that looks suspicious is asked to click "Verify you are human". The box
// hands the page a one-time token, the page sends it along with the sign-in
// or sign-up, and Supabase asks Cloudflare whether it is real (Supabase >
// Authentication > Attack Protection holds the secret key). A bot can't skip
// this by calling Supabase directly, because the refusal happens there.
//
// The site key is public. Leave it out and nothing here does anything, so the
// website works as before (the laptop, the tests, the days before the switch
// in Supabase is turned on).
// Trimmed: a space or line break copied along with the key into Cloudflare
// Pages' variable makes Turnstile refuse it ("Invalid input for parameter sitekey").
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
export const CAPTCHA_SITE_KEY = SITE_KEY;
export const captchaEnabled = Boolean(SITE_KEY);

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise = null;

export const CAPTCHA_CANT_LOAD = "The human check couldn't load. If you use an ad blocker, turn it off for this site, then refresh the page.";

// Loads Cloudflare's script once, and gives back its tools.
export function loadTurnstile() {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.async = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error(CAPTCHA_CANT_LOAD)));
      script.onerror = () => {
        scriptPromise = null;
        script.remove();
        reject(new Error(CAPTCHA_CANT_LOAD));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

// Dark on the sign-in pages and the dashboard's dark mode, light on its light mode.
function boxTheme() {
  return document.body.classList.contains("theme-light") ? "light" : "dark";
}

// The pieces the sign-in forms use (see CaptchaBox.jsx). A token works once
// and runs out after 5 minutes, so a form calls reset() after EVERY attempt,
// good or bad, and the box gets a fresh one.
//
//   captcha.waiting   true while the button should wait for the box
//   captcha.token     the token to send, or "" when there is none (also "" when the check is off)
//   captcha.problem   a sentence to show when the box can't work
//   captcha.reset()   after an attempt
export function useCaptcha() {
  const [token, setToken] = useState("");
  const [problem, setProblem] = useState("");
  const [resetKey, setResetKey] = useState(0);

  const reset = useCallback(() => {
    setToken("");
    setResetKey((key) => key + 1);
  }, []);

  return {
    token,
    problem,
    reset,
    waiting: captchaEnabled && !token,
    boxProps: { onToken: setToken, onProblem: setProblem, resetKey }
  };
}

const POPUP_WAIT_MS = 30000;

// For a sign-in with no form of its own (the dashboard's Change password, an
// admin adding or linking an account, an admin resending a confirmation
// email). Runs the check in the background; a small "One quick check" pop-up
// opens only if Cloudflare needs a click. Gives back the token ("" when the
// check is off) or throws an Error with a sentence to show.
export function getCaptchaToken() {
  if (!captchaEnabled) return Promise.resolve("");

  return loadTurnstile().then((turnstile) => new Promise((resolve, reject) => {
    const popup = document.createElement("div");
    popup.className = "captcha-popup";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", "One quick check");

    const card = document.createElement("div");
    card.className = "captcha-popup-card";
    const title = document.createElement("p");
    title.className = "captcha-popup-title";
    title.textContent = "One quick check";
    const note = document.createElement("p");
    note.className = "captcha-popup-note";
    note.textContent = "Please confirm you are a real person to continue.";
    const holder = document.createElement("div");
    holder.className = "captcha-popup-holder";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "captcha-popup-cancel";
    cancel.textContent = "Cancel";
    card.append(title, note, holder, cancel);
    popup.append(card);
    document.body.append(popup);

    let widgetId = null;
    let timer = null;
    let finished = false;

    const finish = (outcome) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      try {
        if (widgetId !== null) turnstile.remove(widgetId);
      } catch {
        // Already gone.
      }
      popup.remove();
      outcome();
    };
    const fail = (text) => finish(() => reject(new Error(text)));

    function onKey(event) {
      if (event.key === "Escape") fail("The human check was cancelled.");
    }
    document.addEventListener("keydown", onKey);
    cancel.addEventListener("click", () => fail("The human check was cancelled."));
    timer = setTimeout(() => fail("The human check took too long. Please try again."), POPUP_WAIT_MS);

    try {
      widgetId = turnstile.render(holder, {
        sitekey: SITE_KEY,
        theme: boxTheme(),
        // Stays hidden unless Cloudflare needs a click.
        appearance: "interaction-only",
        callback: (token) => finish(() => resolve(token)),
        "before-interactive-callback": () => {
          clearTimeout(timer);
          popup.classList.add("is-open");
          cancel.focus();
        },
        "error-callback": () => {
          fail(CAPTCHA_CANT_LOAD);
          return true;
        }
      });
    } catch {
      fail(CAPTCHA_CANT_LOAD);
    }
  }));
}
