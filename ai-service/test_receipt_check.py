"""Tests the GCash receipt check (receipt_check.py and the POST /receipts/read
route in main.py). From the ai-service folder, run:

    .venv\\Scripts\\python test_receipt_check.py

It needs the models folder filled by get_models.py and takes about a minute.
Every check prints PASS or FAIL, and the script exits with 1 if any failed.

Three parts:
  A. the patterns, on text (no pictures): dates, reference numbers, amounts, initials
  B. made-up receipt screenshots (receipt_samples.py) read by the real text
     reader, then judged: real-looking ones, edited ones, wrong ones, unreadable ones
  C. the route, with a pretend database and storage (nothing reaches Supabase)

The receipts are invented and drawn by receipt_samples.py from what is known
about GCash's layout; a real GCash screenshot should also be tried by hand
before trusting it (PLAN-receipt-ai.md).
"""

import os
import sys
from datetime import datetime, timedelta

# Made-up values, set BEFORE the service's modules are imported, so the real keys in .env are never used.
os.environ["SUPABASE_URL"] = "https://example.invalid"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.made-up-signature-for-tests"

import receipt_check as rc  # noqa: E402
import receipt_samples as rs  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  ({detail})" if detail and not ok else ""))


def rows(*texts):
    return [{"text": text, "height": 40} for text in texts]


PH = rc.PH_TIME

# ---------------------------------------------------------------------------
# A. Patterns on text
# ---------------------------------------------------------------------------

print("--- A. patterns ---")
for text, expected in [
    ("Nov 8, 2026 11:23 AM", datetime(2026, 11, 8, 11, 23, tzinfo=PH)),
    ("Nov 8.2026 11:23 AM", datetime(2026, 11, 8, 11, 23, tzinfo=PH)),
    ("November 08, 2026, 9:05 PM", datetime(2026, 11, 8, 21, 5, tzinfo=PH)),
    ("08 Nov 2026 3:05 PM", datetime(2026, 11, 8, 15, 5, tzinfo=PH)),
    ("11/08/2026 12:05 AM", datetime(2026, 11, 8, 0, 5, tzinfo=PH)),
    ("2026-11-08 14:05:09", datetime(2026, 11, 8, 14, 5, 9, tzinfo=PH)),
    ("Ref No. 4021 358 091742 Nov 8, 2026 12:30 PM", datetime(2026, 11, 8, 12, 30, tzinfo=PH)),
    ("Nov 31, 2026 1:00 PM", None),
    ("Total 1,500.00", None),
]:
    got = rc.find_paid_at(rows(text))
    check(f"date: {text!r}", got == expected, f"got {got}")

for texts, expected in [
    (("Ref No. 4021 358 091742",), "4021358091742"),
    (("Ref. No.: 4021358091742",), "4021358091742"),
    (("Ref No. 4021 358 O91742",), "4021358091742"),
    (("InstaPay Ref No.", "4021 358 091742"), "4021358091742"),
    (("Express Send", "4021 358 091742"), "4021358091742"),
    (("+63 917 123 4567", "Amount 1,500.00"), None),
    (("Ref No. 4021 358 0917",), None),
]:
    got, _ = rc.find_reference(rows(*texts))
    check(f"reference: {texts}", got == expected, f"got {got}")

check("a time read as 11.23 AM is not money", not rc.AMOUNT.search("Nov 8, 2026 11.23 AM"))
check("P1,500.00 is money", rc.AMOUNT.search("Total Amount Sent P1,500.00") is not None)

for texts, expected_amount, expected_disagree in [
    (("P1,500.00", "Amount 1,500.00", "Total Amount Sent P1,500.00"), 1500.0, False),
    (("P1,800.00", "Amount 1,500.00", "Total Amount Sent P1,500.00"), 1500.0, True),
    (("P515.00", "Amount 500.00", "Fee 15.00", "Total 515.00"), 500.0, False),
    (("P515.00", "Fee 15.00", "Total 515.00"), 500.0, False),
    (("Amount", "1,250.00"), 1250.0, False),
    (("Available balance 9,000.00", "Amount 300.00"), 300.0, False),
]:
    got, disagree = rc.amount_sent(rc.find_amounts(rows(*texts)))
    check(f"amount: {texts}", got == expected_amount and disagree == expected_disagree, f"got {got}, disagree {disagree}")

