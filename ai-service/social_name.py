"""Name to show for a social account (PLAN-social-name.md).

When someone pastes their Facebook, Instagram, TikTok, YouTube, LinkedIn,
GitHub, X or Threads link in the Social Accounts box, the website
asks POST /social/name for the name on that page and fills "Name to show" with
it (the person can still change it). A browser can't read another website's
page itself (those sites block that), so this service does it, the same way a
chat app makes a link preview.

How the name is found: every profile page has a title for link previews, e.g.
    Facebook   <meta property="og:title" content="Juan Dela Cruz">
    Instagram  "NASA (@nasa) • Instagram photos and videos"
    GitHub     <title>torvalds (Linus Torvalds) · GitHub</title>
name_from_title() cuts the name out of it for each platform. TikTok's page has
no title for servers, so its public embed address (tiktok.com/oembed) is asked
instead; it answers with "author_name". Facebook sends a server that opens
profile.php?id=123 to its login page, so facebook.com/123 is opened instead
(page_to_read).

When there is no name: a login page ("Log in to Facebook"), a missing account,
an error, or a site that doesn't answer all give "". The website then leaves
the box empty and the person types the name, like before. Nothing is saved
here: the name only goes back to the person who asked.

Visiting an address someone typed must be done carefully, so read_title():
- only opens links on that platform's own website (the same list as
  SOCIAL_LIST in client/src/lib/profile.js), https only, normal port;
- follows at most 3 redirects, and only within that platform's sites
  (facebook.com sends servers to web.facebook.com);
- refuses any address inside a private network (is_public_host from
  site_check.py);
- stops reading as soon as the title is found, after 2.5 MB at most (YouTube
  puts it about 0.9 MB down the page) or after 8 seconds;
- needs a signed-in user, at most 20 tries a minute each.
"""

import html
import json
import logging
import re
import socket
import time
from collections import defaultdict, deque
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from site_check import is_public_host

TIMEOUT_SECONDS = 5             # longest wait for the site to answer each time
TOTAL_SECONDS = 8               # longest time for reading the whole page
MAX_PAGE_BYTES = 2_500_000      # stop after this much, title found or not
MAX_REDIRECTS = 3
MAX_LINK_LENGTH = 200           # the same limit as a saved link
MAX_NAME_LENGTH = 40            # the same limit as "Name to show"
MAX_PER_MINUTE = 20             # tries per signed-in user
USER_AGENT = "Mozilla/5.0 (compatible; PhilFreela-PageName/1.0; +https://phil-freela.pages.dev)"
TIKTOK_OEMBED = "https://www.tiktok.com/oembed"

# Each platform's own websites. The website (SOCIAL_LIST in profile.js) and
# the database rule (social_links_ok) have the same list.
PLATFORMS = {
    "facebook": ("facebook.com", "fb.com", "fb.me"),
    "instagram": ("instagram.com",),
    "tiktok": ("tiktok.com",),
    "youtube": ("youtube.com",),
    "linkedin": ("linkedin.com",),
    "github": ("github.com",),
    "x": ("x.com", "twitter.com"),
    "threads": ("threads.net", "threads.com"),
    # (Pinterest was removed from the site on 2026-11-24)
}

# The shape of a saved link, the same pattern as the website and the database:
# https://, the platform's site (or www. / m. / web.), then the page name and
# nothing after it (Facebook's profile.php?id=123 is the one exception).
LINK_RULES = {
    key: re.compile(
        r'^https://([a-z0-9-]+\.)*(' + "|".join(re.escape(site) for site in sites) + r')/[^\s<>"?#/][^\s<>"?#]*(\?id=\d+)?$',
        re.IGNORECASE,
    )
    for key, sites in PLATFORMS.items()
}

# A title that is really a login page, an error page or the platform itself,
# so it holds no person's name.
NOT_A_NAME = re.compile(
    r"\b(log ?in(to)?|sign ?in|sign ?up|not found|error|unavailable|isn.t available|suspended|restricted|create an account)\b",
    re.IGNORECASE,
)
PLATFORM_WORDS = {"facebook", "instagram", "tiktok", "youtube", "linkedin", "github", "x", "twitter", "threads", "pinterest", "meta"}

