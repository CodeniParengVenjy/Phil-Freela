"""Checks the ranking math in recommendations.py (Feature 1, the ranking /
scoring algorithm of the Hybrid recommendation system). No database and no AI
model is used. From the ai-service folder, run:

    python test_ranking.py

(the service's own virtual environment is fine). Every check prints PASS or
FAIL, and the script exits with 1 if any check failed.
"""

import sys
from datetime import datetime, timedelta, timezone

import recommendations as rec

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok or not detail else f"  -> {detail}"))


def close(a, b, tolerance=0.001):
    return abs(a - b) <= tolerance


def made(days_ago):
    """A created_at the way the database sends it."""
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


def signal(post_id, verified=False, reply_minutes=None, days_old=90, kind="service"):
    """One row of ranking_signals: an old post by default, so "new" adds nothing."""
    return {"post_id": post_id, "kind": kind, "owner_verified": verified, "reply_minutes": reply_minutes, "created_at": made(days_old)}


def record(completed=0, ratings=0, stars=None):
    """One row of ranking_records."""
    return {"completed_count": completed, "rating_count": ratings, "avg_stars": stars}


def rank(signals, records=None, content=None, collaborative=None):
    return rec.score_posts(signals, records or {}, content or {}, collaborative or {})


def order(scored):
    return [r["id"] for r in scored]


def reasons_of(scored, post_id):
    return next(r["reasons"] for r in scored if r["id"] == post_id)


# ---------------------------------------------------------------------------
# The weights
# ---------------------------------------------------------------------------
check("the weights add up to 1", close(sum(rec.WEIGHTS.values()), 1.0, 1e-9), str(sum(rec.WEIGHTS.values())))
paper_four = rec.WEIGHTS["relevance"] + rec.WEIGHTS["rating"] + rec.WEIGHTS["completed"] + rec.WEIGHTS["response"]
check("the paper's four factors (relevance, rating, completed projects, response time) add up to 0.65", close(paper_four, 0.65, 1e-9), str(paper_four))
check("relevance is still the biggest single weight", rec.WEIGHTS["relevance"] == max(rec.WEIGHTS.values()))

# ---------------------------------------------------------------------------
# The rating score
# ---------------------------------------------------------------------------
check("no ratings is neutral: 0.5", rec.rating_score(None, 0) == 0.5 and rec.rating_score(4.9, 0) == 0.5)
check("one 5-star rating gives 0.63", close(rec.rating_score(5, 1), 0.625), str(rec.rating_score(5, 1)))
check("five 5-star ratings give 0.81", close(rec.rating_score(5, 5), 0.8125), str(rec.rating_score(5, 5)))
check("twenty ratings averaging 4.8 give 0.89", close(rec.rating_score(4.8, 20), 0.891), str(rec.rating_score(4.8, 20)))
check("two 1-star ratings give 0.30 (bad ratings count against you)", close(rec.rating_score(1, 2), 0.3), str(rec.rating_score(1, 2)))
check("more 5-star ratings are worth more (1 < 5 < 20)", rec.rating_score(5, 1) < rec.rating_score(5, 5) < rec.rating_score(5, 20))
check("an average that arrives as text is read too", close(rec.rating_score("4.5", 3), rec.rating_score(4.5, 3)))
check("the rating score stays between 0 and 1", all(0 <= rec.rating_score(s, n) <= 1 for s in (1, 2.5, 5) for n in (0, 1, 3, 100)))

# ---------------------------------------------------------------------------
# The completed-projects score
# ---------------------------------------------------------------------------
check("completed projects: none 0, five 0.5, ten or more 1",
      rec.completed_score(0) == 0 and rec.completed_score(None) == 0 and close(rec.completed_score(5), 0.5) and rec.completed_score(10) == 1 and rec.completed_score(25) == 1)

# ---------------------------------------------------------------------------
# Ranking: made-up posts, everything else equal
# ---------------------------------------------------------------------------
same_match = {"a": 0.5, "b": 0.5}

scored = rank([signal("a"), signal("b")], {"b": record(completed=6, ratings=5, stars=5.0)}, same_match)
check("a well-rated, experienced owner ranks above an owner with no record (same relevance)", order(scored) == ["b", "a"], str(order(scored)))

