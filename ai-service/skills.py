"""Required skills for a job post, handled by the AI (PLAN-posting-job.md, step 3).

The client who posts a job used to type every skill by hand. Now two things
help:

1. suggest_skills(): reads the job's title, category and description and
   suggests the skills it needs ("Logo Design", "Adobe Illustrator"...), which
   the website shows as chips to tap. It uses the same pretrained
   all-MiniLM-L6-v2 model as the search box and "Recommended for you"
   (text_embedder.py; nothing is trained here): the job's text and each skill's
   name are turned into 384 numbers, and texts with a similar meaning get
   similar numbers, even with different words. For every skill in
   skills_list.py:
   - meaning: how close the skill's name is to the job's text (cosine
     similarity of the two sets of numbers);
   - words: the skill (or another way of writing it) is really in the text,
     like "Premiere" or "QuickBooks", which counts extra;
   - category: a skill of the category the client picked counts a little extra.
   The best few are suggested.
2. match_skill(): a skill the client typed is tidied to the standard name when
   it is the same skill written another way or with a typo, so the chips stay
   consistent and one skill isn't listed twice: "photoshop" -> "Adobe
   Photoshop", "vid editng" -> "Video Editing". A skill that isn't in the list
   is left as typed. This one compares spelling, not meaning: in tests the
   model's meaning alone turned "data analytics" into "Google Analytics".

The numbers below were chosen by trying them on made-up job posts
(test_skills.py has them).
"""

import re
from difflib import SequenceMatcher

import numpy as np

from skills_list import SKILLS
from text_embedder import embed_texts

# The names shown for each category (same list as client/src/lib/categories.js).
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

HOW_MANY = 6  # skills suggested at most

# How much each thing adds to a skill's score. Meaning is 0 to 1 (a related
# skill is usually 0.3 to 0.7).
NAME_IN_TEXT = 0.30     # the skill's own name is written in the job text
ALIAS_IN_TEXT = 0.14    # another way of writing it is
SAME_CATEGORY = 0.10    # the skill belongs to the category the client picked

# A skill with no words of its own in the text is only suggested when its
# meaning is at least MIN_MEANING (below that a post is about something we have
# no skill for, e.g. walking a dog) and at least KEEP_SHARE of the best skill's
# (so a long unrelated tail isn't shown).
MIN_MEANING = 0.25
KEEP_SHARE = 0.70

# Too little text to read a job from: a title shorter than this, or a
# description shorter than this, gets no suggestions.
MIN_TITLE_LENGTH = 3
MIN_DESCRIPTION_LENGTH = 10

# Words that mean something else in everyday writing ("any notion", "swift
# reply", "research", "sales"). When one is a skill's name or another way of
# writing it, it only counts when the job is in that skill's own category (a
# skill named by an everyday word is not suggested at all for another category).
EVERYDAY_WORDS = {
    "swift", "unity", "notion", "research", "sales", "editing", "editor", "copy", "resume", "billing",
    "taxes", "audit", "mixing", "mastering", "singer", "vocals", "poster", "banner", "leads", "reels",
    "scheduling", "analytics", "audition", "resolve", "bootstrap", "automation", "consulting",
    "recruiting", "selling", "budgeting", "forecasting", "drafting", "angular", "flask", "graphics",
    "photos", "captions", "subtitles", "escalations", "collections",
}

# A typed skill is a typo of a known one when it is written almost the same
# (this much alike, 0 to 1) and long enough that a few wrong letters can't
# turn it into a different word ("Java" stays "Java").
MATCH_TYPO = 0.86
MIN_TYPO_LENGTH = 5


def _key(text):
    """A skill written in any way, boiled down for comparing: lower case, "&"
    as "and", no dots, dashes or other punctuation, one space between words."""
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9+# ]", "", text)
    return " ".join(text.split())


def _phrase_pattern(term):
    """The term as a whole word or phrase (not inside a longer word)."""
    return re.compile(r"(?<![a-z0-9])" + re.escape(term.lower()) + r"(?![a-z0-9])")