# The two places a page writes its title (the page is read as bytes).
OG_TITLE = re.compile(rb"<meta\b[^>]*\bog:title\b[^>]*>", re.IGNORECASE)
CONTENT = re.compile(rb"""\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.IGNORECASE)
TITLE = re.compile(rb"<title\b[^>]*>([^<]{1,300})</title>", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Which links may be visited
# ---------------------------------------------------------------------------

def link_ok(platform, link):
    """True for a link the website could have saved for this platform."""
    rule = LINK_RULES.get(platform)
    return bool(rule) and isinstance(link, str) and len(link) <= MAX_LINK_LENGTH and bool(rule.match(link))


def on_platform(platform, host):
    """True when host is one of the platform's own sites, or a sub-domain of one
    (web.facebook.com, m.youtube.com). evilfacebook.com is not."""
    return any(host == site or host.endswith("." + site) for site in PLATFORMS.get(platform, ()))


# ---------------------------------------------------------------------------
# Cutting the name out of a title
# ---------------------------------------------------------------------------

def tidy(text):
    """Turns &#064; into @ and every kind of space into one plain space."""
    text = html.unescape(text or "").replace(chr(160), " ")
    return re.sub(r"\s+", " ", text).strip()


def name_from_title(platform, title):
    """The person's name inside a page title, or "" when the title has none."""
    text = tidy(title)
    if platform in ("instagram", "threads", "x", "tiktok"):
        # "NASA (@nasa) • Instagram photos and videos", "NASA (@NASA) / X":
        # the name is what comes before "(@username)". No "(@" = not a profile.
        match = re.match(r"^(.*?)\s*\(@[^)]*\)", text)
        text = match.group(1) if match else ""
    elif platform == "github":
        # "torvalds (Linus Torvalds) · GitHub" for a person, "Microsoft · GitHub"
        # for an organization (or a person who gave no name).
        match = re.match(r"^\S+\s+\((.+)\)\s*·\s*GitHub$", text) or re.match(r"^(.+?)\s*·\s*GitHub$", text)
        text = match.group(1) if match else ""
    elif platform == "linkedin":
        # "Bill Gates - Chair, Gates Foundation | LinkedIn": the name, then the
        # job title after " - ".
        text = re.sub(r"\s*\|\s*LinkedIn$", "", text).split(" - ")[0]
    elif platform == "youtube":
        text = re.sub(r"\s*-\s*YouTube$", "", text)
    elif platform == "facebook":
        text = re.sub(r"\s*[|-]\s*Facebook$", "", text)
    text = text.strip()
    if not text or text.lower() in PLATFORM_WORDS or NOT_A_NAME.search(text):
        return ""
    return text


def clean_name(text):
    """Makes a found name fit the "Name to show" rule (social_labels_ok): no
    / \\ < > " ` or control characters, no link, at most 40 characters as the
    website counts them (JavaScript counts an emoji as 2). Returns "" when
    nothing is left."""
    text = re.sub(r"\s+", " ", text or "")  # tabs and line breaks become spaces first
    if "://" in text or "www." in text.lower():
        return ""
    text = re.sub(r'[/\\<>"`]', "", text)
    text = "".join(ch for ch in text if ord(ch) >= 32 and ord(ch) != 127)
    text = re.sub(r"\s+", " ", text).strip()
    cut = False
    while len(text.encode("utf-16-le")) // 2 > MAX_NAME_LENGTH:
        text = text[:-1]
        cut = True
    if cut and " " in text:
        text = text.rsplit(" ", 1)[0]  # don't end in the middle of a word
    return text.strip()


# ---------------------------------------------------------------------------
# Reading the page
# ---------------------------------------------------------------------------

def find_title(platform, data):
    """The page title inside these bytes, or None when it isn't there yet.
    GitHub only writes the person's name in <title>; the others use whichever
    of og:title and <title> comes first (both hold the same name)."""
    title = TITLE.search(data)
    og = None if platform == "github" else OG_TITLE.search(data)
    if og and (not title or og.start() < title.start()):
        content = CONTENT.search(og.group(0))
        if content:
            return (content.group(1) or content.group(2) or b"").decode("utf-8", errors="replace")
    if title:
        return title.group(1).decode("utf-8", errors="replace")
    return None


def read_title(platform, link, client, resolve=socket.getaddrinfo):
    """Opens the page at link, safely (see the top of this file), and returns
    its title, or "" when there is none."""
    url = link
    deadline = time.monotonic() + TOTAL_SECONDS
    for _ in range(MAX_REDIRECTS + 1):
        parts = urlsplit(url)
        host = (parts.hostname or "").lower()
        if parts.scheme != "https" or parts.port not in (None, 443) or not on_platform(platform, host):
            return ""  # a redirect to another website, or to a page that isn't https
        if not is_public_host(host, resolve):
            return ""
        with client.stream("GET", url) as response:
            if response.status_code in (301, 302, 303, 307, 308) and response.headers.get("location"):
                url = urljoin(url, response.headers["location"])
                continue
            if response.status_code >= 400:
                return ""  # a missing account, or a site that refuses servers
            body = bytearray()
            for chunk in response.iter_bytes():
                start = max(0, len(body) - 1024)  # a title split between two chunks is still found
                body.extend(chunk)
                title = find_title(platform, bytes(body[start:]))
                if title is not None:
                    return title
                if len(body) >= MAX_PAGE_BYTES or time.monotonic() > deadline:
                    break
            return ""
    return ""


def page_to_read(platform, link):
    """The address to open for a link. Facebook sends a server that opens
    profile.php?id=123 to its login page, but facebook.com/123 still leads to
    the profile when the account also has a username (tried 2026-11-24)."""
    if platform == "facebook":
        match = re.match(r"^https://[^/]+/profile\.php\?id=(\d+)$", link, re.IGNORECASE)
        if match:
            return f"https://www.facebook.com/{match.group(1)}"
    return link


def tiktok_name(link, client):
    """TikTok's own embed address answers with the account's name as JSON."""
    response = client.get(TIKTOK_OEMBED, params={"url": link})
    if response.status_code != 200:
        return ""
    data = response.json()
    name = data.get("author_name") if isinstance(data, dict) else ""
    return name if isinstance(name, str) else ""


def find_name(platform, link, client=None, resolve=socket.getaddrinfo):
    """The name to show for a saved-style link, or "" when none can be found.
    Never raises: a site that doesn't answer just means no name."""
    own_client = client is None
    if own_client:
        client = httpx.Client(
            timeout=TIMEOUT_SECONDS, follow_redirects=False,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.8"},
        )
    try:
        if platform == "tiktok":
            name = tiktok_name(link, client)
            name = "" if not name or name.lower() in PLATFORM_WORDS else tidy(name)
        else:
            name = name_from_title(platform, read_title(platform, page_to_read(platform, link), client, resolve))
        return clean_name(name)
    except (httpx.HTTPError, ValueError, json.JSONDecodeError):
        return ""
    except Exception:
        logging.getLogger(__name__).exception("Reading a social page name failed")
        return ""
    finally:
        if own_client:
            client.close()


# ---------------------------------------------------------------------------
# The endpoint
# ---------------------------------------------------------------------------

class SocialNameRequest(BaseModel):
    platform: str
    link: str


def social_router(get_user_id, finder=find_name):
    """POST /social/name, given main.py's login check (added to the app with
    one line in main.py). finder is the page reader, replaced by a pretend one
    in the tests."""
    router = APIRouter()
    recent = defaultdict(deque)  # user id -> times of their last tries

    def too_many(user_id):
        now = time.monotonic()
        times = recent[user_id]
        while times and now - times[0] > 60:
            times.popleft()
        if len(times) >= MAX_PER_MINUTE:
            return True
        times.append(now)
        return False

    @router.post("/social/name")
    def social_name(body: SocialNameRequest, authorization: str | None = Header(default=None)):
        """The name on a social page: {"name": "Juan Dela Cruz"}, or
        {"name": ""} when the page shows none."""
        user_id = get_user_id(authorization)
        platform = body.platform.strip().lower()
        link = body.link.strip()
        if not link_ok(platform, link):
            raise HTTPException(400, "That isn't a link to a page on that platform.")
        if too_many(user_id):
            raise HTTPException(429, "Too many tries. Please wait a minute.")
        return {"name": finder(platform, link)}

    return router