scored = rank([signal("a"), signal("c")], {"c": record(completed=0, ratings=3, stars=1.5)}, same_match | {"c": 0.5})
check("a bad record ranks below no record at all", order(scored) == ["a", "c"], str(order(scored)))

scored = rank([signal("x"), signal("y")],
              {"x": record(completed=1, ratings=1, stars=5.0), "y": record(completed=15, ratings=20, stars=4.7)},
              {"x": 0.5, "y": 0.5})
check("one 5-star rating doesn't beat a long good record", order(scored) == ["y", "x"], str(order(scored)))

scored = rank([signal("p"), signal("q")], {"p": record(completed=3, ratings=3, stars=4.0), "q": record(completed=3, ratings=3, stars=4.0)}, {"p": 0.8, "q": 0.3})
check("with equal records, the better match ranks first", order(scored) == ["p", "q"], str(order(scored)))

scored = rank([signal("clear"), signal("unrelated")],
              {"unrelated": record(completed=5, ratings=5, stars=4.5)},
              {"clear": 0.8, "unrelated": 0.2})
check("a clearly better match with no record still beats an unrelated post with a decent record", order(scored) == ["clear", "unrelated"], str([(r["id"], r["score"]) for r in scored]))

scored = rank([signal("known"), signal("newcomer")], {"known": record(completed=2, ratings=2, stars=4.0)}, {"known": 0.5, "newcomer": 0.5})
check("a post with no record row at all is scored without a problem", len(scored) == 2 and all(0 <= r["score"] <= 1 for r in scored))

scored = rank([signal("verified", verified=True), signal("plain")], {}, {"verified": 0.5, "plain": 0.5})
check("a verified owner ranks above an unverified one (everything else equal)", order(scored) == ["verified", "plain"])

scored = rank([signal("fast", reply_minutes=20), signal("slow", reply_minutes=3000)], {}, {"fast": 0.5, "slow": 0.5})
check("a fast replier ranks above a slow one (everything else equal)", order(scored) == ["fast", "slow"])

# ---------------------------------------------------------------------------
# The result and its reasons
# ---------------------------------------------------------------------------
scored = rank([signal("lo"), signal("hi", days_old=1)], {"hi": record(completed=1, ratings=1, stars=5.0)}, {"lo": 0.1, "hi": 0.9})
check("results are best first, with a type, an id, a score and reasons",
      scored[0]["id"] == "hi" and scored[0]["score"] >= scored[1]["score"] and set(scored[0]) == {"type", "id", "score", "reasons"} and scored[0]["type"] == "service")

perfect = rank([signal("perfect", verified=True, reply_minutes=5, days_old=0)],
               {"perfect": record(completed=50, ratings=100, stars=5.0)}, {"perfect": 1.0}, {"perfect": 1.0})[0]
check("even a perfect post scores at most 1", 0.95 <= perfect["score"] <= 1.0, str(perfect["score"]))

def rated(ratings, stars):
    return "rated" in reasons_of(rank([signal("z")], {"z": record(ratings=ratings, stars=stars, completed=1)}), "z")

check("Highly rated: 3 or more ratings averaging 4.5 or more",
      rated(3, 4.5) and rated(10, 4.6) and not rated(2, 5.0) and not rated(3, 4.4) and not rated(0, None))

def experienced(completed):
    return "experienced" in reasons_of(rank([signal("z")], {"z": record(completed=completed)}), "z")

check("Experienced: 5 or more completed projects", experienced(5) and experienced(12) and not experienced(4) and not experienced(0))
check("Matches: relevance 0.40 or more", "match" in reasons_of(rank([signal("z")], {}, {"z": 0.40}), "z") and "match" not in reasons_of(rank([signal("z")], {}, {"z": 0.39}), "z"))
check("Similar users: any collaborative score", "similar_users" in reasons_of(rank([signal("z")], {}, {}, {"z": 0.2}), "z") and "similar_users" not in reasons_of(rank([signal("z")]), "z"))
check("Verified, fast reply and new each show up when they apply",
      reasons_of(rank([signal("z", verified=True, reply_minutes=60, days_old=3)]), "z") == ["verified", "fast_reply", "new"],
      str(reasons_of(rank([signal("z", verified=True, reply_minutes=60, days_old=3)]), "z")))
