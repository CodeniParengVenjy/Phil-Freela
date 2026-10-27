"""Required skills for a job post, handled by the AI (PLAN-posting-job.md, step 3,
and PLAN-ai-skills.md: the AI fills them in by itself).

The client who posts a job used to type every skill by hand. Now two things
help:

1. suggest_skills(): reads the job's title, category and description and works
   out the skills it needs ("Logo Design", "Adobe Illustrator"...). It uses the
   same pretrained all-MiniLM-L6-v2 model as the search box and "Recommended
   for you" (text_embedder.py; nothing is trained here): the job's text and
   each skill are turned into 384 numbers, and texts with a similar meaning get
   similar numbers, even with different words. Common Filipino words are first
   swapped for English ones ("kasal" -> "wedding"), because the model reads
   English. For every skill in skills_list.py:
   - meaning: how close the skill is to the job's text (cosine similarity of
     the two sets of numbers), using the closest of its name and its other
     names ("Event Videography" is also "event videographer");
   - words: the skill is really in the text, like "Premiere" or "QuickBooks":
     its name, another way of writing it, or all the words of its name in any
     form ("video edition" has the words of "Video Editing"); this counts extra;
   - category: a skill of the category the client picked counts a little extra.
   The answer has two lists. "skills" are the ones the AI is sure of, which the
   website fills in by itself: the skills whose words are in the text, and the
   one skill closest in meaning. "more" are the other good ideas, which the
   client can tap to add.
2. match_skill(): a skill the client typed is tidied to the standard name when
   it is the same skill written another way or with a typo, so the chips stay
   consistent and one skill isn't listed twice: "photoshop" -> "Adobe
   Photoshop", "vid editng" -> "Video Editing". A skill that isn't in the list
   is left as typed. This one compares spelling, not meaning: in tests the
   model's meaning alone turned "data analytics" into "Google Analytics".

The numbers below were chosen by trying them on made-up job posts, and then
checked on a second set of posts written the way real clients write (short,
casual, some Taglish) that they were not chosen from (test_skills.py has both).
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

FILL_MAX = 5  # skills filled in by themselves, at most
MORE_MAX = 5  # other ideas to tap, at most

# How much each thing adds to a skill's score. Meaning is 0 to 1 (a related
# skill is usually 0.3 to 0.7).
NAME_IN_TEXT = 0.30     # the skill's own name is written in the job text
ALIAS_IN_TEXT = 0.14    # another way of writing it is, or all its words in some form
SAME_CATEGORY = 0.10    # the skill belongs to the category the client picked

# The skill closest in meaning is filled in even when its words aren't in the
# text (on the test posts it was right 21 times out of 22); a skill within 1%
# of it counts as just as close.
CLOSEST_SHARE = 0.99

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

# Common Filipino words in job posts and their English meaning, swapped in
# before the text is read (written without dashes: "mag-eedit" is "mageedit").
FILIPINO_WORDS = {
    "kasal": "wedding", "binyag": "baptism", "kaarawan": "birthday", "tindahan": "store", "negosyo": "business",
    "kainan": "restaurant", "paaralan": "school", "eskwelahan": "school", "bahay": "house", "anak": "child",
    "estudyante": "student", "guro": "teacher", "litrato": "photo", "larawan": "picture", "kanta": "song",
    "awit": "song", "boses": "voice", "damit": "clothes", "pagkain": "food", "paninda": "products",
    "produkto": "products", "presyo": "prices", "libro": "book", "aklat": "book", "kailangan": "need",
    "gawa": "make", "gumawa": "make", "pagawa": "make", "magpagawa": "make", "isulat": "write",
    "sumulat": "write", "isalin": "translate", "pagsasalin": "translation", "turuan": "teach", "magturo": "teach",
    "ayusin": "fix", "linisin": "clean", "magbenta": "sell", "benta": "sales", "magedit": "edit",
    "mageedit": "edit", "iedit": "edit", "paedit": "edit", "ipaedit": "edit",
}

# Endings taken off a word so its forms match: "editing", "edition", "editor"
# and "edited" are all "edit"; "videographer" and "videography" are "videograph".
WORD_ENDINGS = ("ings", "ions", "ers", "ors", "ing", "ion", "er", "or", "ed", "es", "s", "y")
SMALL_WORDS = {"and", "of", "for", "the", "a", "to"}

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


def _english(text):
    """The text with the common Filipino words in FILIPINO_WORDS swapped for English."""
    return re.sub(r"[A-Za-z][A-Za-z-]*", lambda m: FILIPINO_WORDS.get(m.group(0).lower().replace("-", ""), m.group(0)), text)


def _word_forms(text):
    """The words of a text with one ending taken off each ("edition" -> "edit")."""
    forms = []
    for word in re.findall(r"[a-z0-9+#]+(?:\.[a-z0-9]+)*", text.lower()):
        if word in SMALL_WORDS:
            continue
        for ending in WORD_ENDINGS:
            if word.endswith(ending) and len(word) - len(ending) >= 3:
                word = word[: -len(ending)]
                break
        forms.append(word)
    return forms


def _same_word(a, b):
    """Two word forms are the same word, or one starts the other ("photo" and
    "photograph", "web" and "website"; words of 1 or 2 letters must be equal)."""
    return a == b or (min(len(a), len(b)) >= 3 and (a.startswith(b) or b.startswith(a)))


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
# The word forms of a name of two words or more, to look for in any form
# ("Video Editing" -> ["video", "edit"]); None for a one-word name (one word
# alone, like "edit", is too loose).
_NAME_FORMS = [(_word_forms(s[0]) if len(_word_forms(s[0])) >= 2 else None) for s in SKILLS]
# Every way of writing each skill, for meaning: its name and its other names
# (of 3 letters or more), and which skill each one belongs to.
_WAYS = [w for s in SKILLS for w in [s[0]] + [a for a in s[2] if len(a) >= 3]]
_WAY_OWNER = np.array([i for i, s in enumerate(SKILLS) for _ in [s[0]] + [a for a in s[2] if len(a) >= 3]])

_vectors = None


def skill_vectors():
    """The meaning numbers of every way of writing every skill, one row each
    (made the first time they're needed; in batches of 64, which is faster
    because short texts are padded only to the longest in their batch)."""
    global _vectors
    if _vectors is None:
        _vectors = np.vstack([embed_texts(_WAYS[i:i + 64]) for i in range(0, len(_WAYS), 64)])
    return _vectors


def _meaning(text):
    """How close each skill is in meaning to the text: the closest of its ways of writing."""
    similarity = skill_vectors() @ embed_texts([text])[0]
    meaning = np.full(len(_NAMES), -1.0)
    np.maximum.at(meaning, _WAY_OWNER, similarity)
    return meaning


def _words_hit(index, text, category, forms=()):
    """How much the skill's own words in the text add: its name, another way of
    writing it, or every word of its name in some form. `text` is lower case
    and `forms` are its word forms (_word_forms)."""
    same_category = _CATEGORIES[index] == category
    if _NAME_PATTERNS[index].search(text) and (same_category or _NAMES[index].lower() not in EVERYDAY_WORDS):
        return NAME_IN_TEXT
    for words, pattern in _ALIAS_PATTERNS[index]:
        if pattern.search(text) and (same_category or words not in EVERYDAY_WORDS):
            return ALIAS_IN_TEXT
    name_forms = _NAME_FORMS[index]
    if name_forms and all(any(_same_word(f, w) for w in forms) for f in name_forms):
        return ALIAS_IN_TEXT
    return 0.0


def suggest_skills(title, category, description, have=()):
    """The skills this job post needs, as standard names, best first:
    {"skills": [...], "more": [...]}. "skills" are the ones to fill in by
    themselves, "more" other ideas to tap. `have` are skills the post already
    has (left out of both)."""
    title, description = " ".join(title.split()), " ".join(description.split())
    if len(title) < MIN_TITLE_LENGTH or len(description) < MIN_DESCRIPTION_LENGTH:
        return {"skills": [], "more": []}
    text = _english(f"{title}. {description}")
    lowered = text.lower()
    forms = _word_forms(text)
    skip = {_key(name) for name in have}
    # Skills the post already has, and a skill named by an everyday word when
    # the job isn't in its category, are never suggested.
    open_to = np.array([
        _key(name) not in skip and not (name.lower() in EVERYDAY_WORDS and _CATEGORIES[i] != category)
        for i, name in enumerate(_NAMES)
    ])

    meaning = _meaning(text)
    with_category = meaning + SAME_CATEGORY * np.array([c == category for c in _CATEGORIES])
    words = np.array([_words_hit(i, lowered, category, forms) for i in range(len(_NAMES))])

    best = with_category[open_to].max() if open_to.any() else 0.0
    close_enough = (meaning >= MIN_MEANING) & (with_category >= KEEP_SHARE * best)
    order = np.argsort(-(with_category + words))
    picked = [i for i in order if open_to[i] and (words[i] > 0 or close_enough[i])]
    # Sure: its words are in the text, or it is the closest in meaning.
    sure = [i for i in picked if words[i] > 0 or with_category[i] >= CLOSEST_SHARE * best][:FILL_MAX]
    more = [i for i in picked if i not in sure][:MORE_MAX]
    return {"skills": [_NAMES[i] for i in sure], "more": [_NAMES[i] for i in more]}


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
