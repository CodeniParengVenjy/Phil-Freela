# PLAN: Name to show filled from the pasted link (2026-11-24)

The user, looking at the Social Accounts add row (platform, "@username or Facebook link", "Name to show (optional)"):
"by pasting link, I want that automatically getting the name".

Status: approved 2026-11-24 ("ok"). No database change.
- Step 1 AI service: `ai-service/social_name.py` (POST /social/name) + one line in `main.py`;
  `test_social_name.py` 92/92 offline (with the number-only Facebook fix below), real public pages from the laptop.
- Step 2 website: `fetchSocialName()` in `client/src/lib/aiService.js`, the add row in
  `client/src/pages/dashboard/components/SocialAccounts.jsx` (Profile page and Settings > Profile Settings).
  Browser test 44/44 (pretend database and AI service; dark, light, phone, Settings).
- First real try (the user, 2026-11-24): a number-only Facebook link (`web.facebook.com/profile.php?id=615...`)
  gave "Couldn't get the name". Fixed the same day: the name is read from Facebook's /people/ address (below).
- Live self-check (`GET /ai/social/selftest`): from the live server Facebook (username links and id links of
  accounts with a username), YouTube, LinkedIn, GitHub, X, Threads and TikTok give names; Instagram shows the
  server its login page. The user's number-only Facebook link still gave no name live.

## Changed after the first tries (2026-11-24, the user)

- "if website cant appear the name, just link only instead.... remove the Name to Show... as well other
  platforms": there is no "Name to show" box and no pencil any more, for every platform. The add row is platform +
  link + Add. The name found on the page is saved with the link and shown ("It will show as Juan Dela Cruz");
  when none is found, the account just shows its link (or the @name inside the link), with no "couldn't" message.
  Names typed before stay. Add waits up to 12 s for a name that is still coming, then adds the link only.
- "just the setting the social platforms in the setting it self in the profile section": the box is only in
  Settings > Profile Settings. The Profile page still shows the accounts as logos under the name.
- A name typed where the link goes ("VG Cuevas") gets a friendly line saying to paste the link or type the
  @username, instead of "can't have spaces".
- The chip of an account with no name anywhere (Facebook profile.php?id=...) showed the long raw link; the user:
  "what is this??", then chose "Just Facebook". It now says the platform's name (`socialHandle`, the same as the
  Highlights film); the link shows on hover and a click still opens it.

## Wrong links and missing accounts (2026-11-24, the user: "okay build it, also build the not correct link like that")

The user asked whether the box can tell a right link from a wrong one. Two checks were added; "block Add" was the
user's choice for a missing account.