check("no reasons for an old, plain post with no record", reasons_of(rank([signal("z")]), "z") == [])
everything = reasons_of(
    rank([signal("z", verified=True, reply_minutes=10, days_old=1)], {"z": record(completed=9, ratings=8, stars=4.9)}, {"z": 0.7}, {"z": 0.5}), "z")
check("reasons come in a steady order", everything == ["match", "similar_users", "rated", "experienced", "verified", "fast_reply", "new"], str(everything))

# ---------------------------------------------------------------------------
# recommend(): the whole flow, with a fake database client
# ---------------------------------------------------------------------------
import logging
import types


class FakeQuery:
    """Stands in for one Supabase request: every filter returns itself."""

    def __init__(self, data=None, error=None):
        self.data, self.error = data, error

    def execute(self):
        if self.error:
            raise self.error
        return types.SimpleNamespace(data=self.data)

    def __getattr__(self, name):  # select, eq, neq, order, limit, single, ...
        return lambda *args, **kwargs: self


class FakeSupabase:
    def __init__(self, rpcs, fail=()):
        self.rpcs, self.fail, self.calls = rpcs, set(fail), []

    def table(self, name):
        return FakeQuery({"account_type": "client"} if name == "profiles" else [])

    def rpc(self, name, args=None):
        self.calls.append((name, args))
        if name in self.fail:
            return FakeQuery(error=RuntimeError(f"{name} is not there"))
        return FakeQuery(self.rpcs.get(name, []))


rec.catch_up = lambda supabase: None  # no AI model in this test
rec.catch_up_profiles = lambda supabase: None
rpcs = {
    "content_candidates": [{"post_id": "p1", "similarity": 0.60}, {"post_id": "p2", "similarity": 0.60}, {"post_id": "p3", "similarity": 0.50}],
    "ranking_signals": [
        {"post_id": pid, "kind": "service", "owner_id": "o" + pid, "owner_verified": False, "reply_minutes": None, "created_at": made(90)}
        for pid in ("p1", "p2", "p3")
    ],
    "ranking_records": [{"post_id": "p2", "completed_count": 8, "rating_count": 6, "avg_stars": 4.9}],
}

fake = FakeSupabase(rpcs)
answer = rec.recommend(fake, "some-user")
check("recommend(): asks for the owners' records and puts the credible owner first among equal matches",
      ("ranking_records", {"post_ids": ["p1", "p2", "p3"]}) in fake.calls and [r["id"] for r in answer["results"]] == ["p2", "p1", "p3"] and answer["personalized"] is True,
      str([r["id"] for r in answer["results"]]))
check("recommend(): the credible owner's post shows Highly rated and Experienced", answer["results"][0]["reasons"][:3] == ["match", "rated", "experienced"], str(answer["results"][0]["reasons"]))

logging.disable(logging.CRITICAL)  # the failure below is logged on purpose; keep the output tidy
broken = FakeSupabase(rpcs, fail=["ranking_records"])
try:
    fallback = rec.recommend(broken, "some-user")
    survived = True
except Exception as error:  # pragma: no cover - this is what the check looks for
    fallback, survived = None, False
    print("   ", repr(error))
logging.disable(logging.NOTSET)
check("recommend(): if the records can't be read (the SQL isn't run yet), the ranking still works without them",
      survived and [r["id"] for r in fallback["results"]] == ["p1", "p2", "p3"] and all("rated" not in r["reasons"] for r in fallback["results"]),
      str(None if not survived else [r["id"] for r in fallback["results"]]))
check("recommend(): with no candidates and no recent posts it returns an empty list",
      rec.recommend(FakeSupabase({}), "some-user") == {"personalized": False, "results": []})

# ---------------------------------------------------------------------------
print()
failed = results.count(False)
print(f"{len(results) - failed}/{len(results)} passed")
sys.exit(1 if failed else 0)
