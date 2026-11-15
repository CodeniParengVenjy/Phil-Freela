"""Verified owner badge for a freelancer's own website (PLAN-site-verification.md).

How it works:
1. The freelancer clicks Verify next to one of their portfolio links.
   POST /sites/code gives them a one-of-a-kind code for that link, e.g.
       <meta name="philfreela-verification" content="pf-7k3q9x2m">
2. They put that line inside the <head> of the page and publish it.
3. They click Check now. POST /sites/check downloads the page, the same way a
   browser does, and looks for the line. If the code is there, the link is
   saved as verified (site_verifications.verified_at) and gets a
   "Verified owner" badge for 90 days.

Why it proves ownership: anyone can READ a page's code (every browser downloads
it), but only the site's owner can CHANGE it. Google, Microsoft and others check
website owners the same way.

Why it can't be faked: each code belongs to one person and one link, and only
this service (which holds the service key) can mark a link verified; the
database doesn't let the browser write to site_verifications at all.

Visiting an address someone typed must be done carefully, so fetch_page():
- opens https pages only, on the normal port;
- refuses any address inside a private network (localhost, 192.168.x.x, 10.x,
  cloud-internal addresses): every address the site name points to must be a
  public internet address;
- follows at most 3 redirects, and only within the same site (juan.dev to
  www.juan.dev), so a link on a big site that forwards elsewhere can't borrow
  someone else's badge;
- gives up after 5 seconds of silence (10 seconds in all) and reads at most the
  first 512 KB of the page;
- never shows the page to anyone: it only answers "found" or "not found".
"""

import ipaddress
import logging
import re
import secrets
import socket
import string
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi import APIRouter, Header, HTTPException
from postgrest.exceptions import APIError
from pydantic import BaseModel

META_NAME = "philfreela-verification"
TIMEOUT_SECONDS = 5           # longest wait for the site to answer each time
TOTAL_SECONDS = 10            # longest time for the whole check
MAX_PAGE_BYTES = 512 * 1024   # only the start of the page is read
MAX_REDIRECTS = 3
WAIT_SECONDS = 30             # one check per link every 30 seconds
MAX_CODES_PER_PERSON = 10
CODE_LETTERS = string.ascii_lowercase + string.digits
USER_AGENT = "Mozilla/5.0 (compatible; PhilFreela-SiteCheck/1.0; +https://phil-freela.pages.dev)"

# Pages on these sites belong to the site, not to the freelancer, so nobody can
# add their own code to them: they stay plain links. The website has the same
# list (canVerifyLink in client/src/lib/profile.js).
SHARED_SITES = (
    "behance.net", "github.com", "dribbble.com", "linkedin.com", "youtube.com", "youtu.be",
    "vimeo.com", "instagram.com", "facebook.com", "tiktok.com", "x.com", "twitter.com",
    "drive.google.com", "docs.google.com", "sites.google.com", "canva.com", "figma.com",
)

# Tags that belong in a page's <head>. The first other tag means the visible
# part of the page has started, and a code there doesn't count (so a code typed
# into a comment box on someone else's page is never read as theirs).
HEAD_TAGS = {"html", "head", "meta", "title", "link", "style", "script", "base", "noscript", "template"}


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def host_of(link):
    """The site name of a link, e.g. "www.juan.dev"."""
    try:
        return (urlsplit(link).hostname or "").lower()
    except ValueError:
        return ""


def short_name(link):
    """A short way to write a link in a message: "juan.dev/portfolio"."""
    text = re.sub(r"^https?://(www\.)?", "", link, flags=re.IGNORECASE).rstrip("/")
    return text if len(text) <= 40 else text[:39] + "..."


def is_shared_site(link):
    """True for a link on a shared site like Behance or GitHub (see SHARED_SITES)."""
    host = host_of(link)
    return any(host == site or host.endswith("." + site) for site in SHARED_SITES)


def same_site(host_a, host_b):
    """juan.dev and www.juan.dev count as the same site; anything else doesn't."""
    def strip(host):
        return host[4:] if host.startswith("www.") else host
    return strip(host_a) == strip(host_b)


def is_public_host(host, resolve=socket.getaddrinfo):
    """True when every address the site name points to is on the public
    internet, False when any of them is inside a private network, and None when
    the name can't be found at all."""
    try:
        infos = resolve(host, 443, proto=socket.IPPROTO_TCP)
    except (OSError, UnicodeError):
        return None
    addresses = {info[4][0].split("%")[0] for info in infos}
    if not addresses:
        return None
    return all(ipaddress.ip_address(address).is_global for address in addresses)


