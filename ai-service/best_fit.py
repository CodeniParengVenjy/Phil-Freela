"""Best fit applicants: ranks the freelancers who applied to ONE job post, best
first, for the client who posted it. Part of PhilFreela's Hybrid
recommendation system (feature 1 in PhilFreela-System-Functions.md):

- content-based filtering: each applicant's resume is compared with the job
  post by meaning (the pretrained all-MiniLM-L6-v2 model, text_embedder.py),
  and the job's required skills are looked for in the resume and on the
  freelancer's profile (the skill itself, or one of the same kind of work);
- the ranking/scoring algorithm: their rating, completed projects and how fast
  they reply (the same helpers as recommendations.py).

Why (the user, 2026-11-10): applicants were listed newest first ("last in,
first out"), which is unfair to the ones who applied early, and a client with
many applicants should see the most effective, best-matched freelancers first.

Each resume is read only once and remembered in the application_fit table
(database/supabase_best_fit_schema.sql, Section 2):
1. its words: resume_check.read_text (a PDF or Word file's text, or a picture
   or scanned PDF read by the text reader);
2. its meaning: the text is cut into parts of about 80 words, each part gets
   its 384 meaning numbers, and they are averaged (so a long resume is not cut
   off at the model's limit of about 256 word pieces);
3. its skills: skills.skills_in_text (the same list of 348 skills as job posts).
Only the meaning numbers and the skill names are saved, never the resume's
text (Data Privacy Act, RA 10173).
"""

import json
import logging
import time

import numpy as np

from listing_search import post_text, vector_text
from recommendations import completed_score, rating_score, response_score
from resume_check import read_text
from skills import match_skill, skills_in_text
from skills_list import SKILLS
from text_embedder import embed_texts

log = logging.getLogger("best_fit")

# How much each part counts (they add up to 1). Judgment calls, not trained:
# PhilFreela has no hiring history to learn from. What the resume says about
# THIS job counts most; the record (stars, finished projects, reply speed)
# decides between similar resumes. A job post without required skills gives
# the skills share to the resume.
WEIGHTS = {
    "resume": 0.40,  # how close the resume's meaning is to the job post
    "skills": 0.20,  # the share of the job's required skills the freelancer has
    "rating": 0.20,  # their stars from finished projects (smoothed)
    "completed": 0.10,  # how many projects they finished
    "response": 0.10,  # how fast they usually reply in chats
}

# Turning the resume-to-job closeness (cosine similarity, -1..1) into 0..1.
# Measured on the made-up resumes in resume_samples.py against 8 made-up job
# posts (2026-11-10): the right resume scored 0.39-0.64 and was first for all
# 8, the closest wrong one 0.26-0.38, a typical unrelated one about 0.15.
# So 0.15 or less gives 0 and 0.55 or more gives the full score.
SIMILARITY_ZERO = 0.15
SIMILARITY_FULL = 0.55
# Closeness needed for the "Resume matches the job" reason.
MATCH_REASON = 0.38
# A resume the AI couldn't read (or hasn't read yet) gets this middle score,
# not 0: the freelancer shouldn't lose points because a picture was blurry.
UNKNOWN_RESUME = 0.5

# Required skills (the user, 2026-11-10: a designer with Graphic Design, Canva and
# Photoshop got "0 of 2 skills" on a job asking for "Invitation Design"):
# - the freelancer has the skill itself (any spelling): it counts fully;
# - they have another skill of the SAME KIND OF WORK (its category in
#   skills_list.py, the site's own categories): it counts half. A skill the
#   client typed that isn't on the list takes the job post's category.
# Comparing the short skill names by meaning was tried first and dropped: the
# model put "Invitation Design" and "Graphic Design" at only 0.26, below
# unrelated pairs such as "Graphic Design" and "Video Editing" (0.39).
RELATED_CREDIT = 0.5
# Each known skill's kind of work. "other" is a mixed group, so it never makes
# two skills related.
KIND_OF = {name.lower(): category for name, category, _ in SKILLS if category != "other"}

