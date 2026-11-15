"""Checks the Verified owner badge (site_check.py, PLAN-site-verification.md):
reading the code from a page, the safety rules for visiting a typed address,
and the two endpoints. No real website or database is used: pages come from a
pretend web (httpx.MockTransport), site names from a pretend address book, and
rows from a small in-memory database. From the ai-service folder, run:

    python test_site_check.py           (all the checks above)
    python test_site_check.py --live    (also visits 2 real websites)

Every check prints PASS or FAIL, and the script exits with 1 if any check failed.
"""

import socket
import sys
import uuid

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

import site_check
from site_check import check_site, find_codes, is_public_host, is_shared_site, same_site, site_router

results = []


def check(name, ok):
    ok = bool(ok)
    results.append(ok)
    print(("PASS " if ok else "FAIL ") + name)


# ---------------------------------------------------------------------------
# 1. Reading the code from a page
# ---------------------------------------------------------------------------

LINE = '<meta name="philfreela-verification" content="pf-7k3q9x2m">'
check("finds the line in <head>", find_codes(f"<html><head><title>Juan</title>{LINE}</head><body>Hi</body></html>") == ["pf-7k3q9x2m"])
check("finds a self-closing line", find_codes('<head><meta name="philfreela-verification" content="pf-7k3q9x2m" /></head>') == ["pf-7k3q9x2m"])
check("finds it written in capitals", find_codes('<HEAD><META NAME="PhilFreela-Verification" CONTENT=" pf-7k3q9x2m "></HEAD>') == ["pf-7k3q9x2m"])
check("finds it when the page has no <head> tag", find_codes(f"<!doctype html><meta charset=utf-8>{LINE}<p>Hi</p>") == ["pf-7k3q9x2m"])
check("ignores a line in the visible part (e.g. a comment box)", find_codes(f"<head><title>Blog</title></head><body><div class=comment>{LINE}</div></body>") == [])
check("ignores a line after the visible part started, even without <body>", find_codes(f"<title>x</title><div>post</div>{LINE}") == [])
check("ignores a line inside <!-- a comment -->", find_codes(f"<head><!-- {LINE} --></head>") == [])
check("ignores the text inside a script", find_codes(f"<head><script>var s = '{LINE}';</script></head>") == [])
check("ignores other meta lines", find_codes('<head><meta name="google-site-verification" content="abc"></head>') == [])
check("reads another name when asked (used by --live)", find_codes('<head><meta name="google-site-verification" content="abc"></head>', "google-site-verification") == ["abc"])
check("a broken page doesn't crash", isinstance(find_codes("<head><meta name=philfreela-verification content=pf-1 <<<"), list))

# ---------------------------------------------------------------------------
# 2. Which links can be verified
# ---------------------------------------------------------------------------

check("juan.dev can be verified", not is_shared_site("https://juan.dev"))
check("juan.github.io can be verified", not is_shared_site("https://juan.github.io/portfolio"))
check("juan.vercel.app can be verified", not is_shared_site("https://juan.vercel.app"))
check("github.com/juan is a shared site", is_shared_site("https://github.com/juan"))
check("www.behance.net/juan is a shared site", is_shared_site("https://www.behance.net/juan"))
check("sites.google.com is a shared site", is_shared_site("https://sites.google.com/view/juan"))
check("notgithub.com is not mistaken for github.com", not is_shared_site("https://notgithub.com"))
check("juan.dev and www.juan.dev are the same site", same_site("juan.dev", "www.juan.dev"))
check("juan.dev and other.com are not", not same_site("juan.dev", "other.com"))
check("blog.juan.dev and juan.dev are not", not same_site("blog.juan.dev", "juan.dev"))

# ---------------------------------------------------------------------------
# 3. Visiting a typed address safely
# ---------------------------------------------------------------------------

ADDRESS_BOOK = {
    "juan.dev": ["93.184.216.34"],
    "www.juan.dev": ["93.184.216.34"],
    "other.com": ["93.184.216.35"],
    "inside.example": ["192.168.1.10"],
    "loopback.example": ["127.0.0.1"],
    "cloud.example": ["169.254.169.254"],
    "mixed.example": ["93.184.216.36", "10.0.0.5"],
    "v6.example": ["::1"],
    "slow.example": ["93.184.216.37"],
}


