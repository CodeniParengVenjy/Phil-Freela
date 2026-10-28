import { useEffect, useRef } from "react";
import { CAPTCHA_CANT_LOAD, CAPTCHA_SITE_KEY, captchaEnabled, loadTurnstile } from "../lib/captcha";

// The "are you a robot?" box on a sign-in or sign-up form. Pass it the result
// of useCaptcha() (lib/captcha.js). Draws nothing when the check is off.
export default function CaptchaBox({ captcha }) {
  const { onToken, onProblem, resetKey } = captcha.boxProps;
  const holder = useRef(null);
  const widget = useRef(null);

  useEffect(() => {
    if (!captchaEnabled) return undefined;
    let active = true;

    loadTurnstile()
      .then((turnstile) => {
        if (!active || !holder.current) return;
        widget.current = turnstile.render(holder.current, {
          sitekey: CAPTCHA_SITE_KEY,
          theme: "dark",
          size: "flexible",
          callback: (token) => {
            onProblem("");
            onToken(token);
          },
          // A token runs out after 5 minutes; Cloudflare makes a new one.
          "expired-callback": () => onToken(""),
          "error-callback": () => {
            onToken("");
            onProblem(CAPTCHA_CANT_LOAD);
            return true;
          }
        });
      })
      .catch((error) => {
        if (active) onProblem(error.message);
      });

    return () => {
      active = false;
      try {
        if (widget.current !== null) window.turnstile?.remove(widget.current);
      } catch {
        // Already gone.
      }
      widget.current = null;
    };
  }, [onToken, onProblem]);

  // After an attempt the form asks for a fresh check.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    try {
      if (widget.current !== null) window.turnstile?.reset(widget.current);
    } catch {
      // The box was not drawn yet.
    }
  }, [resetKey]);

  if (!captchaEnabled) return null;

  return (
    <div className="captcha-box">
      <div ref={holder} className="captcha-holder"></div>
      {captcha.problem && <p className="auth-message error fs-8 fw-semibold text-center mb-0 mt-2" role="alert">{captcha.problem}</p>}
    </div>
  );
}
