# Plan: an "are you a robot?" check (CAPTCHA) on sign-up and sign-in

Status (2026-10-29): approved by the user ("your managed, ok create it"). The user asked for it on
BOTH sign-up and sign-in.

- Step 2 (code): built. lib/captcha.js (loads Cloudflare's script on demand like lib/googleSignIn.js,
  useCaptcha() for forms, getCaptchaToken() for the no-form cases), components/CaptchaBox.jsx,
  styles/captcha.css, VITE_TURNSTILE_SITE_KEY in .env.example, a friendly "human check didn't pass"
  line in lib/errors.js. The box + token are on: Login (sign in, create account, Resend),
  ForgotPassword, AdminLogin (sign in + Resend), AdminForgotPassword, AdminSetup. The pop-up
  ("One quick check", opens only if Cloudflare asks for a click) is used by changePassword
  (accountSecurity.js, so both the user's and the admin's Change password), linking/remembering the
  other account (accountSwitch.js signInOther), the admin Pending Users Resend
  (resendConfirmation.js, which also covers any other caller) and the Add Admin form
  (AdminAdminsView.jsx). One change from the plan: Change password and linking use the pop-up
  instead of a box in their forms, because the same function is called from two pages each.
  Pressing Enter while the box is still checking does nothing (the browser does not submit through a
  disabled button); the button says "Checking you're human..." meanwhile.
- Step 3 (tests): done in a real browser, Cloudflare's script replaced by a fake that can pass, fail,
  ask for a click or expire, Supabase a pretend backend, plus Cloudflare's REAL script with its
  always-pass test key (laptop and phone width): 71 checks, 0 failed. Lint shows only the two old
  warnings in useDashboardShell.js, build clean. NOT tried: the Add Admin form itself (it needs a
  signed-in super admin; the code is the same getCaptchaToken() call as the others) and Supabase's own
  refusal (Step 5).
- Step 4: pushed with no site key set, so nothing shows yet and nothing can break.
- Waiting for: Step 1 (the user makes the Turnstile widget and adds VITE_TURNSTILE_SITE_KEY to
  Cloudflare Pages + client/.env), then Step 5 (the user flips the Supabase switch), then Step 6
  (words).

## What it is and which one

Cloudflare Turnstile (free). The website already lives on Cloudflare, it does not track people for
ads, and Supabase has it built in (Authentication > Attack Protection > Enable CAPTCHA protection).

How it works: the page shows a small box. Cloudflare checks the browser and hands the page a one-time
TOKEN. The page sends the token with the sign-up / sign-in request. Supabase gives the token back to
Cloudflare with our SECRET key; if Cloudflare says "not a real person", Supabase refuses the request.
So a bot cannot skip it by calling Supabase directly, because the refusal happens on Supabase's side.

Widget mode (chosen when the widget is made in the Cloudflare dashboard):

| Mode | What the person sees |
|---|---|
| Managed (recommended) | A small box. Most people: it ticks itself in about a second, no click. Only a suspicious browser gets a "Verify you are human" checkbox. |
| Non-interactive | A small box that shows a spinner, then "Success". Never asks for a click. |
| Invisible | Nothing on the page at all. |

Old-style reCAPTCHA ("I'm not a robot" checkbox every time, then picture puzzles) is not used: more
annoying, and it sends visitors' data to Google (would need a line in the Privacy Policy).

## The catch that shapes the plan

Turning CAPTCHA on in Supabase is ONE switch for the whole project. After it, EVERY password sign-in,
sign-up, password-reset and resend-confirmation request is refused unless it carries a token, not only
the Sign In page. So every place in the website that calls those must send one, or it breaks the day
the switch is flipped. The places (found by searching the code):

Forms the person sees (a visible box above the button):
- Login.jsx: Create account (signUp), Sign in (signInWithPassword), and the "Resend" confirmation link
  (also lib/resendConfirmation.js, used on other pages too)
- ForgotPassword.jsx (resetPasswordForEmail)
- Admin: AdminLogin.jsx, AdminForgotPassword.jsx, AdminSetup.jsx (first admin), and the Add Admin form
  in AdminAdminsView.jsx (signUp on the second in-memory connection)