def resolve(host, port, proto=0):
    if host not in ADDRESS_BOOK:
        raise socket.gaierror("not found")
    return [(socket.AF_INET, socket.SOCK_STREAM, proto, "", (ip, port)) for ip in ADDRESS_BOOK[host]]


check("a public address is allowed", is_public_host("juan.dev", resolve) is True)
check("a home network address is refused", is_public_host("inside.example", resolve) is False)
check("localhost is refused", is_public_host("loopback.example", resolve) is False)
check("the cloud's internal address is refused", is_public_host("cloud.example", resolve) is False)
check("one private address among public ones is refused", is_public_host("mixed.example", resolve) is False)
check("IPv6 localhost is refused", is_public_host("v6.example", resolve) is False)
check("an unknown name is 'not found'", is_public_host("nowhere.example", resolve) is None)

visits = []
BIG = "<head><title>x</title>" + ("<!-- " + "x" * 1000 + " -->") * 600 + LINE + "</head>"


def pretend_web(request):
    """The pretend internet: what each address answers."""
    url = str(request.url)
    visits.append(url)
    html = {"content-type": "text/html; charset=utf-8"}
    pages = {
        "https://juan.dev/": httpx.Response(200, headers=html, text=f"<html><head>{LINE}</head><body>Juan</body></html>"),
        "https://juan.dev/empty": httpx.Response(200, headers=html, text="<html><head><title>Juan</title></head><body></body></html>"),
        "https://juan.dev/wrong": httpx.Response(200, headers=html, text='<head><meta name="philfreela-verification" content="pf-someoneels"></head>'),
        "https://juan.dev/to-www": httpx.Response(301, headers={"location": "https://www.juan.dev/"}),
        "https://www.juan.dev/": httpx.Response(200, headers=html, text=f"<head>{LINE}</head>"),
        "https://juan.dev/to-other": httpx.Response(302, headers={"location": "https://other.com/"}),
        "https://juan.dev/to-http": httpx.Response(302, headers={"location": "http://juan.dev/"}),
        "https://juan.dev/to-inside": httpx.Response(302, headers={"location": "https://inside.example/"}),
        "https://juan.dev/loop": httpx.Response(302, headers={"location": "/loop"}),
        "https://juan.dev/missing": httpx.Response(404, headers=html, text="Not found"),
        "https://juan.dev/picture.png": httpx.Response(200, headers={"content-type": "image/png"}, content=b"PNG"),
        "https://juan.dev/big": httpx.Response(200, headers=html, text=BIG),
        "https://juan.dev/oddcharset": httpx.Response(200, headers={"content-type": "text/html; charset=nonsense-9"}, text=f"<head>{LINE}</head>"),
        "https://other.com/": httpx.Response(200, headers=html, text=f"<head>{LINE}</head>"),
    }
    if url.startswith("https://slow.example"):
        raise httpx.ConnectTimeout("too slow", request=request)
    return pages.get(url, httpx.Response(404, text="none"))


def run(link, code="pf-7k3q9x2m"):
    with httpx.Client(transport=httpx.MockTransport(pretend_web), follow_redirects=False) as client:
        return check_site(link, code, client=client, resolve=resolve)


