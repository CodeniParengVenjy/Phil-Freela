""""Recommended for you": PhilFreela's Hybrid recommendation system (feature 1
in PhilFreela-System-Functions.md), which combines three methods:

1. Content-based filtering: the user's "taste" (the average meaning numbers of
   their profile description, their own posts and the jobs they applied to,
   from the pretrained all-MiniLM-L6-v2 model) is compared with every post of
   the other kind. Works for new users as soon as they write a description.
2. Collaborative filtering (user-based): users whose choices overlap with this
   user's (Jaccard similarity over who they messaged and which jobs they
   applied to) suggest the posts they chose that this user hasn't.
3. Ranking: every candidate from 1 and 2 gets one score from the weights
   below, and the best ones are shown with the reasons they were picked.

The database does the searching (database/supabase_recommendations_schema.sql);
this file only scores. Freelancers get job posts, clients get services.
"""

import logging
import re
from datetime import datetime, timezone

from listing_search import catch_up, vector_text
from text_embedder import embed_texts

log = logging.getLogger("recommendations")

# How much each factor counts (they add up to 1). Ratings and completed
# projects are in the paper too, but PhilFreela doesn't have them yet
# (feature 5); they'll take part of these weights once it does.
WEIGHTS = {
    "relevance": 0.40,  # content-based: how close the post is to the user's taste
    "collaborative": 0.25,  # how many similar users chose it
    "response": 0.15,  # how fast the post's owner usually replies
    "verified": 0.10,  # the owner's identity is verified (eKYC)
    "new": 0.10,  # a recent post
}

SHOW = 8  # recommendations shown
SEND = 16  # sent to the website: some may be hidden from this viewer
RECENT = 30  # recent posts added when there aren't enough candidates
# Relevance needed for the "Matches your ..." reason. Chosen from tests:
# related posts scored 0.43-0.78 against a user's taste, unrelated ones
# 0.18-0.25 (whole posts compared with each other score higher than a few
# typed words, hence lower than the search box's cut-offs).
MATCH_REASON = 0.40
EMBED_BATCH = 32


def response_score(minutes):
    """The owner's typical wait before replying -> 0..1 (no chats yet: 0.5)."""
    if minutes is None:
        return 0.5
    if minutes <= 60:
        return 1.0
    if minutes <= 24 * 60:
        return 0.6
    return 0.2


def new_score(created_at):
    """1 for the first 7 days, fading to 0 by 60 days."""
    # The database sends 1-6 digits of fractions of a second; older Python
    # versions only read exactly 6.
    text = re.sub(r"\.(\d+)", lambda m: "." + m.group(1).ljust(6, "0")[:6], created_at)
    days = (datetime.now(timezone.utc) - datetime.fromisoformat(text)).total_seconds() / 86400
    return max(0.0, min(1.0, (60 - days) / 53))


def catch_up_profiles(supabase):
    """Gives new or changed profile descriptions their meaning numbers."""
    rows = supabase.rpc("profiles_to_embed", {"max_rows": 200}).execute().data or []
    now = datetime.now(timezone.utc).isoformat()
    for start in range(0, len(rows), EMBED_BATCH):
        batch = rows[start:start + EMBED_BATCH]
        vectors = embed_texts([r["description"] for r in batch])
        supabase.table("profile_embeddings").upsert([
            {"profile_id": r["profile_id"], "embedding": vector_text(v), "text_hash": r["text_hash"], "updated_at": now}
            for r, v in zip(batch, vectors)
        ], on_conflict="profile_id").execute()


def recent_posts(supabase, user_id, want, skip):
    """The newest posts of the wanted kind (not the user's own): used when a
    new user has too few personal candidates."""
    if want == "jobs":
        rows = supabase.table("job_posts").select("id").neq("client_id", user_id).order("created_at", desc=True).limit(RECENT).execute().data
    else:
        rows = supabase.table("services").select("id").neq("freelancer_id", user_id).order("created_at", desc=True).limit(RECENT).execute().data
    return [r["id"] for r in rows or [] if r["id"] not in skip]


def recommend(supabase, user_id):
    """Returns {"personalized": bool, "results": [{"type", "id", "score",
    "reasons"}]}, best first. Reasons: match, similar_users, verified,
    fast_reply, new (the website words them)."""
    profile = supabase.table("profiles").select("account_type").eq("id", user_id).single().execute().data
    want = "jobs" if profile["account_type"] == "freelancer" else "services"

    # Make sure every post and profile description has its numbers.
    for step in (catch_up, catch_up_profiles):
        try:
            step(supabase)
        except Exception:
            log.exception("Couldn't update the meaning numbers")

    args = {"target_user": user_id, "want": want, "how_many": 100}
    content = {r["post_id"]: r["similarity"] for r in supabase.rpc("content_candidates", args).execute().data or []}
    collab_rows = supabase.rpc("collaborative_candidates", args).execute().data or []
    top = max((r["score"] for r in collab_rows), default=0) or 1
    collaborative = {r["post_id"]: r["score"] / top for r in collab_rows}  # 0..1

    candidates = list(dict.fromkeys([*content, *collaborative]))
    personalized = bool(candidates)
    if len(candidates) < SEND:
        acted_on = {
            r["post_id"] for r in
            supabase.rpc("recommendation_interactions", {"want": want}).eq("user_id", user_id).execute().data or []
        }
        candidates += [p for p in recent_posts(supabase, user_id, want, acted_on) if p not in candidates]
    if not candidates:
        return {"personalized": False, "results": []}

    scored = []
    for s in supabase.rpc("ranking_signals", {"post_ids": candidates}).execute().data or []:
        factors = {
            "relevance": content.get(s["post_id"], 0.0),
            "collaborative": collaborative.get(s["post_id"], 0.0),
            "response": response_score(s["reply_minutes"]),
            "verified": 1.0 if s["owner_verified"] else 0.0,
            "new": new_score(s["created_at"]),
        }
        score = sum(WEIGHTS[name] * value for name, value in factors.items())

        reasons = []
        if factors["relevance"] >= MATCH_REASON:
            reasons.append("match")
        if factors["collaborative"] > 0:
            reasons.append("similar_users")
        if s["owner_verified"]:
            reasons.append("verified")
        if s["reply_minutes"] is not None and s["reply_minutes"] <= 60:
            reasons.append("fast_reply")
        if factors["new"] >= 1.0:
            reasons.append("new")

        scored.append({"type": s["kind"], "id": s["post_id"], "score": round(score, 3), "reasons": reasons})

    scored.sort(key=lambda r: r["score"], reverse=True)
    return {"personalized": personalized, "results": scored[:SEND]}