for receipt, account, expected in [
    (["J", "D"], ["J", "D", "C"], True),
    (["J", "C"], ["J", "M", "D", "C"], True),
    (["M", "S"], ["J", "D"], False),
    (["J", "S"], ["J", "D"], False),
    ([], ["J", "D"], None),
]:
    check(f"initials {receipt} vs {account}", rc.initials_match(receipt, account) is expected)

# ---------------------------------------------------------------------------
# B. Made-up screenshots, read by the real text reader
# ---------------------------------------------------------------------------

print("--- B. pictures ---")
NOW = datetime(2026, 11, 8, 12, 0, tzinfo=PH)
STARTED = NOW - timedelta(days=3)
PAID = NOW - timedelta(minutes=37)


def judged(data, **changes):
    expected = {
        "account_name": "Juan Dela Cruz", "gcash_number": "09171234567", "earliest": STARTED,
        "earliest_what": "the project started", "requested_amount": None, "reuse": {}, "now": NOW,
    }
    expected.update(changes)
    reading = rc.read_receipt(data)
    verdict, reasons = rc.judge(reading, **expected)
    return reading, verdict, reasons


def picture_case(name, data, want_verdict, *, reason=None, amount=None, **changes):
    reading, verdict, reasons = judged(data, **changes)
    ok = verdict == want_verdict
    if reason:
        ok = ok and any(reason in r for r in reasons)
    if amount is not None:
        ok = ok and reading["amount"] == amount
    check(f"{name} -> {want_verdict}", ok, f"got {verdict} {reasons} amount={reading['amount']} ref={reading['reference']} "
                                              f"date={reading['paid_at']} name={reading['name']} end={reading['number_end']}")
    return reading


good = rs.draw_receipt(paid_at=PAID)
reading = picture_case("a real-looking receipt", good, "ok", amount=1500.0)
check("  reads the reference, date, initials and number end",
      reading["reference"] == "4021358091742" and reading["paid_at"] == PAID.replace(second=0)
      and reading["initials"] == ["J", "D"] and reading["number_end"] == "4567")
picture_case("the same as a small, low quality JPEG", rs.as_jpeg(good, quality=55, scale=0.6), "ok", amount=1500.0)
picture_case("a 720-wide phone screenshot", rs.draw_receipt(paid_at=PAID, width=720, height=1560), "ok", amount=1500.0)
picture_case("a big amount with centavos", rs.draw_receipt(paid_at=PAID, amount="15,750.50"), "ok", amount=15750.5)
picture_case("Fee and Total lines", rs.draw_receipt(paid_at=PAID, amount="500.00", fee="15.00", total="515.00", top_amount="515.00"),
             "ok", amount=500.0)
picture_case("day-month date, reference run together", rs.draw_receipt(paid_at=PAID, date_style="dmy", ref_spaced=False), "ok")
picture_case("11/08/2026 date", rs.draw_receipt(paid_at=PAID, date_style="num"), "ok")
picture_case("no name or number shown (nothing to compare)", rs.draw_receipt(paid_at=PAID, name=None, phone=None), "ok")

picture_case("the big amount edited", rs.draw_receipt(paid_at=PAID, top_amount="1,800.00"), "blocked", reason="two different amounts")
picture_case("sent to someone else", rs.draw_receipt(paid_at=PAID, name="M***A S.", phone="+63 918 *** 9999"), "blocked",
             reason="sent to someone else")
