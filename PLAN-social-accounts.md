# PLAN: Social accounts on a profile (2026-11-20)

The user asked: "I wonder users can put their social media accounts on it such as: LinkedIn, facebook, tiktok,
instagram, youtube, X, etc...".

What was already there: a freelancer (only) could paste up to 3 links under Profile > Portfolio Links (panel
revision item 6). LinkedIn, Facebook, Instagram and YouTube links got their logo, TikTok and X got a plain
chain-link icon, and clients could add nothing. There was no place meant for social accounts.

Status: approved 2026-11-20 ("ok" to the plan written in chat).
- Database: LIVE since 2026-11-20 (migration `social_links` from `database/supabase_social_links_schema.sql`, applied
  after the user's go; rolled-back trial 44/44 PASS first, `database/test_social_links.sql`). Checked after applying:
  column, rule and function there, no profile changed, the links the website builds are accepted by the real rule.
- Website: LIVE (commit ac9e0a8). Browser test 73/73 (computer, light mode, phone; fake database that refuses what
  the real rule refuses), lint clean, production build OK.
- Also in Settings > Profile Settings (added the same day, the user: "this must be settable in settings > Profile
  Settings"): the same box, see "What a person sees". Browser test 103/103 in total (30 new checks for Settings:
  computer, light mode, phone, a failed save, Enter not submitting the form).
- Round 2 (the user, same day: "it display in the profile and include in the highlights, and also, please design it"):
  a designed look (design canvas https://claude.ai/artifact/CsMaMQY4uaAPFGHcf7Jpb5, approved with "ok"), the row on the
  own Profile page too, and the accounts in the Highlights film. No database change. Browser tests: pages 113/113;
  the film's Profile chapter checked in all six looks (Director's Cut and the five Premium ones), on a computer
  (12 checks each) and on a phone (14 each), plus screenshots of every look.
- Round 3 (the user: "yes, and also, if can, include the github", after the "Facebook profile" chip): GitHub as a ninth
  platform and a NAME the person types for any account (a pencil on each chip, and an optional "Name to show" when
  adding). Database change `database/supabase_social_labels_schema.sql` (tried first in a rolled-back run, 47/47 PASS,
  `database/test_social_labels.sql`); applied only after the user's go. Browser test 166/166 for the pages.
- Not tried yet by a real person: adding a real account on the live site and opening it from a public profile.

## What a person sees

1. **Settings > Profile Settings (freelancers and clients):** the box sits after Description and before Save
   Changes, as a small label ("Social Accounts:") like the other settings. "+ Add account" opens one row: pick the
   platform, type your `@username` or paste your link, press Enter (or Add). A platform you already added leaves the
   dropdown; the x on an account removes it. Nine platforms, so at most nine accounts. It saves as soon as you add
   or remove one (like the picture and the "Available for work" switch) and says "Social accounts saved.", so Save
   Changes is not needed for it; a line under the box says so.
2. **Own Profile page:** the same box with a bigger heading, for people who spot it there first (it saves the same
   way, without the "saved" message, like Skills and Portfolio Links on that page).
3. **Public profile:** under the name, "FIND BEA ON" and a row of round logo buttons (for both roles). Each is the
   platform's brand color as a soft tint and fills with the brand color under the mouse (Instagram gets its gradient;
   X, TikTok and Threads are white on the dark theme and black on the light one). Each opens the page in a new tab and
   its tooltip reads "@bea.edits on TikTok". Under them: "These open other websites. PhilFreela doesn't check what's
   on them." Nothing shows until a person adds one.
4. **Own Profile page:** the same row, centered under your name, follows every add and remove.
5. **Chips (Settings and Profile):** a tinted logo circle and the short handle (`@bea.edits`, `bea-ramos`), not the
   whole link; the tooltip has the link. A link with no name inside it (Facebook's `profile.php?id=...` and `/share/...`
   links, a YouTube channel number, an old LinkedIn `/pub/` link) can only say the platform ("Facebook"), because the
   site never visits the page to read a name; the box then explains how to get a name on the chip (add it again by
   typing the username instead of pasting the link), and the tooltip says "Nia's Facebook".
   **A name you type (round 3):** an optional "Name to show" box when you add an account, and a pencil on every chip
   to change it later (an empty name takes it away). The chip, the logo button's tooltip ("Juan Dela Cruz on Facebook")
   and the Highlights pill all use it, before the name inside the link. It is for links with no name inside them (a
   Facebook share link). Up to 40 characters, no links, no blocked words (refused, like a profile name). Removing an
   account removes its name.
6. **Highlights film, Profile chapter (freelancers):** under the website links, on a line of their own, the first 4
   accounts as logo + handle, then "+N more on the profile". The Director's Cut draws glass pills with a brand-tinted
   logo that pop in one by one; the five Premium looks (Papercut, Retro, Cartoony, Kinetic type, Comic book) show the
   same line as plain text in their own font and colors, with the logo in the text color. On a phone (screen 640 px or
   narrower) the chapter is already tall, so it is just the logos, all of them in one row, with the handle in the
   tooltip. The film is a show, not a page, so the accounts there are not clickable.
   Known limit: with a very long bio, 5 skills and 2 website links on a phone, the profile picture can slip up to
   about 40 px under the film's top bar (Retro already did that on such a profile before accounts existed).
7. Portfolio Links now show the TikTok and X logos too (two small additions to the icon list).

