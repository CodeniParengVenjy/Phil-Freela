# PLAN: Name to show filled from the pasted link (2026-11-24)

The user, looking at the Social Accounts add row (platform, "@username or Facebook link", "Name to show (optional)"):
"by pasting link, I want that automatically getting the name".

Status: approved 2026-11-24 ("ok"). No database change.
- Step 1 AI service: `ai-service/social_name.py` (POST /social/name) + one line in `main.py`;
  `test_social_name.py` 83/83 offline, 11/11 on real public pages from the laptop.
- Step 2 website: `fetchSocialName()` in `client/src/lib/aiService.js`, the add row in
  `client/src/pages/dashboard/components/SocialAccounts.jsx` (Profile page and Settings > Profile Settings).
  Browser test 44/44 (pretend database and AI service; dark, light, phone, Settings).
- Not tried yet: a real person on the live site; and whether Facebook, Instagram and LinkedIn answer the live
  server (Vercel) the way they answer the laptop.

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
- Stops as soon as the title is found, after 2.5 MB (YouTube and Pinterest put it about 1 MB down the page) or after
  8 seconds.
- The name is cleaned to the "Name to show" rule (40 characters, no / \ < > " `, no links) before it is sent back;
  the website checks it again, and the database rule and bad-word trigger still check what is saved.

## What was found while building it

- Facebook sends a server that opens `profile.php?id=123` to its login page, but `facebook.com/123` still leads to
  the profile when the account also has a username, so that address is opened instead. An account with only a
  number may still get no name; then the person types it.
- A missing account gives no name on every platform (Instagram shows just "Instagram", Threads sends to its login
  page, X/YouTube/GitHub answer 404, TikTok's embed address answers 400).

## If the panel asks

- "Does PhilFreela log into Facebook?" No. It reads only what Facebook shows to anyone who isn't logged in, the
  same text a link preview in Messenger shows.
- "Is the name checked?" It is only a suggestion the person can change. What proves who they are is the ID check.
