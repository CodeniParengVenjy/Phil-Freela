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
(page_to_read). For an account with no username, Facebook then forwards to
/people/Juan-Dela-Cruz/... before its login page, and the name is read from
that address (name_in_address).

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
import hashlib
import hmac
import json
import logging
import os
import re
import socket
import threading
import time
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import unquote, urljoin, urlsplit

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from site_check import is_public_host

TIMEOUT_SECONDS = 5             # longest wait for the site to answer each time
TOTAL_SECONDS = 8               # longest time for reading the whole page
MAX_PAGE_BYTES = 2_500_000      # stop after this much, title found or not
MAX_REDIRECTS = 5               # facebook.com/123 -> web. -> /people/... -> login takes 3
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
    return plain_name(text)


def plain_name(text):
    """text, or "" when it is a login or error page's words, or just the
    platform's own name."""
    text = (text or "").strip()
    if not text or text.lower() in PLATFORM_WORDS or NOT_A_NAME.search(text):
        return ""
    return text


def name_in_address(platform, url):
    """The name Facebook writes in an address. A number-only link (the person
    has no username) sends visitors on to
        https://web.facebook.com/people/Juan-Dela-Cruz/pfbid0ywQZ...
    with the name in it, dashes for spaces, before its login page (found
    2026-11-24 with a real profile.php?id= link). "" for any other address."""
    if platform != "facebook":
        return ""
    match = re.match(r"^/people/([^/]+)/", urlsplit(url).path)
    if not match:
        return ""
    return plain_name(unquote(match.group(1)).replace("-", " "))


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


def read_title(platform, link, client, resolve=socket.getaddrinfo, hops=None):
    """Opens the page at link, safely (see the top of this file). Returns
    (title, address_name): the page's title, and a name found in one of the
    addresses it went through (name_in_address); each is "" when there is none.
    hops: a list that gets each answer ("302 www.facebook.com/4"), for /social/selftest."""
    url = link
    address_name = ""
    deadline = time.monotonic() + TOTAL_SECONDS
    note = hops.append if hops is not None else (lambda _text: None)
    for _ in range(MAX_REDIRECTS + 1):
        parts = urlsplit(url)
        host = (parts.hostname or "").lower()
        if parts.scheme != "https" or parts.port not in (None, 443) or not on_platform(platform, host):
            note(f"stopped: {host or url[:40]} is not on {platform}")
            return "", address_name  # a redirect to another website, or to a page that isn't https
        if not is_public_host(host, resolve):
            note(f"stopped: {host} is not a public address")
            return "", address_name
        # (read only from an address that passed the checks above)
        address_name = name_in_address(platform, url) or address_name
        with client.stream("GET", url) as response:
            note(f"{response.status_code} {host}{parts.path}")
            if response.status_code in (301, 302, 303, 307, 308) and response.headers.get("location"):
                url = urljoin(url, response.headers["location"])
                continue
            if response.status_code >= 400:
                return "", address_name  # a missing account, or a site that refuses servers
            body = bytearray()
            for chunk in response.iter_bytes():
                start = max(0, len(body) - 1024)  # a title split between two chunks is still found
                body.extend(chunk)
                title = find_title(platform, bytes(body[start:]))
                if title is not None:
                    note(f"title: {tidy(title)[:80]}")
                    return title, address_name
                if len(body) >= MAX_PAGE_BYTES or time.monotonic() > deadline:
                    break
            note(f"no title in the first {len(body)} bytes")
            return "", address_name
    note("stopped: too many redirects")
    return "", address_name


def page_to_read(platform, link):
    """The address to open for a link. Facebook sends a server that opens
    profile.php?id=123 to its login page, but facebook.com/123 still leads to
    the profile when the account has a username, and through
    /people/Juan-Dela-Cruz/... when it doesn't (tried 2026-11-24)."""
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