## Defaults chosen

- Platforms (same order everywhere): Facebook, Instagram, TikTok, YouTube, LinkedIn, GitHub, X, Threads (Pinterest was removed 2026-11-24 at the user's "remove pinterest"; the database rule still accepts it, the site no longer offers or shows it, and the next save drops a saved one)
  (GitHub after LinkedIn: the two work ones together; it is a black brand, so white on dark and black on light, like X). All have
  a logo in the icon set already on the site. A new one is one line in `SOCIAL_LIST` (profile.js) and one line in the
  SQL function.
- Clients get it too: a client with a real LinkedIn or Facebook page looks more trustworthy to a freelancer.
- A separate box, not more Portfolio Links: that limit of 3 is enforced by the database too, and portfolio links are
  for work, social accounts are for finding the person.
- Typing `@juan` builds the address (TikTok: `https://www.tiktok.com/@juan`). A pasted link is cleaned: `https://`
  added, and the leftovers share buttons add (`?igsh=...`, `?utm_...`, `#top`) cut off. Facebook's
  `profile.php?id=123` keeps its `?id=`.
- Left out on purpose: "verified" ticks (each platform would need its own sign-in), WhatsApp / Telegram / Viber
  (public phone numbers invite spam and deals outside PhilFreela). (Social accounts inside the Highlights film were
  left out in round 1 and added in round 2.)
- The look: brand colors are fixed on purpose (people know a platform by its color), so they don't follow the accent
  color; light mode and the phone (36 px buttons) are covered. The alternative that was shown, "Calm" (neutral buttons,
  accent on hover), was not chosen.

## How it is kept safe

- Stored as one JSON object on the profile, `profiles.social_links`, platform name to address, for example
  `{"tiktok": "https://www.tiktok.com/@juan"}`. An object can hold each platform only once.
- The database rule (`social_links_ok`, the same rule as `SOCIAL_PLATFORMS` in profile.js): only the nine platform
  names; each address is https, at most 200 characters, on THAT platform's own website (its domain or a sub-domain
  such as www. or m.), then a page name and nothing after it. So a "TikTok" entry can't point to another website,
  can't be a `javascript:` link, and a redirect link such as `facebook.com/l.php?u=...` is refused.
- Look-alikes are refused (tested): `evilfacebook.com`, `facebook.com.evil.com`, `facebook.com@evil.com`,
  `evil.com/facebook.com/...`, `notx.com` for X.
- Buttons are drawn only for links that fit their platform, whatever is stored (second line of defence), and open
  with `rel="noopener noreferrer nofollow"`.
- Only you can change your own accounts (the existing "update own profile" row rule); any signed-in person can read them.
- The website reads the column in its own small request, so if the SQL isn't applied the public profile page still
  loads; only the new box says "Couldn't load your accounts".
- The typed names live in their own column, `profiles.social_labels` (`{"facebook": "Juan Dela Cruz"}`), next to the
  links, so the links already saved keep working and the page can read them even where the names column is missing.
  Rule (`social_labels_ok`): only the nine platform names; 1 to 40 characters, no space at either end, none of
  `/ \ < > " `` ` and no control characters, no `://` or `www.` (so a name can't be a link). The trigger
  `profiles_social_label_words` refuses a blocked word with "Please don't use bad words in a name." (same
  `has_bad_word` as the other text). Names are always drawn as plain text.

## Files

- `database/supabase_social_links_schema.sql` (function + column), `database/test_social_links.sql`.
- `database/supabase_social_labels_schema.sql` (GitHub in the links rule, the names column, its rule and the blocked-word
  trigger), `database/test_social_labels.sql`.
- `client/src/lib/profile.js`: `SOCIAL_PLATFORMS`, `cleanSocialAccount`, `isSafeSocialLink`, `fetchSocialLinks`,
  `saveSocialLinks`, the TikTok / X icons.
- `client/src/pages/dashboard/components/SocialAccounts.jsx`: `SocialAccountsBox` (edit) and `SocialAccountsRow` (the
  logo buttons); `social-accounts.css`: the look (brand colors, hover, light theme, phone).
- `client/src/lib/profile.js` also has `socialHandle` (the short handle).
- Highlights: `lib/highlights.js` (`socials` in the film's data), `components/highlights/socialGlyphs.js` (the logo
  outlines, from the icon set), `highlightsEngine.js` (draws them in `.plinks`), `highlights.css` (Director's Cut pills).
- `client/src/pages/dashboard/views/SettingsView.jsx`, `ProfileView.jsx` and `PublicProfileView.jsx`: one block each
  (Settings uses `<SocialAccountsBox inSettings />`).

## If the panel asks

- "Why only these platforms?" These are the ones freelancers and clients in the Philippines actually use for work;
  adding one is a one-line change. Any other website still goes in Portfolio Links.
- "Can someone put a fake account?" They can put someone else's page address, as on any site; PhilFreela only
  guarantees the link goes to that platform, not who owns the account. That is why the note says PhilFreela doesn't
  check them, and why there is a Report button on every profile.
- "Why no tick for verified accounts?" Proving ownership of a social account needs each platform's own sign-in
  (OAuth) and an app approved by each of them. The one ownership check we can do ourselves is the website meta tag
  (see PLAN-site-verification.md).
- "Why not allow any link?" Portfolio Links already does, for work. A box with a platform name on it should be what
  it says, so a TikTok button never opens another website.