1. Wrong links, on the website, instantly (`cleanSocialAccount` -> `accountLink` / `ACCOUNT_PARTS` in profile.js):
   - The account is inside the link: only that part is kept, and a line says so ("Only the account part of that
     link will be added: tiktok.com/@juan"). tiktok.com/@juan/video/123, x.com/juan/status/123, youtube.com/@juan/videos,
     github.com/juan/my-project, instagram.com/juan/reels, linkedin.com/in/juan/details/skills, threads.com/@juan/post/...
   - No account in it: refused at once ("That's a link to an Instagram post, not an account. Open your Instagram profile
     and copy its link, or type your username."): posts, reels, videos, Shorts, playlists, groups, events, hashtags,
     searches and each platform's own pages (login, settings, explore...). A link that can't be an account link at all
     (tiktok.com/juan without @, linkedin.com/juan) says what one looks like.
   - Kept as they are: share links from the phone apps (facebook.com/share/1AbC, vt.tiktok.com/...), which often open
     a profile. (facebook.com/share/p, /v, /r, /g are a post, video, reel, group: refused.)
   - The AI service isn't asked about a refused link. Typing a username never shows these warnings.
2. Account not found, from the AI service: `check_account()` in social_name.py; POST /social/name now answers
   `{"name": ..., "missing": true/false}`. missing = the platform's own site answered 404/410, and only for YouTube,
   GitHub and X (`SAYS_NOT_FOUND`). Made-up accounts from the laptop: those three answer 404; Facebook, Threads and
   Instagram show a login page or a plain title; LinkedIn answers 999; TikTok's embed address answers 400
   "Something went wrong" (could be a private account too, so not trusted). The line "We couldn't find this account on
   GitHub. Check the link or the username." shows, and Add saves nothing until the link changes. A 429, a login page, a
   slow or sleeping service never count as missing, so the link is then added as before.
   /social/selftest also tries made-up YouTube, GitHub and X accounts (pfnosuchacct01), to show what the live server gets.
- Accounts saved before are not checked again. No database change.
- Tests: AI service 123/123 offline (+ live from the laptop: the 3 made-up accounts missing, real ones not);
  rules 97/97 (`name-test/rules.mjs` in session 82ef6bd6's scratchpad); browser bench 59/59.

## The idea, in plain words

A browser can't read a Facebook or Instagram page itself (those sites block it), so the AI service does it, the
same way a chat app makes a link preview. Every profile page has a title for link previews:

    Facebook   <meta property="og:title" content="Juan Dela Cruz">
    Instagram  "NASA (@nasa) • Instagram photos and videos"
    GitHub     <title>torvalds (Linus Torvalds) · GitHub</title>

The service cuts the name out of it and the website puts it in "Name to show". TikTok's page has no title for
servers, so its public embed address (`tiktok.com/oembed`) is asked instead.

## What the person sees

1. They pick a platform and paste their link. Right away the Name box says "Getting the name…" and a small line
   under the row says "Getting the name from the Facebook page".
2. The name appears in the box, with "Name filled from the Facebook page. Change it if it's wrong."
3. They press Add (or change the name first). If they press Add while the name is still coming, it waits for it.

A typed @username works too, 0.8 seconds after the last key (so it isn't asked for every letter).

## Defaults chosen

- It never replaces a name typed by hand. A name the page gave is replaced when they paste a different link.
- No name on the page (a login page, a missing account, the service offline or slower than 12 seconds): the box
  stays empty. A quiet line ("Couldn't get the name... You can type it") shows only for links with no name inside
  them (Facebook profile.php?id=), because the chip of any other link already shows the @name from the link.
- Accounts already saved don't change; the pencil still renames them.
- Nothing new is saved: the name goes back only to the person who asked, and only into the box.

## Safety (the service opens an address someone typed)

- Signed-in users only, at most 20 tries a minute each.
- Only links on that platform's own website, the same rule as the saved link (https, the platform's domains).
- At most 3 redirects, and only within that platform's sites (facebook.com sends servers to web.facebook.com).
- No address inside a private network (`is_public_host` from `site_check.py`).
- Stops as soon as the title is found, after 2.5 MB (YouTube puts it about 0.9 MB down the page) or after
  8 seconds.
- The name is cleaned to the "Name to show" rule (40 characters, no / \ < > " `, no links) before it is sent back;
  the website checks it again, and the database rule and bad-word trigger still check what is saved.

## What was found while building it

- Facebook sends a server that opens `profile.php?id=123` to its login page, but `facebook.com/123` still leads to
  the profile when the account also has a username, so that address is opened instead.
- An account with only a number (no username): `facebook.com/123` forwards to
  `web.facebook.com/people/Juan-Dela-Cruz/pfbid...` and only then to the login page. The name is read from that
  /people/ address (dashes become spaces, %C3%A9 becomes é), only when that address passed the safety checks, and
  only when the page itself shows no name (its own title keeps real capitals and dashes, like "Mary-Anne").
- A missing account gives no name on every platform (Instagram shows just "Instagram", Threads sends to its login
  page, X/YouTube/GitHub answer 404, TikTok's embed address answers 400).

## If the panel asks

- "Does PhilFreela log into Facebook?" No. It reads only what Facebook shows to anyone who isn't logged in, the
  same text a link preview in Messenger shows.
- "Is the name checked?" It is only a suggestion the person can change. What proves who they are is the ID check.