# Everything about the list, worked out once when the service starts.
_NAMES = [s[0] for s in SKILLS]
_CATEGORIES = [s[1] for s in SKILLS]
_KEYS = [[_key(s[0])] + [_key(a) for a in s[2]] for s in SKILLS]   # every way of writing each skill
_EXACT = {}                                                          # way of writing -> index of the skill
for _i, _keys in enumerate(_KEYS):
    for _k in _keys:
        _EXACT.setdefault(_k, _i)
_NAME_PATTERNS = [_phrase_pattern(s[0]) for s in SKILLS]
# Other ways of writing a skill, to look for in a job's text (a way of writing
# of 1 or 2 letters is too easy to hit by chance, so those are only used for
# typed skills): [(the words, their pattern)] for each skill.
_ALIAS_PATTERNS = [[(a.lower(), _phrase_pattern(a)) for a in s[2] if len(a) >= 3] for s in SKILLS]

_vectors = None


def skill_vectors():
    """The meaning numbers of every skill name (made the first time they're needed)."""
    global _vectors
    if _vectors is None:
        _vectors = embed_texts(_NAMES)
    return _vectors


def _words_hit(index, text, category):
    """How much the skill's own words in the text add: its name, or another way
    of writing it. `text` is lower case."""
    same_category = _CATEGORIES[index] == category
    if _NAME_PATTERNS[index].search(text) and (same_category or _NAMES[index].lower() not in EVERYDAY_WORDS):
        return NAME_IN_TEXT
    for words, pattern in _ALIAS_PATTERNS[index]:
        if pattern.search(text) and (same_category or words not in EVERYDAY_WORDS):
            return ALIAS_IN_TEXT
    return 0.0


def suggest_skills(title, category, description, have=(), how_many=HOW_MANY):
    """The skills this job post needs, best first, as standard names. `have`
    are the skills already on the post (not suggested again)."""
    title, description = " ".join(title.split()), " ".join(description.split())
    if len(title) < MIN_TITLE_LENGTH or len(description) < MIN_DESCRIPTION_LENGTH:
        return []
    text = f"{title}. {description}"
    lowered = text.lower()
    skip = {_key(name) for name in have}
    # Skills the post already has, and a skill named by an everyday word when
    # the job isn't in its category, are never suggested.
    open_to = np.array([
        _key(name) not in skip and not (name.lower() in EVERYDAY_WORDS and _CATEGORIES[i] != category)
        for i, name in enumerate(_NAMES)
    ])

    meaning = skill_vectors() @ embed_texts([text])[0]
    with_category = meaning + SAME_CATEGORY * np.array([c == category for c in _CATEGORIES])
    words = np.array([_words_hit(i, lowered, category) for i in range(len(_NAMES))])

    best = with_category[open_to].max() if open_to.any() else 0.0
    close_enough = (meaning >= MIN_MEANING) & (with_category >= KEEP_SHARE * best)
    order = np.argsort(-(with_category + words))
    picked = [i for i in order if open_to[i] and (words[i] > 0 or close_enough[i])][:how_many]
    return [_NAMES[i] for i in picked]


def match_skill(text):
    """The standard name for a skill someone typed, or None if it isn't one we
    know (then it stays as typed). Two ways to match:
    1. it is the standard name or a known other way of writing it, in any
       capitalization or punctuation ("photoshop", "NODE JS");
    2. it is a typo of one: written almost the same ("vid editng")."""
    key = _key(text)
    if not key:
        return None
    if key in _EXACT:
        return _NAMES[_EXACT[key]]
    if len(key) < MIN_TYPO_LENGTH:
        return None

    best_ratio, best_index = 0.0, None
    for index, keys in enumerate(_KEYS):
        for other in keys:
            if abs(len(other) - len(key)) > 3:  # a typo is about the same length
                continue
            ratio = SequenceMatcher(None, key, other).ratio()
            if ratio > best_ratio:
                best_ratio, best_index = ratio, index
    return _NAMES[best_index] if best_ratio >= MATCH_TYPO else None
