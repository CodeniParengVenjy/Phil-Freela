"""Checks best_fit.py (Best fit applicants, part of feature 1, the Hybrid
recommendation system). From the ai-service folder, run:

    python test_best_fit.py

Part 1 is only math. Part 2 uses the real AI model on the made-up resumes in
resume_samples.py. Part 3 runs the whole thing against a pretend database
(nothing real is touched). Every check prints PASS or FAIL, and the script
exits with 1 if any check failed.
"""

import sys

import best_fit as bf
import resume_samples as samples

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok or not detail else f"  -> {detail}"))


def applicant(app_id, applied="2026-11-01T00:00:00+00:00", similarity=None, resume_skills=(), profile_skills=(),
              completed=0, ratings=0, stars=None, reply=None, read="ok"):
    """One row the way best_fit() hands it to rank()."""
    return {
        "application_id": app_id, "applied_at": applied, "similarity": similarity,
        "resume_skills": list(resume_skills), "profile_skills": list(profile_skills),
        "completed_count": completed, "rating_count": ratings, "avg_stars": stars,
        "reply_minutes": reply, "read": read,
    }


def order(ranked):
    return [r["application_id"] for r in ranked]


# ---------------------------------------------------------------------------
print("Part 1: the math")
# ---------------------------------------------------------------------------

check("weights add up to 1", abs(sum(bf.WEIGHTS.values()) - 1) < 1e-9)
check("unrelated resume (0.15) scores 0", bf.resume_score(0.15) == 0)
check("matching resume (0.55+) scores 1", bf.resume_score(0.60) == 1)
check("in between is in between", 0.4 < bf.resume_score(0.35) < 0.6, bf.resume_score(0.35))
check("unknown resume gets the middle score", bf.resume_score(None) == bf.UNKNOWN_RESUME)

skills = ["Logo Design", "Adobe Illustrator", "Packaging Design"]
exact, related = bf.skill_matches(skills, "graphic-design", ["Logo Design"], ["illustrator"])
check("skills found in the resume and on the profile (typed differently) both count",
      exact == ["Logo Design", "Adobe Illustrator"], exact)
check("a skill they lack, but of the same kind of work, is related",
      related == [("Packaging Design", "Logo Design")], related)

# The case the user saw on live: an invitation job, a graphic designer's resume.
exact, related = bf.skill_matches(["Creative Designer", "Invitation Design"], "graphic-design",
                                  ["Graphic Design", "Canva", "Adobe Photoshop"], ["Video Editor"])
check("'Invitation Design' is related to Graphic Design (same kind of work)", ("Invitation Design", "Graphic Design") in related, related)
check("a typed skill not on the list ('Creative Designer') takes the job's category", ("Creative Designer", "Graphic Design") in related, related)
exact, related = bf.skill_matches(["Invitation Design"], "graphic-design", ["Python", "Web Development", "Bookkeeping"], [])
check("unrelated skills give nothing", exact == [] and related == [], (exact, related))
exact, related = bf.skill_matches(["Event Hosting Help"], "other", ["Data Entry"], ["Some Other Thing"])
check("the mixed 'other' group never makes skills related", related == [], related)

one_exact = bf.score_applicant(applicant("e", similarity=0.5, resume_skills=["Invitation Design"]), ["Invitation Design"], "graphic-design")
one_related = bf.score_applicant(applicant("r", similarity=0.5, resume_skills=["Graphic Design"]), ["Invitation Design"], "graphic-design")
one_none = bf.score_applicant(applicant("n", similarity=0.5, resume_skills=["Python"]), ["Invitation Design"], "graphic-design")
check("the exact skill beats a related one, which beats none", one_exact["fit"] > one_related["fit"] > one_none["fit"],
      (one_exact["fit"], one_related["fit"], one_none["fit"]))
check("a related skill is named in the list and counted",
      one_related["skills_matched"] == ["Invitation Design (related: Graphic Design)"] and one_related["skills_related"] == 1, one_related)

# The resume that fits the job beats a better record with an unrelated resume.
ranked = bf.rank([
    applicant("record", similarity=0.18, completed=10, ratings=10, stars=5.0, reply=10),
    applicant("fits", similarity=0.60, resume_skills=skills),
], skills)
check("a resume that fits the job beats a strong record with an unrelated resume", order(ranked) == ["fits", "record"], ranked)

# Two equally good resumes: the better record wins.
ranked = bf.rank([
    applicant("new", similarity=0.50, resume_skills=skills),
    applicant("proven", similarity=0.50, resume_skills=skills, completed=6, ratings=6, stars=4.8),
], skills)
check("equal resumes: the one with better ratings and more projects goes first", order(ranked) == ["proven", "new"], ranked)
check("rating and projects are reported", ranked[0]["rating_count"] == 6 and ranked[0]["avg_stars"] == 4.8 and ranked[0]["completed"] == 6, ranked[0])