found, message = run("https://juan.dev/")
check("VERIFIED when the person's code is on the page", found is True and message is None)
found, message = run("https://juan.dev/empty")
check("not verified when there is no line", not found and "couldn't find your code" in message)
found, message = run("https://juan.dev/wrong")
check("not verified when the line has someone else's code", not found and "different code" in message)
found, message = run("https://juan.dev/", code="pf-pedrocode1")
check("Pedro's code doesn't match Juan's page", not found and "different code" in message)
found, message = run("https://juan.dev/to-www")
check("follows a redirect to www. on the same site", found is True)
found, message = run("https://juan.dev/to-other")
check("refuses a redirect to another website (even one with the code)", not found and "another website" in message)
found, message = run("https://juan.dev/to-http")
check("refuses a redirect to a page that isn't secure", not found and "isn't secure" in message)
visits.clear()
found, message = run("https://inside.example/")
check("refuses a private address without visiting it", not found and message == "That address can't be checked." and not visits)
found, message = run("https://juan.dev/loop")
check("stops after 3 redirects", not found and "too many pages" in message)
found, message = run("https://juan.dev/missing")
check("explains an error page (404)", not found and "(404)" in message)
found, message = run("https://juan.dev/picture.png")
check("refuses a link that isn't a web page", not found and "doesn't open a web page" in message)
found, message = run("https://juan.dev/big")
check("reads only the first 512 KB (a code after that doesn't count)", not found and "couldn't find your code" in message)
found, message = run("https://juan.dev/oddcharset")
check("a page with a made-up character set is still read", found is True)
found, message = run("https://slow.example/")
check("a site that doesn't answer gives a clear message", not found and "couldn't open" in message)
found, message = run("https://nowhere.example/")
check("an unknown site name gives a clear message", not found and "couldn't find the website" in message)
found, message = run("https://juan.dev:8443/")
check("refuses a link with a port number", not found and "port number" in message)
found, message = run("http://juan.dev/")
check("refuses an http link", not found and "isn't secure" in message)

# ---------------------------------------------------------------------------
# 4. The two endpoints, with a pretend database and login
# ---------------------------------------------------------------------------


class Result:
    def __init__(self, data):
        self.data = data


class PretendQuery:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.op, self.payload, self.count = db, table, [], "select", None, None

    def select(self, columns):
        self.op = "select"
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, count):
        self.count = count
        return self

    def insert(self, row):
        self.op, self.payload = "insert", row
        return self

    def update(self, values):
        self.op, self.payload = "update", values
        return self

    def execute(self):
        rows = self.db[self.table]
        if self.op == "insert":
            for row in rows:
                if (row["freelancer_id"], row["link"]) == (self.payload["freelancer_id"], self.payload["link"]) or row["code"] == self.payload["code"]:
                    raise APIError({"message": "duplicate key value", "code": "23505"})
            row = {"id": str(uuid.uuid4()), "verified_at": None, "checked_at": None, **self.payload}
            rows.append(row)
            return Result([dict(row)])
        matched = [row for row in rows if all(row.get(column) == value for column, value in self.filters)]
        if self.op == "update":
            for row in matched:
                row.update(self.payload)
            return Result([dict(row) for row in matched])
        return Result([dict(row) for row in matched[: self.count or None]])


class PretendSupabase:
    def __init__(self):
        self.db = {
            "profiles": [
                {"id": "u-juan", "portfolio_links": ["https://juan.dev", "https://github.com/juan", "https://juan.dev/empty"]},
                {"id": "u-pedro", "portfolio_links": ["https://juan.dev"]},
                {"id": "u-full", "portfolio_links": ["https://new.dev"]},
            ],
            "site_verifications": [
                {"id": f"r{i}", "freelancer_id": "u-full", "link": f"https://old{i}.dev", "code": f"pf-full{i:06d}", "verified_at": None, "checked_at": None}
                for i in range(10)
            ],
        }

    def table(self, name):
        return PretendQuery(self.db, name)


def pretend_login(authorization):
    people = {"Bearer juan": "u-juan", "Bearer pedro": "u-pedro", "Bearer full": "u-full"}
    if authorization not in people:
        raise HTTPException(401, "Please log in first.")
    return people[authorization]


checked = []


def pretend_checker(link, code):
    """Juan's code is on juan.dev; nothing else is anywhere."""
    checked.append((link, code))
    if link == "https://juan.dev" and code == juan_code:
        return True, None
    return False, "We couldn't find your code."


fake = PretendSupabase()
app = FastAPI()
app.include_router(site_router(fake, pretend_login, checker=pretend_checker))
api = TestClient(app)


def post(path, who, link):
    headers = {"Authorization": f"Bearer {who}"} if who else {}
    return api.post(path, json={"link": link}, headers=headers)


