"""Checks the Name to show finder (social_name.py, PLAN-social-name.md):
cutting the name out of each platform's page title, the safety rules for
visiting a pasted link, and the endpoint. No real website is used: pages come
from a pretend web (httpx.MockTransport) and site names from a pretend address
book. From the ai-service folder, run:

    python test_social_name.py           (all the checks above)
    python test_social_name.py --live    (also visits public pages: NASA, GitHub's Linus Torvalds...)

Every check prints PASS or FAIL, and the script exits with 1 if any check failed.
"""

import socket
import sys

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

import social_name
from social_name import clean_name, find_name, link_ok, name_from_title, name_in_address, on_platform, page_to_read, social_router

results = []


def check(name, ok):
    ok = bool(ok)
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name)


# ---------------------------------------------------------------------------
# 1. Cutting the name out of a title (real titles, copied 2026-11-24)
# ---------------------------------------------------------------------------

titles = [
    ("facebook", "Mark Zuckerberg", "Mark Zuckerberg"),
    ("facebook", "Juan Dela Cruz | Facebook", "Juan Dela Cruz"),
    ("instagram", "NASA (&#064;nasa) &#x2022; Instagram photos and videos", "NASA"),
    ("instagram", "Bea Ramos (@bea.edits) • Instagram photos and videos", "Bea Ramos"),
    ("threads", "NASA (&#064;nasa) &#x2022; Threads, Say more", "NASA"),
    ("x", "NASA (@NASA) / X", "NASA"),
    ("x", "NASA (@NASA) on X", "NASA"),
    ("youtube", "NASA - YouTube", "NASA"),
    ("youtube", "NASA", "NASA"),
    ("linkedin", "Bill Gates - Chair, Gates Foundation and Founder, Breakthrough Energy | LinkedIn", "Bill Gates"),
    ("linkedin", "Microsoft | LinkedIn", "Microsoft"),
    ("github", "torvalds (Linus Torvalds) · GitHub", "Linus Torvalds"),
    ("github", "Microsoft · GitHub", "Microsoft"),
]
for platform, title, want in titles:
    got = name_from_title(platform, title)
    check(f"{platform}: '{title[:45]}' gives '{want}' (got '{got}')", got == want)

no_name = [
    ("facebook", "Facebook"),
    ("facebook", "Log into Facebook | Facebook"),
    ("facebook", "Facebook – log in or sign up"),
    ("facebook", "Error"),
    ("instagram", "Instagram"),
    ("instagram", "Login • Instagram"),
    ("instagram", "@nasa • Instagram photos and videos"),
    ("threads", "Threads • Log in"),
    ("x", "User Profile Not Found - X | 404 Error"),
    ("linkedin", "Sign Up | LinkedIn"),
    ("linkedin", "LinkedIn Login, Sign in | LinkedIn"),
    ("github", "Page not found · GitHub"),
    ("youtube", "404 Not Found"),
    ("youtube", "YouTube"),
    ("youtube", ""),
]
for platform, title in no_name:
    got = name_from_title(platform, title)
    check(f"{platform}: '{title}' holds no name (got '{got}')", got == "")

# ---------------------------------------------------------------------------
# 2. Making a found name fit the "Name to show" rule
# ---------------------------------------------------------------------------