PART_WORDS = 80  # words per part of a resume
MAX_PARTS = 10  # only the first 800 words count (a resume is 1-3 pages)
MIN_WORDS = 15  # fewer words than this can't be compared
FAST_REPLY_MINUTES = 60

# Reading a resume the first time takes from a moment (a PDF or Word file) to a
# few seconds (a picture is read by the text reader). One request reads for at
# most this long; the rest are read on the next request (the website asks
# again), so the client is never left waiting a minute.
READ_SECONDS = 20


class NotYourJob(Exception):
    """The job post doesn't exist, or the person asking didn't post it."""


# ---------------------------------------------------------------------------
# 1. Reading a resume (once)
# ---------------------------------------------------------------------------

def meaning_of(text):
    """The average meaning numbers of a text's parts (length 1), or None when
    there are too few words to compare."""
    words = text.split()
    if len(words) < MIN_WORDS:
        return None
    parts = [" ".join(words[i:i + PART_WORDS]) for i in range(0, len(words), PART_WORDS)][:MAX_PARTS]
    mean = embed_texts(parts).mean(axis=0)
    return mean / np.linalg.norm(mean)


def read_resume(data):
    """(meaning numbers or None, skill names, read_ok) for a resume file."""
    try:
        _, text, _ = read_text(data)
    except Exception:  # an unreadable, locked or broken file
        log.info("A resume couldn't be read", exc_info=True)
        return None, [], False
    vector = meaning_of(text)
    if vector is None:
        return None, [], False
    return vector, skills_in_text(text), True


# ---------------------------------------------------------------------------
# 2. The math (no database, no AI model: test_best_fit.py checks it)
# ---------------------------------------------------------------------------

def resume_score(similarity):
    """Resume-to-job closeness -> 0..1 (None = unknown: the middle score)."""
    if similarity is None:
        return UNKNOWN_RESUME
    return max(0.0, min(1.0, (similarity - SIMILARITY_ZERO) / (SIMILARITY_FULL - SIMILARITY_ZERO)))


def standard(skill):
    """A skill's standard name ("photoshop" -> "Adobe Photoshop"), lower case,
    so the job's, the profile's and the resume's skills can be compared."""
    return (match_skill(skill) or skill).strip().lower()


def skill_matches(job_skills, job_category, resume_skills, profile_skills):
    """Which of the job's required skills (as the client wrote them) the
    freelancer has, from their resume and their profile:
    (exact, related), where exact is a list of job skills they have, and
    related is a list of (job skill, their skill of the same kind of work)."""
    theirs = list(resume_skills) + list(profile_skills or [])
    have = {standard(s) for s in theirs}
    # The first of their skills for each kind of work (by its standard name).
    kinds = {}
    for skill in theirs:
        kind = KIND_OF.get(standard(skill))
        if kind and kind not in kinds:
            kinds[kind] = match_skill(skill) or skill

    exact, related = [], []
    for skill in job_skills:
        if standard(skill) in have:
            exact.append(skill)
        else:
            kind = KIND_OF.get(standard(skill), job_category if job_category != "other" else None)
            if kind in kinds:
                related.append((skill, kinds[kind]))
    return exact, related