# A tie: whoever applied first goes first (not newest first, the old unfair order).
ranked = bf.rank([
    applicant("late", applied="2026-11-05T10:00:00+00:00", similarity=0.45),
    applicant("early", applied="2026-11-01T10:00:00+00:00", similarity=0.45),
], [])
check("a tie goes to whoever applied first", order(ranked) == ["early", "late"], ranked)

# No ratings is not a punishment: a new freelancer with a great resume beats a
# poorly rated one with the same resume.
ranked = bf.rank([
    applicant("bad", similarity=0.50, ratings=4, stars=1.5),
    applicant("newcomer", similarity=0.50),
], [])
check("no ratings yet scores above poor ratings", order(ranked) == ["newcomer", "bad"], ranked)

one = bf.rank([applicant("a", similarity=0.60, resume_skills=skills, reply=30)], skills)[0]
check("fit is 0-100", 0 <= one["fit"] <= 100 and isinstance(one["fit"], int), one)
check("reasons: resume match, skills 3 of 3, fast reply",
      one["resume_match"] and one["skills_total"] == 3 and len(one["skills_matched"]) == 3 and one["fast_reply"], one)
check("the score itself is not sent", "score" not in one)

no_skills = bf.score_applicant(applicant("a", similarity=0.60), [])
with_skills = bf.score_applicant(applicant("a", similarity=0.60), skills)
check("a job without required skills gives that share to the resume", no_skills["fit"] > with_skills["fit"], (no_skills["fit"], with_skills["fit"]))
check("an unreadable resume says so and still gets a middle score",
      bf.score_applicant(applicant("a", read="unreadable"), [])["read"] == "unreadable")

# ---------------------------------------------------------------------------
print("\nPart 2: the real AI model on the made-up resumes")
# ---------------------------------------------------------------------------

JOBS = [
    ("designer", {"title": "Logo for my milk tea shop", "category": "graphic-design",
                  "description": "I need a logo and packaging label design for my new milk tea shop in Cebu. Must look modern and fit cups and stickers."}),
    ("video_editor", {"title": "Edit my YouTube vlogs", "category": "video-editing",
                      "description": "Looking for a video editor to cut and edit weekly travel vlogs, add captions, music and simple motion graphics."}),
    ("developer", {"title": "Website for my small business", "category": "web-development",
                   "description": "Build a responsive website with a booking form and admin page. React or similar, connected to a database."}),
    ("virtual_assistant", {"title": "Virtual assistant for online store", "category": "virtual-assistance",
                           "description": "Answer customer emails and chats, process orders, update the product spreadsheet and schedule posts."}),
    ("accountant", {"title": "Bookkeeping for small business", "category": "accounting",
                    "description": "Monthly bookkeeping, record sales and expenses, prepare BIR tax filings and simple financial reports."}),
    ("tutor", {"title": "Math tutor for Grade 5", "category": "tutoring",
               "description": "Online tutor for my Grade 5 child, math and English lessons three times a week, with homework help."}),
]
resumes = {**samples.A_RESUMES, **samples.B_RESUMES}
vectors = {name: bf.meaning_of(text) for name, text in resumes.items()}
for right, job in JOBS:
    job_vector = bf.embed_texts([bf.post_text(job)])[0]
    applicants = [
        applicant(name, similarity=float(vectors[name] @ job_vector), resume_skills=bf.skills_in_text(text))
        for name, text in resumes.items() if vectors[name] is not None
    ]
    ranked = bf.rank(applicants, [])
    check(f"{job['title']}: the {right} resume is ranked #1 of {len(ranked)}", ranked[0]["application_id"] == right,
          order(ranked)[:3])

check("too little text can't be compared", bf.meaning_of("Juan Dela Cruz resume") is None)

# ---------------------------------------------------------------------------
print("\nPart 3: the whole thing, against a pretend database")
# ---------------------------------------------------------------------------


class Result:
    def __init__(self, data):
        self.data = data


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.row = db, table, [], None

    def select(self, *_):
        return self

    def eq(self, column, value):
        self.filters.append(lambda r: r.get(column) == value)
        return self

    def in_(self, column, values):
        self.filters.append(lambda r: r.get(column) in values)
        return self

    def limit(self, _):
        return self

    def upsert(self, row, on_conflict):
        allowed = {"application_id", "embedding", "skills", "read_ok"}
        assert set(row) <= allowed, f"application_fit has no column {set(row) - allowed}"
        self.row = row
        return self

    def execute(self):
        rows = self.db.tables[self.table]
        if self.row is not None:
            rows[:] = [r for r in rows if r["application_id"] != self.row["application_id"]] + [dict(self.row)]
            return Result([self.row])
        return Result([dict(r) for r in rows if all(f(r) for f in self.filters)])