picture_case("dated tomorrow", rs.draw_receipt(paid_at=NOW + timedelta(days=1)), "blocked", reason="in the future")
picture_case("dated before the project", rs.draw_receipt(paid_at=STARTED - timedelta(days=3)), "blocked", reason="before the project started")
picture_case("reference already recorded", good, "blocked", reason="already recorded", reuse={"reference_used": True})
picture_case("the same file used before", good, "blocked", reason="same screenshot", reuse={"picture_used": True})
picture_case("not a receipt", rs.plain_picture(["Invoice No. 2026-118", "Bill to: Example Store", "Item: Logo design",
                                                 "Total: 1,500.00", "Thank you for your business"]), "blocked",
             reason="doesn't look like a GCash receipt")

picture_case("only the initials differ", rs.draw_receipt(paid_at=PAID, name="M***A S."), "check", reason="initials on it")
picture_case("only the number differs", rs.draw_receipt(paid_at=PAID, phone="+63 918 *** 9999"), "check", reason="ends in 9999")
picture_case("saved by Photoshop", rs.as_jpeg(good, quality=90, software="Adobe Photoshop 25.0"), "check", reason="Photoshop")
picture_case("pasted on a wide picture", rs.sideways(good), "check", reason="wider than it is tall")
picture_case("same amount, same minute as another payment", good, "check", reason="same minute", reuse={"same_minute": True})
picture_case("a chat request for a different amount", good, "check", reason="asked for", requested_amount=1600)

picture_case("too blurry and small", rs.as_jpeg(good, quality=40, scale=0.12, blur=2), "unreadable")
picture_case("the reference cut off", rs.draw_receipt(paid_at=PAID, reference=""), "unreadable", reason="reference number")

# ---------------------------------------------------------------------------
# C. The route, with a pretend database and storage
# ---------------------------------------------------------------------------

print("--- C. route ---")
from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

CLIENT, FREELANCER, STRANGER = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"
PROJECT, REQUEST, PAID_REQUEST = "44444444-4444-4444-8444-444444444444", "55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"


class Result:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.row = db, table, [], None

    def select(self, columns):
        self.columns = [c.strip() for c in columns.split(",")]
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def limit(self, _):
        return self

    def insert(self, row):
        self.row = row
        return self

    def execute(self):
        if self.row is not None:
            allowed = {"client_id", "project_id", "payment_id", "receipt_path", "picture_hash", "reference_no", "amount",
                       "paid_at", "receipt_name", "receipt_initials", "verdict", "reasons"}
            extra = set(self.row) - allowed
            if extra:
                raise RuntimeError(f"receipt_checks has no column {extra}")
            saved = dict(self.row, id=f"check-{len(self.db['receipt_checks']) + 1}")
            self.db["receipt_checks"].append(saved)
            return Result([saved])
        found = [r for r in self.db[self.table] if all(r.get(c) == v for c, v in self.filters)]
        return Result([{c: r[c] for c in self.columns} for r in found])


class Bucket:
    def __init__(self, files):
        self.files = files

    def upload(self, path, data, options):
        self.files[path] = (data, options)

    def remove(self, paths):
        for path in paths:
            self.files.pop(path, None)


class FakeSupabase:
    def __init__(self):
        self.db = {
            "projects": [{"id": PROJECT, "client_id": CLIENT, "freelancer_id": FREELANCER,
                          "started_at": "2026-11-05T04:00:00.12345+00:00"}],
            "payments": [
                {"id": REQUEST, "client_id": CLIENT, "freelancer_id": FREELANCER, "conversation_id": "chat-1",
                 "status": "requested", "amount": 1600, "created_at": "2026-11-07T02:00:00+00:00"},
                {"id": PAID_REQUEST, "client_id": CLIENT, "freelancer_id": FREELANCER, "conversation_id": "chat-2",
                 "status": "sent", "amount": 500, "created_at": "2026-11-07T02:00:00+00:00"},
            ],
            "gcash_accounts": [{"freelancer_id": FREELANCER, "gcash_number": "09171234567", "account_name": "Juan Dela Cruz"}],
            "receipt_checks": [],
        }
        self.files = {}
        self.reuse_calls = []
        fake = self

        class Auth:
            def get_user(self, token):
                user_id = {"client-token": CLIENT, "stranger-token": STRANGER}.get(token)
                if not user_id:
                    raise RuntimeError("bad token")
                return type("Response", (), {"user": type("User", (), {"id": user_id})()})()

        class Storage:
            def from_(self, bucket):
                assert bucket == "receipts"
                return Bucket(fake.files)

        self.auth, self.storage = Auth(), Storage()

    def table(self, name):
        return Query(self.db, name)

    def rpc(self, name, params):
        assert name == "receipt_reuse"
        self.reuse_calls.append(params)
        answer = Result([{"reference_used": False, "picture_used": False, "same_minute": False}])
        return type("Call", (), {"execute": lambda self: answer})()