def new_code():
    """A fresh code: "pf-" and 10 random lowercase letters or digits."""
    return "pf-" + "".join(secrets.choice(CODE_LETTERS) for _ in range(10))


def parse_time(text):
    """A time from the database as a datetime (same as _timestamp in main.py:
    Python 3.10 only reads 3 or 6 digits after the seconds, so they are padded)."""
    match = re.match(r"^(.*?T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(.*)$", text)
    if not match:
        return datetime.fromisoformat(text)
    head, fraction, zone = match.groups()
    fraction = ("." + (fraction + "000000")[:6]) if fraction else ""
    return datetime.fromisoformat(head + fraction + (zone or "+00:00").replace("Z", "+00:00"))


# ---------------------------------------------------------------------------
# Reading the page
# ---------------------------------------------------------------------------

class _CodeFinder(HTMLParser):
    """Collects the content of every <meta name="philfreela-verification"> line
    in the top part of the page (before the visible part starts). Lines inside
    <!-- comments --> or inside scripts aren't tags, so they don't count."""

    def __init__(self, name):
        super().__init__(convert_charrefs=True)
        self.name = name
        self.codes = []
        self.in_body = False

    def handle_starttag(self, tag, attrs):
        if self.in_body:
            return
        if tag not in HEAD_TAGS:
            self.in_body = True
            return
        if tag == "meta":
            values = {key.lower(): (value or "") for key, value in attrs}
            if values.get("name", "").strip().lower() == self.name:
                self.codes.append(values.get("content", "").strip())


def find_codes(html, name=META_NAME):
    """Every code written in a <meta name="philfreela-verification"> line at the top of the page."""
    finder = _CodeFinder(name)
    try:
        finder.feed(html)
        finder.close()
    except Exception:  # a badly broken page: keep whatever was read before it broke
        logging.getLogger(__name__).info("Couldn't read the whole page")
    return finder.codes


class PageProblem(Exception):
    """The page couldn't be checked; the message can be shown to the user."""


def fetch_page(link, client=None, resolve=socket.getaddrinfo):
    """Downloads the start of the page at link, safely (see the top of this
    file). Returns the page's code as text, or raises PageProblem."""
    name = short_name(link)
    start_host = host_of(link)
    deadline = time.monotonic() + TOTAL_SECONDS
    own_client = client is None
    if own_client:
        client = httpx.Client(timeout=TIMEOUT_SECONDS, follow_redirects=False, headers={"User-Agent": USER_AGENT})
    try:
        url = link
        for _ in range(MAX_REDIRECTS + 1):
            parts = urlsplit(url)
            if parts.scheme != "https":
                raise PageProblem(f"{name} sends visitors to a page that isn't secure (https), so it can't be checked.")
            if parts.port not in (None, 443):
                raise PageProblem("Links with a port number (like :8080) can't be checked.")
            host = (parts.hostname or "").lower()
            if not same_site(host, start_host):
                raise PageProblem(f"{name} sends visitors to another website, so it can't be checked. Save the address it ends up on as your link, then verify that one.")
            public = is_public_host(host, resolve)
            if public is None:
                raise PageProblem(f"We couldn't find the website {host}. Check the link for typos.")
            if not public:
                raise PageProblem("That address can't be checked.")

            with client.stream("GET", url) as response:
                if response.status_code in (301, 302, 303, 307, 308) and response.headers.get("location"):
                    url = urljoin(url, response.headers["location"])
                    continue
                if response.status_code >= 400:
                    raise PageProblem(f"{name} answered with an error ({response.status_code}). Check that the page opens in your browser.")
                kind = response.headers.get("content-type", "").lower()
                if kind and "html" not in kind:
                    raise PageProblem("That link doesn't open a web page.")
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) >= MAX_PAGE_BYTES:
                        break
                    if time.monotonic() > deadline:
                        raise PageProblem("The website took too long to answer. Please try again.")
                try:
                    return bytes(body[:MAX_PAGE_BYTES]).decode(response.encoding or "utf-8", errors="replace")
                except LookupError:  # the site named a character set that doesn't exist
                    return bytes(body[:MAX_PAGE_BYTES]).decode("utf-8", errors="replace")
        raise PageProblem(f"{name} sends visitors through too many pages. Save the address it ends up on as your link.")
    except httpx.HTTPError:
        raise PageProblem(f"We couldn't open {name}. Check that the website is online, then try again.")
    finally:
        if own_client:
            client.close()