def score_applicant(applicant, job_skills, job_category=None):
    """One applicant's score (0..1) and what the website shows about it.

    applicant: a row of applicant_records plus "similarity" (resume to job,
    None if unknown), "resume_skills" and "read" ("ok", "unreadable" or
    "pending")."""
    weights = dict(WEIGHTS)
    if not job_skills:
        weights["resume"] += weights.pop("skills")

    exact, related = skill_matches(job_skills, job_category, applicant.get("resume_skills") or [], applicant.get("profile_skills"))
    # Shown in the "Has 2 of 3 skills" hint: a related one says what it is.
    matched = exact + [f"{skill} (related: {theirs})" for skill, theirs in related]
    stars = applicant.get("avg_stars")
    stars = float(stars) if stars is not None else None
    ratings = applicant.get("rating_count") or 0
    completed = applicant.get("completed_count") or 0
    reply = applicant.get("reply_minutes")

    factors = {
        "resume": resume_score(applicant.get("similarity")),
        "skills": (len(exact) + RELATED_CREDIT * len(related)) / len(job_skills) if job_skills else 0.0,
        "rating": rating_score(stars, ratings),
        "completed": completed_score(completed),
        "response": response_score(reply),
    }
    score = sum(weights[name] * factors[name] for name in weights)
    similarity = applicant.get("similarity")
    return {
        "application_id": applicant["application_id"],
        "score": score,
        "fit": round(score * 100),
        "read": applicant.get("read", "ok"),
        "resume_match": similarity is not None and similarity >= MATCH_REASON,
        "skills_matched": matched,
        "skills_related": len(related),
        "skills_total": len(job_skills),
        "rating_count": ratings,
        "avg_stars": round(stars, 1) if stars is not None else None,
        "completed": completed,
        "fast_reply": reply is not None and reply <= FAST_REPLY_MINUTES,
        "applied_at": applicant["applied_at"],
    }


def rank(applicants, job_skills, job_category=None):
    """Everyone scored, best first. Two equal scores (to 3 decimals): whoever
    applied first goes first, so applying early still counts."""
    scored = [score_applicant(a, job_skills, job_category) for a in applicants]
    scored.sort(key=lambda s: (-round(s["score"], 3), s["applied_at"]))
    for s in scored:
        del s["score"]
    return scored


# ---------------------------------------------------------------------------
# 3. Putting it together for one job post
# ---------------------------------------------------------------------------

def _numbers(value):
    """A vector column as the web API sends it ("[0.1,...]") -> numbers."""
    if value is None:
        return None
    return np.array(json.loads(value) if isinstance(value, str) else value, dtype=np.float32)


def best_fit(supabase, user_id, job_id):
    """{"results": [...best first], "pending": how many resumes are still to be
    read}. Only the client who posted the job may ask (else NotYourJob)."""
    job = (
        supabase.table("job_posts").select("id, client_id, title, category, description, skills")
        .eq("id", job_id).limit(1).execute().data
    )
    if not job or job[0]["client_id"] != user_id:
        raise NotYourJob()
    job = job[0]
    job_skills = job.get("skills") or []

    applicants = supabase.rpc("applicant_records", {"target_job": job_id}).execute().data or []
    if not applicants:
        return {"results": [], "pending": 0}

    ids = [a["application_id"] for a in applicants]
    saved = {
        row["application_id"]: row
        for row in supabase.table("application_fit").select("application_id, embedding, skills, read_ok")
        .in_("application_id", ids).execute().data or []
    }

    # Read the resumes not read before, first applied first, until time runs out.
    started = time.monotonic()
    for a in applicants:
        if a["application_id"] in saved or time.monotonic() - started > READ_SECONDS:
            continue
        try:
            data = supabase.storage.from_("resumes").download(a["resume_path"])
        except Exception:
            log.warning("Couldn't download a resume", exc_info=True)
            continue  # tried again next time
        vector, skills, ok = read_resume(data)
        row = {
            "application_id": a["application_id"],
            "embedding": vector_text(vector) if vector is not None else None,
            "skills": skills,
            "read_ok": ok,
        }
        supabase.table("application_fit").upsert(row, on_conflict="application_id").execute()
        saved[a["application_id"]] = row

    job_vector = embed_texts([post_text(job) + (". Skills: " + ", ".join(job_skills) if job_skills else "")])[0]
    pending = 0
    for a in applicants:
        row = saved.get(a["application_id"])
        vector = _numbers(row["embedding"]) if row else None
        a["similarity"] = float(vector @ job_vector) if vector is not None else None
        a["resume_skills"] = row["skills"] if row else []
        a["read"] = "pending" if not row else ("ok" if row["read_ok"] else "unreadable")
        pending += a["read"] == "pending"

    return {"results": rank(applicants, job_skills, job.get("category")), "pending": pending}