response = post("/sites/code", None, "https://juan.dev")
check("no login: 401", response.status_code == 401)
response = post("/sites/code", "juan", "https://someone-else.dev")
check("a link that isn't in their Portfolio Links: 404", response.status_code == 404 and "Portfolio Links" in response.json()["detail"])
response = post("/sites/code", "juan", "https://github.com/juan")
check("a shared-site link: 400", response.status_code == 400 and "shared sites" in response.json()["detail"])
response = post("/sites/code", "juan", "https://juan.dev")
juan_code = response.json().get("code", "")
check("Juan gets a code shaped pf- and 10 letters/digits", response.status_code == 200 and len(juan_code) == 13 and juan_code.startswith("pf-") and juan_code[3:].isalnum() and juan_code[3:].lower() == juan_code[3:])
check("it starts not verified", response.json().get("verified_at") is None)
response = post("/sites/code", "juan", "https://juan.dev")
check("asking again gives the same code", response.json().get("code") == juan_code)
response = post("/sites/code", "pedro", "https://juan.dev")
pedro_code = response.json().get("code", "")
check("Pedro gets a different code for the same site", response.status_code == 200 and pedro_code and pedro_code != juan_code)
response = post("/sites/code", "full", "https://new.dev")
check("at most 10 codes per person: 409", response.status_code == 409)

response = post("/sites/check", "juan", "https://juan.dev/empty")
check("Check without a code first: 404", response.status_code == 404 and "Verify first" in response.json()["detail"])
response = post("/sites/check", "pedro", "https://juan.dev")
body = response.json()
check("Pedro's check: not verified, with a message", response.status_code == 200 and body["verified"] is False and body["message"])
check("the check used Pedro's own code", checked[-1] == ("https://juan.dev", pedro_code))
response = post("/sites/check", "pedro", "https://juan.dev")
check("checking again at once: 429 with the seconds to wait", response.status_code == 429 and "seconds" in response.json()["detail"])
response = post("/sites/check", "juan", "https://juan.dev")
body = response.json()
check("Juan's check: VERIFIED with a date", response.status_code == 200 and body["verified"] is True and body["verified_at"])
juan_row = next(r for r in fake.db["site_verifications"] if r["freelancer_id"] == "u-juan")
pedro_row = next(r for r in fake.db["site_verifications"] if r["freelancer_id"] == "u-pedro")
check("Juan's row is saved as verified", juan_row["verified_at"] is not None and juan_row["checked_at"] is not None)
check("Pedro's row stays not verified (only checked_at saved)", pedro_row["verified_at"] is None and pedro_row["checked_at"] is not None)
response = post("/sites/code", "juan", "https://juan.dev")
check("Juan's code answer now carries the date", response.json().get("verified_at") == juan_row["verified_at"])

# The 30 seconds are counted from the saved time, also in the database's own format.
pedro_row["checked_at"] = "2020-01-01T00:00:00.12345+00:00"
response = post("/sites/check", "pedro", "https://juan.dev")
check("after the wait Pedro may check again (and an old time like .12345 is read)", response.status_code == 200)

# ---------------------------------------------------------------------------
# 5. Optional: two real websites (needs the internet)
# ---------------------------------------------------------------------------

if "--live" in sys.argv:
    # No site has a PhilFreela line yet, so Google's line on Philstar stands in.
    found, message = check_site("https://www.philstar.com/", "-XDnbcliO_8moaHtwWwt6bfL7OuZJxdwORPCeqtmRZU", name="google-site-verification")
    check("LIVE: Philstar's real Google code is found", found is True)
    found, message = check_site("https://www.philstar.com/", "pf-pretender1", name="google-site-verification")
    check("LIVE: a pretender's code on Philstar is not", found is False and "different code" in message)
    found, message = check_site("https://phil-freela.pages.dev/", "pf-7k3q9x2m")
    check("LIVE: PhilFreela's homepage has no PhilFreela line yet", found is False and "couldn't find your code" in message)
    print("   (message shown: " + message + ")")

print(f"\n{sum(results)}/{len(results)} checks passed")
sys.exit(0 if all(results) else 1)