class Storage:
    def __init__(self, db):
        self.db = db

    def from_(self, bucket):
        assert bucket == "resumes"
        return self

    def download(self, path):
        self.db.downloads.append(path)
        return self.db.files[path]


class FakeSupabase:
    def __init__(self):
        self.tables = {"job_posts": [], "application_fit": []}
        self.records = []
        self.files = {}
        self.downloads = []
        self.storage = Storage(self)

    def table(self, name):
        return Query(self, name)

    def rpc(self, name, args):
        assert name == "applicant_records" and "target_job" in args
        return _RpcResult(self.records)


class _RpcResult:
    def __init__(self, rows):
        self.rows = rows

    def execute(self):
        return Result([dict(r) for r in self.rows])


# The pretend files hold the resume's text; read_text is swapped for one that
# just decodes it (Part 2 already used the real model; reading real PDFs is
# resume_check's own tests' job).
bf.read_text = lambda data: ("pdf", data.decode("utf-8"), None)

db = FakeSupabase()
db.tables["job_posts"].append({"id": "job1", "client_id": "client1", "title": "Logo for my milk tea shop",
                               "category": "graphic-design", "skills": ["Logo Design"],
                               "description": "I need a logo and packaging label design for my new milk tea shop in Cebu."})


def record(app_id, freelancer, applied, path, **extra):
    return {"application_id": app_id, "freelancer_id": freelancer, "resume_path": path, "applied_at": applied,
            "profile_skills": [], "completed_count": 0, "rating_count": 0, "avg_stars": None, "reply_minutes": None, **extra}


db.records = [
    record("a-video", "f1", "2026-11-01T00:00:00+00:00", "f1/video.pdf"),
    record("a-design", "f2", "2026-11-03T00:00:00+00:00", "f2/design.pdf"),
    record("a-blank", "f3", "2026-11-04T00:00:00+00:00", "f3/blank.pdf"),
]
db.files = {
    "f1/video.pdf": resumes["video_editor"].encode(),
    "f2/design.pdf": resumes["designer"].encode(),
    "f3/blank.pdf": b"just a name",
}

try:
    bf.best_fit(db, "someone-else", "job1")
    check("someone who didn't post the job is refused", False)
except bf.NotYourJob:
    check("someone who didn't post the job is refused", True)
try:
    bf.best_fit(db, "client1", "no-such-job")
    check("a job that doesn't exist is refused", False)
except bf.NotYourJob:
    check("a job that doesn't exist is refused", True)

answer = bf.best_fit(db, "client1", "job1")
ids = [r["application_id"] for r in answer["results"]]
check("the designer is ranked first for a logo job, though the video editor applied first", ids[0] == "a-design", ids)
check("everyone is in the list", sorted(ids) == ["a-blank", "a-design", "a-video"], ids)
check("nothing is still waiting to be read", answer["pending"] == 0, answer["pending"])
blank = next(r for r in answer["results"] if r["application_id"] == "a-blank")
check("a file with too little text is marked unreadable", blank["read"] == "unreadable", blank)
design = answer["results"][0]
check("the designer's resume matches and has the Logo Design skill",
      design["resume_match"] and design["skills_matched"] == ["Logo Design"], design)
saved = db.tables["application_fit"]
check("three resumes remembered", len(saved) == 3, len(saved))
check("only numbers and skill names are saved, not the resume's text",
      all(set(r) == {"application_id", "embedding", "skills", "read_ok"} for r in saved)
      and not any("MARIA" in str(r) for r in saved))

downloads_before = len(db.downloads)
again = bf.best_fit(db, "client1", "job1")
check("the second time no resume is downloaded again", len(db.downloads) == downloads_before, db.downloads)
check("and the order is the same", [r["application_id"] for r in again["results"]] == ids)

# Out of time: the rest wait for the next request (and get the middle score).
db.tables["application_fit"].clear()
bf.READ_SECONDS = -1
waiting = bf.best_fit(db, "client1", "job1")
check("out of time: resumes not read yet are counted as pending", waiting["pending"] == 3, waiting["pending"])
check("and are still listed, first applied first",
      [r["application_id"] for r in waiting["results"]] == ["a-video", "a-design", "a-blank"], waiting["results"])
bf.READ_SECONDS = 20

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