Background sign-ins with no form of their own (the password is typed in a different box):
- lib/accountSecurity.js changePassword: signs in again with the current password to prove it is them
- lib/accountSwitch.js signInOther: linking the admin's own user account (second connection)
  These two get their token from a small pop-up check ("One quick check") that opens only when needed.

Google sign-in (signInWithIdToken) is already protected by Google. Whether Supabase also demands a
token there is something I will TEST, not guess; if it does, the same token is passed.

The same widget cannot be reused after one try: a token works once and expires in 5 minutes. So the
box is reset after every attempt, good or bad.

## Steps

Step 1 - You (about 5 minutes, free, I cannot do this part):
  a. Cloudflare dashboard > Turnstile > Add widget. Name: PhilFreela. Hostnames: the live site's
     address and `localhost`. Mode: Managed.
  b. Copy the SITE KEY (public) and the SECRET KEY (private).
  c. Cloudflare Pages > the website project > Settings > Environment variables: add
     `VITE_TURNSTILE_SITE_KEY` = the site key (the website reads it when it is built).
  d. Put the same line in client/.env on this laptop.
  The secret key goes ONLY into Supabase (Step 5). It never goes into the code or this repo.

Step 2 - Code, no database change (me):
- `client/src/lib/captcha.js`: loads Cloudflare's script on demand (the same way lib/googleSignIn.js
  loads Google's, so no new npm package), plus `useCaptcha()` for forms and `getCaptchaToken()` for
  the background ones. Reads `VITE_TURNSTILE_SITE_KEY`; with no key set it does nothing, so the site
  behaves exactly as today (also keeps old tests and the laptop working).
- `client/src/components/CaptchaBox.jsx`: the box, themed for dark and light mode.
- `.env.example` gets the new line with a comment.
- The Sign In / Create account / Resend / Forgot password / admin forms show the box above their
  button. The button says "Checking you're human..." and stays off until the token arrives. If
  Cloudflare cannot load (ad blocker, offline) the form says so in plain words and tells them to
  turn off the blocker or refresh; it does not pretend to work.
- Each call passes `options: { captchaToken }`. The box resets after every attempt.
- Changing the password and linking an account open the small pop-up check first.
- _headers needs no change (it has no script/frame limits, only `frame-ancestors`).

Step 3 - Tests (me), before anything is switched on:
- Real browser, Cloudflare's own test keys (a key that always passes, one that always blocks, one that
  always asks for a click) and a pretend backend: the token reaches the request body on every one of
  the places above; the button is off until the token arrives; the box resets after a wrong password;
  no site key = no box and no change; blocked script = clear message; always-block key = cannot
  submit; laptop and phone; light and dark mode.
- Lint and build.
- I cannot test Supabase's own refusal from here without switching it on for real users, so that part
  is Step 5.

Step 4 - Push (commit only the CAPTCHA files, explicit paths; Login.jsx also holds another session's
  one-line sign-up message change, so I will not commit that line by accident). Live site now shows
  the box but Supabase still ignores the token, so nothing can break yet.

Step 5 - You flip the switch, I help check:
  Supabase dashboard > Authentication > Attack Protection > Enable CAPTCHA protection > Turnstile >
  paste the SECRET KEY > Save. Then, live: create an account, sign in (right and wrong password),
  forgot password, admin sign in, change password, Google sign-in. Any of them failing = switch it
  off again (instant undo, nothing is lost), and I fix the one that failed.

Step 6 - Words: a line in the Privacy Policy (Cloudflare Turnstile checks the browser when signing
  in or up, and may see its IP address and browser details), a line in PhilFreela-System-Functions.md
  under security, and the Tools list for the paper (Cloudflare Turnstile).

## Left out on purpose
- Other forms (report, post a project, chat): they need a signed-in account already.
- Our own rate limits (a separate item in the security notes, still open).
- A hard "fail closed" server check beyond Supabase's own: Supabase's check is the real protection.
