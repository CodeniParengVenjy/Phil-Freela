"""Checks the document preview rule in document_preview.py (document previews,
see PLAN-document-previews.md). No database and no AI model is used. From the
ai-service folder, run:

    python test_document_preview.py

(the service's own virtual environment is fine). Every check prints PASS or
FAIL, and the script exits with 1 if any check failed.
"""

import sys

from document_preview import make_preview, preview_length
from text_watermark import CODE_PATTERN, HIDDEN_CHARACTERS, MARK, add_code, read_code, strip_hidden

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok or not detail else f"  -> {detail}"))


SENTENCES = [
    "I plan every branding project from the first call to the final files.",
    "First I listen to the client, then I sketch three directions on paper.",
    "We pick one together, and I build it in clean vector shapes.",
    "Every logo is tested in black and white before any colour goes in.",
    "The client gets the source files, a short guide and two rounds of changes.",
]


def essay(sentences_count):
    """Plain writing with sentences of different lengths, in paragraphs."""
    out = []
    for i in range(sentences_count):
        out.append(SENTENCES[i % len(SENTENCES)] + (" " if i % 4 != 3 else "\n\n"))
    return "".join(out).strip()


CODE = 0x123456789ABC  # a made-up 48-bit code
visible = lambda text: strip_hidden(text)  # noqa: E731

# ---------------------------------------------------------------------------
# How much is shown
# ---------------------------------------------------------------------------
print("== How much is shown ==")
check("30% of a long text, but never more than 1,500 characters", preview_length(12000) == 1500 and preview_length(5000) == 1500 and preview_length(5001) == 1500)
check("30% of a middle-sized text", preview_length(1000) == 300 and preview_length(2000) == 600)
check("a short text still shows at least 200 characters", preview_length(500) == 200 and preview_length(400) == 200)
check("under 400 characters it shows half", preview_length(399) == 199 and preview_length(100) == 50 and preview_length(20) == 10)
check("nothing at all gives nothing", preview_length(0) == 0 and make_preview("") == ("", 0))

for count, label in ((120, "a long text"), (14, "a middle-sized text"), (2, "a short text")):
    text = essay(count)
    total = len(visible(text))
    shown, hidden = make_preview(text)
    shown_visible = visible(shown)
    limit = preview_length(total)
    check(f"{label} ({total} characters): the preview is at most the limit ({limit}) and not far under it",
          len(shown_visible) <= limit and len(shown_visible) >= limit - 40, f"{len(shown_visible)} shown")
    check(f"{label}: shown + hidden adds up to the whole text", len(shown_visible) + hidden == total, f"{len(shown_visible)} + {hidden} vs {total}")
    check(f"{label}: the preview is the start of the text", visible(text).startswith(shown_visible))
    next_char = visible(text)[len(shown_visible)]
    check(f"{label}: it ends at a word (the next character is a space or a new line)", next_char.isspace(), repr(next_char))
    check(f"{label}: it doesn't end with a space", shown == shown.rstrip())

# ---------------------------------------------------------------------------
# The invisible watermark code
# ---------------------------------------------------------------------------
print("\n== The invisible code ==")
SECRET = "The final unique sentence about secret pricing details that visitors must never see."
plain = essay(120) + " " + SECRET
coded = add_code(plain, CODE)
shown, hidden = make_preview(coded)
check("the preview still carries the code, and reads back the same", read_code(shown) == CODE)
check("every code in the preview is a whole one (no half code at the cut)", shown.count(MARK) % 2 == 0 and not HIDDEN_CHARACTERS.search(CODE_PATTERN.sub("", shown)))
check("the text is the same as without the code", visible(shown) == make_preview(plain)[0])
# The code splits words (it sits after the first word of every sentence), so look for single words of the secret too.
check("the part that is hidden is really not in the preview (not the sentence, nor its rare words)",
      "secret" not in shown and "pricing" not in shown and "unique" not in shown and len(visible(shown)) < len(visible(coded)) // 3)
check("hidden_chars counts visible characters only (not the invisible ones)", hidden == len(visible(coded)) - len(visible(shown)))

# Cutting at every possible length never leaves half a code.
bad = []
for count in range(1, 40):
    text = add_code(essay(count), CODE)
    part, _ = make_preview(text)
    if part.count(MARK) % 2 or HIDDEN_CHARACTERS.search(CODE_PATTERN.sub("", part)):
        bad.append(count)
check("no half code at the cut, for texts of 1 to 39 sentences", not bad, f"bad for {bad}")

# ---------------------------------------------------------------------------
# Odd texts
# ---------------------------------------------------------------------------
print("\n== Odd texts ==")
long_word = "word " * 30 + "x" * 3000 + " end of the long word text " * 5
shown, hidden = make_preview(long_word)
check("a very long word doesn't break it (and the preview isn't empty)", shown and hidden > 0 and len(shown) <= 1500)
check("the same text always gives the same preview", make_preview(coded) == make_preview(coded))
tiny = "one two three four five six seven eight nine ten"
shown, hidden = make_preview(tiny)
check("ten short words: only some of them show", 0 < len(shown) < len(tiny) and hidden == len(tiny) - len(shown), f"{shown!r}")
spaced = "word " * 400
shown, hidden = make_preview(spaced)
check("it cuts at a space and leaves no trailing space", shown == shown.rstrip() and shown.endswith("word") and hidden > 0)

print(f"\n{sum(results)} of {len(results)} checks passed")
sys.exit(0 if all(results) else 1)