check("a plain name stays", clean_name("Juan Dela Cruz") == "Juan Dela Cruz")
check("forbidden characters are taken out", clean_name('Juan <b>"DC"</b> / `x`') == "Juan bDCb x")
check("extra spaces are tidied", clean_name("  Juan   Dela\tCruz ") == "Juan Dela Cruz")
check("a link is not a name", clean_name("visit www.juan.dev") == "" and clean_name("https://juan.dev") == "")
check("a long name is cut to 40 at a word", clean_name("Juan Miguel Santos Dela Cruz Bautista Reyes Jr") == "Juan Miguel Santos Dela Cruz Bautista")
check("an emoji counts as 2, like on the website", len(clean_name("Ana " + chr(0x1F600) * 30).encode("utf-16-le")) // 2 <= 40)
check("control characters go", clean_name("Juan" + chr(7) + " Cruz") == "Juan Cruz")
check("nothing in, nothing out", clean_name("") == "" and clean_name(None) == "")

# ---------------------------------------------------------------------------
# 3. Which links may be visited
# ---------------------------------------------------------------------------

check("a Facebook name link is allowed", link_ok("facebook", "https://www.facebook.com/juan.dc"))
check("a Facebook id link is allowed", link_ok("facebook", "https://www.facebook.com/profile.php?id=100012345"))
check("a TikTok link is allowed", link_ok("tiktok", "https://www.tiktok.com/@juan"))
check("a Threads .net link is allowed", link_ok("threads", "https://www.threads.net/@juan"))
check("a TikTok link under Facebook is refused", not link_ok("facebook", "https://www.tiktok.com/@juan"))
check("a look-alike site is refused", not link_ok("facebook", "https://evilfacebook.com/juan"))
check("facebook.com.evil.com is refused", not link_ok("facebook", "https://facebook.com.evil.com/juan"))
check("facebook.com@evil.com is refused", not link_ok("facebook", "https://facebook.com@evil.com/juan"))
check("http is refused", not link_ok("instagram", "http://www.instagram.com/juan"))
check("a ?query is refused", not link_ok("instagram", "https://www.instagram.com/juan?next=https://evil.com"))
check("an unknown platform is refused", not link_ok("myspace", "https://myspace.com/juan"))
check("Pinterest is refused (removed from the site 2026-11-24)", not link_ok("pinterest", "https://www.pinterest.com/juan/"))
check("a link over 200 characters is refused", not link_ok("github", "https://github.com/" + "a" * 190))
check("web.facebook.com is Facebook's", on_platform("facebook", "web.facebook.com"))
check("evilfacebook.com is not Facebook's", not on_platform("facebook", "evilfacebook.com"))
check("a Facebook id link is opened as facebook.com/<id>", page_to_read("facebook", "https://m.facebook.com/profile.php?id=4") == "https://www.facebook.com/4")
check("other links are opened as they are", page_to_read("github", "https://github.com/juan") == "https://github.com/juan")
check("a /people/ address holds the name, dashes for spaces", name_in_address("facebook", "https://web.facebook.com/people/Juan-Dela-Cruz/pfbid0abcDEF") == "Juan Dela Cruz")
check("   ...also with letters like é (written %C3%A9 in the address)", name_in_address("facebook", "https://web.facebook.com/people/Jos%C3%A9-Rizal/pfbid0xyz") == "José Rizal")
check("   ...only for Facebook", name_in_address("instagram", "https://www.instagram.com/people/Juan-Dela-Cruz/x") == "")
check("   ...only in the address's own path, not inside ?next=", name_in_address("facebook", "https://web.facebook.com/login/?next=/people/Juan-Dela-Cruz/x") == "")
check("   ...and never a login word", name_in_address("facebook", "https://web.facebook.com/people/Log-in/pfbid0") == "")
check("other Facebook addresses hold no name", name_in_address("facebook", "https://web.facebook.com/61500000000001?_rdc=1") == "")

# ---------------------------------------------------------------------------
# 4. Visiting a pasted link safely (pretend web)
# ---------------------------------------------------------------------------

ADDRESS_BOOK = {
    "www.facebook.com": ["157.240.1.35"],
    "web.facebook.com": ["157.240.1.35"],
    "www.instagram.com": ["157.240.1.174"],
    "github.com": ["140.82.112.3"],
    "www.youtube.com": ["142.250.1.1"],
    "x.com": ["104.244.42.1"],
    "www.tiktok.com": ["23.1.1.1"],
    "www.linkedin.com": ["13.107.42.14"],
    "inside.facebook.com": ["10.0.0.5"],
    "evil.com": ["93.184.216.34"],
}


def resolve(host, port, proto=0):
    if host not in ADDRESS_BOOK:
        raise socket.gaierror("not found")
    return [(socket.AF_INET, socket.SOCK_STREAM, proto, "", (ip, port)) for ip in ADDRESS_BOOK[host]]


visits = []
HTML = {"content-type": "text/html; charset=utf-8"}
# A page with its title far down (like YouTube).
FAR = b"<html><head><script>var x='" + b"y" * 1_200_000 + b"';</script><title>NASA - YouTube</title></head></html>"
# A page with no title at all, longer than the reading limit.
ENDLESS = b"<html><body>" + b"z" * 3_000_000 + b"</body></html>"


def chunks(data, size=65_536):
    """Sends a page in pieces, like a real website does."""
    for start in range(0, len(data), size):
        yield data[start:start + size]


def pretend_web(request):
    """The pretend internet: what each address answers."""
    url = str(request.url)
    visits.append(url)
    pages = {
        "https://www.facebook.com/juan.dc": httpx.Response(302, headers={"location": "https://web.facebook.com/juan.dc?_rdc=1&_rdr"}),
        "https://web.facebook.com/juan.dc?_rdc=1&_rdr": httpx.Response(200, headers=HTML, text='<html><head><meta property="og:title" content="Juan Dela Cruz" /><title>Juan Dela Cruz</title></head></html>'),
        "https://www.facebook.com/4": httpx.Response(302, headers={"location": "https://web.facebook.com/zuck"}),
        "https://web.facebook.com/zuck": httpx.Response(200, headers=HTML, text='<head><meta property="og:title" content="Mark Zuckerberg"></head>'),
        "https://www.facebook.com/locked": httpx.Response(302, headers={"location": "https://www.facebook.com/login/?next=x"}),
        "https://www.facebook.com/login/?next=x": httpx.Response(200, headers=HTML, text="<head><title>Log into Facebook | Facebook</title></head>"),
        # A number-only account (no username), the way Facebook really answered on 2026-11-24
        # (made-up number and name): www -> web -> /people/<name>/<code> -> its login page.
        "https://www.facebook.com/61500000000001": httpx.Response(302, headers={"location": "https://web.facebook.com/61500000000001?_rdc=1&_rdr"}),
        "https://web.facebook.com/61500000000001?_rdc=1&_rdr": httpx.Response(301, headers={"location": "https://web.facebook.com/people/Juan-Dela-Cruz/pfbid0abcDEF"}),
        "https://web.facebook.com/people/Juan-Dela-Cruz/pfbid0abcDEF": httpx.Response(302, headers={"location": "https://web.facebook.com/login/?next=x2"}),
        "https://web.facebook.com/login/?next=x2": httpx.Response(200, headers=HTML, text="<head><title>Facebook</title></head>"),
        "https://www.facebook.com/61500000000002": httpx.Response(302, headers={"location": "https://web.facebook.com/people/Jos%C3%A9-Rizal/pfbid0xyz"}),
        "https://web.facebook.com/people/Jos%C3%A9-Rizal/pfbid0xyz": httpx.Response(302, headers={"location": "https://web.facebook.com/login/?next=x2"}),
        "https://www.facebook.com/61500000000003": httpx.Response(301, headers={"location": "https://web.facebook.com/people/Mary-Anne-Cruz/pfbid0q"}),
        "https://web.facebook.com/people/Mary-Anne-Cruz/pfbid0q": httpx.Response(200, headers=HTML, text='<head><meta property="og:title" content="Mary-Anne Cruz"></head>'),
        "https://www.facebook.com/61500000000004": httpx.Response(302, headers={"location": "https://evil.com/people/Fake-Name/pfbid0"}),
        "https://www.facebook.com/away": httpx.Response(302, headers={"location": "https://evil.com/page"}),
        "https://www.facebook.com/inside": httpx.Response(302, headers={"location": "https://inside.facebook.com/x"}),
        "https://www.facebook.com/plain": httpx.Response(302, headers={"location": "http://www.facebook.com/plain"}),
        "https://www.facebook.com/loop": httpx.Response(302, headers={"location": "/loop"}),
        "https://www.instagram.com/nasa/": httpx.Response(200, headers=HTML, text='<head><meta property="og:title" content="NASA (&#064;nasa) &#x2022; Instagram photos and videos" /></head>'),
        "https://github.com/torvalds": httpx.Response(200, headers=HTML, text='<head><meta property="og:title" content="torvalds - Overview" /><title>torvalds (Linus Torvalds) · GitHub</title></head>'),
        "https://github.com/nobody": httpx.Response(404, headers=HTML, text="Not Found"),
        "https://www.youtube.com/@NASA": httpx.Response(200, headers=HTML, content=chunks(FAR)),
        "https://www.youtube.com/@endless": httpx.Response(200, headers=HTML, content=chunks(ENDLESS)),
        "https://www.linkedin.com/in/juan": httpx.Response(999, headers=HTML, text="request denied"),
        # The og:title line starts right before the end of the first 65,536-byte piece.
        "https://x.com/split": httpx.Response(200, headers=HTML, content=chunks(b"<head>" + b" " * 65_510 + b'<meta property="og:title" content="Split Name (@split) on X"/></head>')),
    }
    if url.startswith(social_name.TIKTOK_OEMBED):
        asked_for = request.url.params.get("url")
        if asked_for == "https://www.tiktok.com/@nasa":
            return httpx.Response(200, json={"author_name": "NASA", "author_url": asked_for})
        if asked_for == "https://www.tiktok.com/@broken":
            return httpx.Response(200, text="not json")
        return httpx.Response(400, json={"code": 400, "message": "Something went wrong"})
    if url.startswith("https://www.instagram.com/slow"):
        raise httpx.ConnectTimeout("too slow", request=request)
    return pages.get(url, httpx.Response(404, text="none"))


def find(platform, link):
    with httpx.Client(transport=httpx.MockTransport(pretend_web), follow_redirects=False) as client:
        return find_name(platform, link, client=client, resolve=resolve)


check("Facebook: follows www to web.facebook.com and reads og:title", find("facebook", "https://www.facebook.com/juan.dc") == "Juan Dela Cruz")
visits.clear()
check("Facebook id link: opened as facebook.com/4, gives the name", find("facebook", "https://www.facebook.com/profile.php?id=4") == "Mark Zuckerberg")
check("   ...and profile.php itself was never opened", visits and not any("profile.php" in url for url in visits))
check("Facebook login page: no name", find("facebook", "https://www.facebook.com/locked") == "")
got = find("facebook", "https://web.facebook.com/profile.php?id=61500000000001")
check(f"Facebook number-only account: the name from the /people/ address, though the end is a login page (got '{got}')", got == "Juan Dela Cruz")
got = find("facebook", "https://www.facebook.com/profile.php?id=61500000000002")
check(f"   ...with é in the name (got '{got}')", got == "José Rizal")
got = find("facebook", "https://www.facebook.com/profile.php?id=61500000000003")
check(f"   ...when the page itself does open, its title wins (real dash kept) (got '{got}')", got == "Mary-Anne Cruz")
visits.clear()
got = find("facebook", "https://www.facebook.com/profile.php?id=61500000000004")
check(f"   ...a /people/ address on ANOTHER website is not read (got '{got}')", got == "" and not any("evil.com" in url for url in visits))
visits.clear()
check("a redirect to another website: no name", find("facebook", "https://www.facebook.com/away") == "")
check("   ...and the other website was never opened", not any("evil.com" in url for url in visits))
visits.clear()
check("a redirect into a private network: no name", find("facebook", "https://www.facebook.com/inside") == "")
check("   ...and it was never opened", not any("inside.facebook.com" in url for url in visits))
check("a redirect to http: no name", find("facebook", "https://www.facebook.com/plain") == "")
visits.clear()
check("a redirect loop stops", find("facebook", "https://www.facebook.com/loop") == "" and len(visits) <= social_name.MAX_REDIRECTS + 1)
check("Instagram: the name before (@nasa)", find("instagram", "https://www.instagram.com/nasa/") == "NASA")
check("GitHub: the name from <title>, not og:title", find("github", "https://github.com/torvalds") == "Linus Torvalds")
check("GitHub missing account (404): no name", find("github", "https://github.com/nobody") == "")
check("YouTube: a title 1.2 MB down the page is still found", find("youtube", "https://www.youtube.com/@NASA") == "NASA")
check("X: a title split between two pieces is still found", find("x", "https://x.com/split") == "Split Name")
check("a page with no title stops at the reading limit", find("youtube", "https://www.youtube.com/@endless") == "")
check("LinkedIn refusing servers (999): no name", find("linkedin", "https://www.linkedin.com/in/juan") == "")
check("a site that doesn't answer: no name, no crash", find("instagram", "https://www.instagram.com/slow") == "")
check("TikTok: the name from its embed address", find("tiktok", "https://www.tiktok.com/@nasa") == "NASA")
check("TikTok missing account: no name", find("tiktok", "https://www.tiktok.com/@nobody") == "")
check("TikTok broken answer: no name, no crash", find("tiktok", "https://www.tiktok.com/@broken") == "")

# ---------------------------------------------------------------------------
# 5. The endpoint
# ---------------------------------------------------------------------------


def pretend_login(authorization):
    people = {"Bearer juan": "u-juan", "Bearer pedro": "u-pedro"}
    if authorization not in people:
        raise HTTPException(401, "Please log in first.")
    return people[authorization]


asked = []


def pretend_finder(platform, link):
    asked.append((platform, link))
    return "Juan Dela Cruz" if link == "https://www.facebook.com/juan.dc" else ""


app = FastAPI()
app.include_router(social_router(pretend_login, finder=pretend_finder))
api = TestClient(app)


def post(who, platform, link):
    headers = {"Authorization": f"Bearer {who}"} if who else {}
    return api.post("/social/name", json={"platform": platform, "link": link}, headers=headers)


response = post(None, "facebook", "https://www.facebook.com/juan.dc")
check("no login: 401", response.status_code == 401 and not asked)
response = post("juan", "facebook", "https://www.facebook.com/juan.dc")
check("Juan gets the name", response.status_code == 200 and response.json() == {"name": "Juan Dela Cruz"})
response = post("juan", "facebook", "https://www.facebook.com/someone")
check("no name on the page: 200 with an empty name", response.status_code == 200 and response.json() == {"name": ""})
before = len(asked)
response = post("juan", "facebook", "https://evil.com/juan")
check("a link that isn't on the platform: 400, never visited", response.status_code == 400 and len(asked) == before)
response = post("juan", "Facebook ", " https://www.facebook.com/juan.dc ")
check("spaces and capitals in the request are fine", response.status_code == 200 and response.json()["name"] == "Juan Dela Cruz")
for _ in range(social_name.MAX_PER_MINUTE):
    response = post("pedro", "github", "https://github.com/pedro")
check(f"Pedro's first {social_name.MAX_PER_MINUTE} tries in a minute are answered", response.status_code == 200)
response = post("pedro", "github", "https://github.com/pedro")
check("one more: 429", response.status_code == 429 and "wait" in response.json()["detail"])
response = post("juan", "github", "https://github.com/juan")
check("Pedro's limit doesn't stop Juan", response.status_code == 200)

# ---------------------------------------------------------------------------
# 6. Optional: real public pages (needs the internet)
# ---------------------------------------------------------------------------

if "--live" in sys.argv:
    live = [
        ("facebook", "https://www.facebook.com/zuck", "Mark Zuckerberg"),
        ("facebook", "https://www.facebook.com/profile.php?id=4", "Mark Zuckerberg"),
        ("instagram", "https://www.instagram.com/nasa/", "NASA"),
        ("tiktok", "https://www.tiktok.com/@nasa", "NASA"),
        ("youtube", "https://www.youtube.com/@NASA", "NASA"),
        ("linkedin", "https://www.linkedin.com/in/williamhgates", "Bill Gates"),
        ("github", "https://github.com/torvalds", "Linus Torvalds"),
        ("x", "https://x.com/NASA", "NASA"),
        ("threads", "https://www.threads.com/@nasa", "NASA"),
        ("instagram", "https://www.instagram.com/thisuserdoesnotexist98765x", ""),
    ]
    for platform, link, want in live:
        got = find_name(platform, link)
        check(f"LIVE: {link} gives '{want}' (got '{got}')", got == want)

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