def check_site(link, code, client=None, resolve=socket.getaddrinfo, name=META_NAME):
    """Is this person's code on the page at link? Returns (True, None), or
    (False, a message that says what to fix)."""
    try:
        html = fetch_page(link, client=client, resolve=resolve)
    except PageProblem as problem:
        return False, str(problem)
    codes = find_codes(html, name)
    if code in codes:
        return True, None
    if codes:
        return False, f"We found a PhilFreela line on {short_name(link)}, but it has a different code. Copy your code again from this window."
    return False, f"We couldn't find your code on {short_name(link)}. Make sure the line is inside the page's <head> and that you published the change."


# ---------------------------------------------------------------------------
# The two endpoints
# ---------------------------------------------------------------------------

class SiteLinkRequest(BaseModel):
    link: str


def site_router(supabase, get_user_id, checker=check_site):
    """/sites/code and /sites/check, given main.py's database client and its
    login check (added to the app with one line in main.py). checker is the
    page check, replaced by a pretend one in the tests."""
    router = APIRouter()

    def own_row(user_id, link):
        rows = (
            supabase.table("site_verifications").select("id, code, verified_at, checked_at")
            .eq("freelancer_id", user_id).eq("link", link).limit(1).execute().data
        )
        return rows[0] if rows else None

    def require_saved_link(user_id, link):
        """The link must be one of the caller's own saved portfolio links, and
        not on a shared site."""
        rows = supabase.table("profiles").select("portfolio_links").eq("id", user_id).limit(1).execute().data
        links = (rows[0].get("portfolio_links") or []) if rows else []
        if link not in links:
            raise HTTPException(404, "Add this link to your Portfolio Links first.")
        if is_shared_site(link):
            raise HTTPException(400, "Links on shared sites like Behance or GitHub can't be verified, because nobody can add their own code to those pages.")

    @router.post("/sites/code")
    def site_code(body: SiteLinkRequest, authorization: str | None = Header(default=None)):
        """Verified owner badge: the caller's code for one of their own portfolio
        links: {"code": "pf-7k3q9x2m", "verified_at": null}. Made the first time,
        the same one after that."""
        user_id = get_user_id(authorization)
        link = body.link.strip()[:200]
        try:
            require_saved_link(user_id, link)
            row = own_row(user_id, link)
            if row:
                return {"code": row["code"], "verified_at": row["verified_at"]}
            made = (
                supabase.table("site_verifications").select("id")
                .eq("freelancer_id", user_id).limit(MAX_CODES_PER_PERSON + 1).execute().data
            )
            if len(made) >= MAX_CODES_PER_PERSON:
                raise HTTPException(409, f"You've asked for the most codes allowed ({MAX_CODES_PER_PERSON}).")
            for _ in range(2):
                try:
                    supabase.table("site_verifications").insert(
                        {"freelancer_id": user_id, "link": link, "code": new_code()}
                    ).execute()
                    break
                except APIError:
                    # Clicked twice at once (the row now exists), or, very
                    # rarely, the random code was already taken: try again.
                    if own_row(user_id, link):
                        break
            row = own_row(user_id, link)
            if not row:
                raise HTTPException(503, "Verifying isn't available right now. Please try again.")
            return {"code": row["code"], "verified_at": row["verified_at"]}
        except APIError:
            logging.exception("Site code failed")
            raise HTTPException(503, "Verifying isn't available right now. Please try again.")

    @router.post("/sites/check")
    def site_check(body: SiteLinkRequest, authorization: str | None = Header(default=None)):
        """Verified owner badge: visits the page at one of the caller's portfolio
        links and looks for their code. Returns {"verified": true, "verified_at":
        "..."} or {"verified": false, "message": "...", "verified_at": null or an
        earlier date}. One check per link every 30 seconds."""
        user_id = get_user_id(authorization)
        link = body.link.strip()[:200]
        try:
            require_saved_link(user_id, link)
            row = own_row(user_id, link)
            if not row:
                raise HTTPException(404, "Click Verify first to get your code.")
            now = datetime.now(timezone.utc)
            if row["checked_at"]:
                waited = (now - parse_time(row["checked_at"])).total_seconds()
                if waited < WAIT_SECONDS:
                    raise HTTPException(429, f"Please wait {int(WAIT_SECONDS - waited) + 1} seconds before checking again.")
            # Saved before the visit, so the 30 seconds count even when it fails.
            supabase.table("site_verifications").update({"checked_at": now.isoformat()}).eq("id", row["id"]).execute()
            found, message = checker(link, row["code"])
            if not found:
                return {"verified": False, "message": message, "verified_at": row["verified_at"]}
            supabase.table("site_verifications").update({"verified_at": now.isoformat()}).eq("id", row["id"]).execute()
            return {"verified": True, "verified_at": now.isoformat()}
        except APIError:
            logging.exception("Site check failed")
            raise HTTPException(503, "Verifying isn't available right now. Please try again.")

    return router