fake = FakeSupabase()
main.supabase = fake
client = TestClient(main.app)
# The route judges against the real clock, so the made-up receipts are dated just now.
recent = datetime.now(PH) - timedelta(minutes=5)
good_now = rs.draw_receipt(paid_at=recent)


def post(token, data, **form):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.post("/receipts/read", headers=headers, data=form, files={"file": ("receipt.png", data, "image/png")})


response = post(None, good_now, project_id=PROJECT)
check("no login -> 401", response.status_code == 401)
response = post("client-token", good_now, project_id=PROJECT, payment_id=REQUEST)
check("both a project and a request -> 400", response.status_code == 400)
response = post("client-token", good_now, project_id="not-a-uuid")
check("a broken id -> 400", response.status_code == 400)
response = post("stranger-token", good_now, project_id=PROJECT)
check("not the project's client -> 403", response.status_code == 403)
response = post("client-token", b"hello, I am a text file", project_id=PROJECT)
check("a text file named .png -> 400", response.status_code == 400)
response = post("client-token", b"0" * (rc.MAX_RECEIPT_BYTES + 1), project_id=PROJECT)
check("more than 4 MB -> 400", response.status_code == 400)

response = post("client-token", good_now, project_id=PROJECT)
body = response.json()
saved = fake.db["receipt_checks"][-1] if fake.db["receipt_checks"] else {}
check("a good receipt -> ok with what was read", response.status_code == 200 and body["verdict"] == "ok"
      and body["reference"] == "4021358091742" and body["amount"] == 1500.0 and body["initials"] == "J. D."
      and body["check_id"] == saved.get("id"), str(body))
check("  its clean copy is saved in the client's folder as a JPEG",
      saved.get("receipt_path", "").startswith(CLIENT + "/receipt-") and saved["receipt_path"] in fake.files
      and fake.files[saved["receipt_path"]][0][:3] == b"\xff\xd8\xff", str(saved.get("receipt_path")))
check("  the row has the amount, reference and date for the database",
      saved.get("amount") == 1500.0 and saved.get("reference_no") == "4021358091742" and saved.get("paid_at", "").endswith("+08:00")
      and len(saved.get("picture_hash", "")) == 64 and saved.get("project_id") == PROJECT and saved.get("payment_id") is None)
check("  receipt_reuse was asked with the reference and the freelancer",
      fake.reuse_calls[-1]["ref"] == "4021358091742" and fake.reuse_calls[-1]["target_freelancer"] == FREELANCER)

files_before = len(fake.files)
response = post("client-token", rs.draw_receipt(paid_at=recent, name="M***A S.", phone="+63 918 *** 9999"), project_id=PROJECT)
body = response.json()
saved = fake.db["receipt_checks"][-1]
check("a receipt sent to someone else -> blocked, nothing kept",
      body["verdict"] == "blocked" and saved["receipt_path"] is None and saved["reference_no"] is None
      and saved["amount"] is None and len(fake.files) == files_before, str(body))

response = post("client-token", good_now, payment_id=REQUEST)
body = response.json()
check("a chat request for a different amount -> check", response.status_code == 200 and body["verdict"] == "check"
      and any("asked for" in r for r in body["reasons"]) and fake.db["receipt_checks"][-1]["payment_id"] == REQUEST, str(body))
response = post("client-token", good_now, payment_id=PAID_REQUEST)
check("a request already paid -> 409", response.status_code == 409)

print()
print(f"{sum(results)} of {len(results)} checks passed")
sys.exit(0 if all(results) else 1)
