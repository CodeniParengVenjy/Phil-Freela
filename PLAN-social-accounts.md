# PLAN: Social accounts on a profile (2026-11-20)

The user asked: "I wonder users can put their social media accounts on it such as: LinkedIn, facebook, tiktok,
instagram, youtube, X, etc...".

What was already there: a freelancer (only) could paste up to 3 links under Profile > Portfolio Links (panel
revision item 6). LinkedIn, Facebook, Instagram and YouTube links got their logo, TikTok and X got a plain
chain-link icon, and clients could add nothing. There was no place meant for social accounts.

Status: approved 2026-11-20 ("ok" to the plan written in chat).
- Database: `database/supabase_social_links_schema.sql`, rolled-back trial on the live database 44/44 PASS
  (`database/test_social_links.sql`). Applying it waits for the user's go.
- Website: built. Browser test 73/73 (computer, light mode, phone; fake database that refuses what the real rule
  refuses), lint clean, production build OK.
- Not tried yet by a real person: adding a real account on the live site and opening it from a public profile.

## What a person sees

1. **Own Profile (freelancers and clients):** a new box, Social Accounts. "+ Add account" opens one row: pick the
   platform, type your `@username` or paste your link, press Enter (or Add). A platform you already added leaves the
   dropdown; the x on an account removes it. Eight platforms, so at most eight accounts.
2. **Public profile:** a row of round logo buttons under the name (for both roles). Each opens the page in a new tab.
   Under them: "These open other websites. PhilFreela doesn't check what's on them." Nothing shows until a person
   adds one.
3. Portfolio Links now show the TikTok and X logos too (two small additions to the icon list).

## Defaults chosen

- Platforms (same order everywhere): Facebook, Instagram, TikTok, YouTube, LinkedIn, X, Threads, Pinterest. All have
  a logo in the icon set already on the site. A new one is one line in `SOCIAL_LIST` (profile.js) and one line in the
  SQL function.
- Clients get it too: a client with a real LinkedIn or Facebook page looks more trustworthy to a freelancer.
- A separate box, not more Portfolio Links: that limit of 3 is enforced by the database too, and portfolio links are
  for work, social accounts are for finding the person.
- Typing `@juan` builds the address (TikTok: `https://www.tiktok.com/@juan`). A pasted link is cleaned: `https://`
  added, and the leftovers share buttons add (`?igsh=...`, `?utm_...`, `#top`) cut off. Facebook's
  `profile.php?id=123` keeps its `?id=`.
- Left out on purpose: "verified" ticks (each platform would need its own sign-in), WhatsApp / Telegram / Viber
  (public phone numbers invite spam and deals outside PhilFreela), and social accounts inside the Highlights film.

## How it is kept safe

- Stored as one JSON object on the profile, `profiles.social_links`, platform name to address, for example
  `{"tiktok": "https://www.tiktok.com/@juan"}`. An object can hold each platform only once.
- The database rule (`social_links_ok`, the same rule as `SOCIAL_PLATFORMS` in profile.js): only the eight platform
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

## Files

- `database/supabase_social_links_schema.sql` (function + column), `database/test_social_links.sql`.
- `client/src/lib/profile.js`: `SOCIAL_PLATFORMS`, `cleanSocialAccount`, `isSafeSocialLink`, `fetchSocialLinks`,
  `saveSocialLinks`, the TikTok / X icons.
- `client/src/pages/dashboard/components/SocialAccounts.jsx`: `SocialAccountsBox` (edit) and `SocialAccountsRow` (public).
- `client/src/pages/dashboard/views/ProfileView.jsx` and `PublicProfileView.jsx`: one block each.

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
