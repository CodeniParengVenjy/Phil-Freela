"""The AI search box: the content-based filtering part of PhilFreela's Hybrid
recommendation system (feature 1 in PhilFreela-System-Functions.md). It
finds services and job posts by what they mean, not only by the exact words
typed: "logo" also finds "brand identity design".

How it works:
1. Each post's text (title, category name, skill, description) is turned into
   384 numbers by the pretrained all-MiniLM-L6-v2 model (text_embedder.py,
   shared with the documents copy check; nothing is trained). Posts with a
   similar meaning get similar numbers. They're saved in the
   listing_embeddings table (pgvector, database/supabase_search_schema.sql).
2. A search turns the typed words into numbers the same way, and the database
   returns the posts whose numbers are closest (cosine similarity).
3. Before each search, new or changed posts get their numbers first, so
   nothing has to happen when a post is saved.

The same numbers are meant to feed the rest of the hybrid system later
(collaborative filtering and the ranking formula).
"""

import logging
from datetime import datetime, timezone

from text_embedder import embed_texts

log = logging.getLogger("listing_search")

# The names shown for each category (same list as client/src/lib/categories.js).
# They carry meaning the stored values don't, e.g. "Poster/Logo".
CATEGORY_NAMES = {
    "video-editing": "Video Editing & Motion Graphics",
    "graphic-design": "Graphic Design & Poster/Logo",
    "web-development": "Web Development & React Apps",
    "copywriting": "Copywriting & Content Creation",
    "mobile-development": "Mobile App Development",
    "ui-ux-design": "UI/UX & Web Design",
    "digital-marketing": "Digital Marketing & SEO",
    "social-media": "Social Media Management",
    "virtual-assistant": "Virtual Assistant & Admin Support",
    "customer-support": "Customer Support",
    "data-entry": "Data Entry & Research",
    "translation": "Translation & Transcription",
    "photography": "Photography & Photo Editing",
    "audio-music": "Audio, Voiceover & Music",
    "animation-3d": "Animation & 3D Modeling",
    "accounting": "Accounting & Bookkeeping",
    "tutoring": "Online Tutoring & Teaching",
    "other": "Other",
}

# Chosen from tests (40 made-up posts, 22 searches: the right post was in the
# top 3 for all 22). Below 0.32 is left out: unrelated searches such as
# "pizza delivery" stayed at or under 0.30, while about 90% of right answers
# scored higher. 0.50 and up is shown as a strong match.
MIN_SCORE = 0.32
STRONG_SCORE = 0.50
MAX_RESULTS = 30

EMBED_BATCH = 32  # posts turned into numbers at a time
MAX_CATCH_UP = 200  # new or changed posts handled per search (the rest next time)


def post_text(post):
    """The text that describes a post: title, category name, skill, description."""
    category = CATEGORY_NAMES.get(post["category"], (post["category"] or "").replace("-", " "))
    skill = (post.get("skill") or "").replace("-", " ")
    parts = [post["title"], category, skill, post["description"]]
    return ". ".join(part.strip() for part in parts if part and part.strip())


def vector_text(numbers):
    """The numbers in the text form the database's vector type reads."""
    return "[" + ",".join(f"{x:.6f}" for x in numbers) + "]"


def catch_up(supabase):
    """Gives new or changed posts their numbers. Returns how many were done."""
    posts = supabase.rpc("listings_to_embed", {"max_rows": MAX_CATCH_UP}).execute().data or []
    now = datetime.now(timezone.utc).isoformat()
    for start in range(0, len(posts), EMBED_BATCH):
        batch = posts[start:start + EMBED_BATCH]
        vectors = embed_texts([post_text(p) for p in batch])
        rows = {"service": [], "job": []}
        for post, vector in zip(batch, vectors):
            column = "service_id" if post["kind"] == "service" else "job_post_id"
            rows[post["kind"]].append({
                column: post["post_id"],
                "embedding": vector_text(vector),
                "text_hash": post["text_hash"],
                "updated_at": now,
            })
        if rows["service"]:
            supabase.table("listing_embeddings").upsert(rows["service"], on_conflict="service_id").execute()
        if rows["job"]:
            supabase.table("listing_embeddings").upsert(rows["job"], on_conflict="job_post_id").execute()
    return len(posts)


def search_listings(supabase, query):
    """The services and job posts closest in meaning to `query`, best first:
    [{"type": "service" or "job", "id": ..., "score": 0.61, "strong": True}].
    Only ids and scores: the website loads the posts itself, under the normal
    database rules (so hidden posts stay hidden)."""
    try:
        catch_up(supabase)
    except Exception:
        # Searching still works with the numbers already saved.
        log.exception("Couldn't update the search numbers")

    vector = embed_texts([query])[0]
    rows = supabase.rpc("closest_listings", {"query": vector_text(vector), "how_many": MAX_RESULTS}).execute().data or []
    return [
        {"type": row["kind"], "id": row["post_id"], "score": round(row["similarity"], 3), "strong": row["similarity"] >= STRONG_SCORE}
        for row in rows
        if row["similarity"] >= MIN_SCORE
    ]
