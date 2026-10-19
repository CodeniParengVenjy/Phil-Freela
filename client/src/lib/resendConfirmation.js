import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { getFriendlyErrorMessage } from "./errors";

// Supabase sends at most one confirmation email per address per minute.
export const RESEND_WAIT_SECONDS = 60;

// Sends the confirmation email again. Every new email cancels the links in the
// older ones, so only the newest email works. The link in it opens `path` on
// this site (the Sign In page, which then makes the person's profile).
//
// Returns one of:
//   { sent: true }        the email went out.
//   { waitSeconds: 53 }   Supabase says one went out less than a minute ago
//                         ("... you can only request this after 53 seconds.").
//   { error: "..." }      a sentence to show for anything else, including the
//                         hourly email limit (worded in lib/errors.js).
export async function resendConfirmation(email, path = "/login") {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${window.location.origin}${path}` }
  });
  if (!error) return { sent: true };

  const tooSoon = /after (\d+) seconds?/i.exec(error.message || "");
  if (tooSoon) return { waitSeconds: Number(tooSoon[1]) };
  return { error: getFriendlyErrorMessage(error) };
}

// Remembers, for each person (by id), when their Resend button works again, and
// redraws once a second while anyone is still waiting.
export function useResendWait() {
  // id -> the time (in milliseconds) when the button works again.
  const [readyAt, setReadyAt] = useState({});
  const [now, setNow] = useState(() => Date.now());

  // The clock only ticks while someone is still waiting.
  const someoneWaiting = Object.values(readyAt).some((time) => time > now);
  useEffect(() => {
    if (!someoneWaiting) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [someoneWaiting]);

  // Starts one person's wait, `seconds` from now.
  const startWait = useCallback((id, seconds = RESEND_WAIT_SECONDS) => {
    // One reading of the clock for both, so the button starts at exactly
    // `seconds` and not one more.
    const time = Date.now();
    setNow(time);
    setReadyAt((prev) => ({ ...prev, [id]: time + seconds * 1000 }));
  }, []);

  // Starts the waits of a whole list from when each person's last email went
  // out, so a refreshed page doesn't forget a wait that is still on. `people`
  // is a list of { id, sentAt } (sentAt can be empty: no email sent yet).
  const startWaitsFrom = useCallback((people) => {
    setNow(Date.now());
    setReadyAt(Object.fromEntries(
      people
        .filter((person) => person.sentAt)
        .map((person) => [person.id, new Date(person.sentAt).getTime() + RESEND_WAIT_SECONDS * 1000])
    ));
  }, []);

  // Seconds left for this person (0 = the button works now).
  const secondsLeft = (id) => Math.max(0, Math.ceil(((readyAt[id] || 0) - now) / 1000));

  return { secondsLeft, startWait, startWaitsFrom };
}