def find_name(platform, link, client=None, resolve=socket.getaddrinfo, hops=None):
    """The name to show for a saved-style link, or "" when none can be found.
    Never raises: a site that doesn't answer just means no name. hops: see
    read_title."""
    own_client = client is None
    if own_client:
        client = httpx.Client(
            timeout=TIMEOUT_SECONDS, follow_redirects=False,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.8"},
        )
    try:
        if platform == "tiktok":
            name = plain_name(tidy(tiktok_name(link, client)))
        else:
            title, address_name = read_title(platform, page_to_read(platform, link), client, resolve, hops)
            # The page's own title is best (real capitals and dashes); a login page
            # has none, then the name from Facebook's /people/ address is used.
            name = name_from_title(platform, title) or address_name
        return clean_name(name)
    except (httpx.HTTPError, ValueError, json.JSONDecodeError) as problem:
        if hops is not None:
            hops.append(f"failed: {type(problem).__name__}")
        return ""
    except Exception:
        logging.getLogger(__name__).exception("Reading a social page name failed")
        if hops is not None:
            hops.append("failed: unexpected error")
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


# The fixed public pages /social/selftest tries (famous people and brands, never
# a user's link), and how long its answer is kept.
SELFTEST_LINKS = (
    ("facebook", "https://www.facebook.com/zuck"),
    ("facebook", "https://www.facebook.com/profile.php?id=4"),
    ("instagram", "https://www.instagram.com/nasa/"),
    ("tiktok", "https://www.tiktok.com/@nasa"),
    ("youtube", "https://www.youtube.com/@NASA"),
    ("linkedin", "https://www.linkedin.com/in/williamhgates"),
    ("github", "https://github.com/torvalds"),
    ("x", "https://x.com/NASA"),
    ("threads", "https://www.threads.com/@nasa"),
)
SELFTEST_KEEP_SECONDS = 60


def probe_key(secret=None):
    """The key /social/probe needs. It is made from the service's own secret
    (SUPABASE_SERVICE_ROLE_KEY), so only the people who run the service can make
    it; "" when the secret isn't set (then /social/probe is closed)."""
    secret = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") if secret is None else secret
    return hashlib.sha256(("social-probe:" + secret).encode()).hexdigest() if secret else ""


def social_router(get_user_id, finder=find_name):
    """POST /social/name, given main.py's login check (added to the app with
    one line in main.py), and GET /social/selftest. finder is the page reader,
    replaced by a pretend one in the tests."""
    router = APIRouter()
    recent = defaultdict(deque)  # user id -> times of their last tries
    last_test = {"at": 0.0, "answer": None}
    test_lock = threading.Lock()

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

    @router.get("/social/selftest")
    def social_selftest():
        """Which platforms give a name to THIS server right now: the reader is
        tried on fixed public pages (SELFTEST_LINKS) and each answer is listed
        with the addresses it went through. A site can treat a cloud server
        differently from a laptop, so this shows what the live service really
        gets. No login is needed because it takes no input at all, and the
        answer is kept for 60 seconds, so it can't be used to flood the sites."""
        with test_lock:
            if last_test["answer"] and time.monotonic() - last_test["at"] < SELFTEST_KEEP_SECONDS:
                return last_test["answer"]

            def try_one(item):
                platform, link = item
                hops = []
                started = time.monotonic()
                name = finder(platform, link, hops=hops)
                return {"platform": platform, "link": link, "name": name,
                        "seconds": round(time.monotonic() - started, 1), "hops": hops}

            with ThreadPoolExecutor(max_workers=3) as pool:  # 3 at a time, so the tries don't slow each other down
                results = list(pool.map(try_one, SELFTEST_LINKS))
            answer = {"checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "results": results}
            last_test.update(at=time.monotonic(), answer=answer)
            return answer

    @router.post("/social/probe")
    def social_probe(body: SocialNameRequest, x_probe_key: str | None = Header(default=None)):
        """For the people who run the service: what /social/name finds for one
        link, with every address it went through (like /social/selftest, but for
        a link that broke for a user). It needs the X-Probe-Key header
        (probe_key()), so nobody else can use it."""
        expected = probe_key()
        if not expected or not x_probe_key or not hmac.compare_digest(x_probe_key, expected):
            raise HTTPException(403, "Not allowed.")
        platform = body.platform.strip().lower()
        link = body.link.strip()
        if not link_ok(platform, link):
            raise HTTPException(400, "That isn't a link to a page on that platform.")
        hops = []
        started = time.monotonic()
        name = finder(platform, link, hops=hops)
        return {"name": name, "seconds": round(time.monotonic() - started, 1), "hops": hops}

    return router
