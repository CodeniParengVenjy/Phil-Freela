"""Measures the resume check on PICTURES (resume_ocr.py reading the words, then
resume_check.py judging them). From the ai-service folder, run:

    python test_resume_ocr.py

(the service's own virtual environment is fine; it needs the models folder
filled by get_models.py, and takes a minute or two). Every check prints PASS or
FAIL, and the script exits with 1 if any check failed.

The same made-up resumes and other documents as test_resume_check.py
(resume_samples.py) are drawn onto pages, two ways: CLEAN, like a screenshot or
an exported picture, and PHOTOGRAPHED, like a phone photo of paper on a table
(turned a little, skewed, shaded, soft, noisy, shrunk, low quality JPEG; see
resume_test_pictures.py). Nothing was tuned on these pictures: the numbers in
resume_check.py were fixed on the text of set A before any picture was read.
What matters most is that no real resume is refused. A document that gets
through as "not sure" is not an error (the check only refuses what is clearly
not a resume), but it is counted and printed.
"""

import os
import sys
import time

# Made-up values, set BEFORE the service's modules are imported, so the real keys in .env are never used.
os.environ["SUPABASE_URL"] = "https://example.invalid"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.made-up-signature-for-tests"

import resume_check as rc  # noqa: E402
import resume_samples as samples  # noqa: E402
from resume_test_pictures import photographed, png_bytes, render_page  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  ({detail})" if detail and not ok else ""))


rc.score_text("warm up the text model")
rc.check_resume(png_bytes(render_page(samples.A_RESUMES["designer"])))  # loads the picture reader too


def measure(label, resumes, others, condition):
    """Runs every document of a set as a picture and returns what happened."""
    started = time.time()
    answers = {}
    for index, (name, text) in enumerate({**resumes, **others}.items()):
        page = render_page(text)
        data = png_bytes(page) if condition == "clean" else photographed(page, seed=index + 7)
        answers[name] = rc.check_resume(data)["verdict"]
    seconds = time.time() - started
    refused_resumes = [n for n in resumes if answers[n] == "no"]
    yes_resumes = [n for n in resumes if answers[n] == "yes"]
    stopped = [n for n in others if answers[n] == "no"]
    let_through = [n for n in others if answers[n] != "no"]
    called_resume = [n for n in others if answers[n] == "yes"]
    print(f"\n{label}, {condition}: {len(resumes)} resumes: {len(yes_resumes)} yes, {len(resumes) - len(yes_resumes) - len(refused_resumes)} not sure, "
          f"{len(refused_resumes)} refused{' (' + ', '.join(refused_resumes) + ')' if refused_resumes else ''} | "
          f"{len(others)} other documents: {len(stopped)} refused, {len(let_through)} let through"
          f"{' (' + ', '.join(let_through) + ')' if let_through else ''} | {seconds / len(answers):.1f}s a picture")
    # A picture whose words can't be read (fewer than 25 come out) is refused, with a message that says to send a clearer
    # picture or a PDF. A resume of under 40 words, photographed at low quality, can end up there (the 29-word "short"
    # resume does): a known limit, printed above but not an error. Every longer resume must be read.
    refused_long = [n for n in refused_resumes if len(resumes[n].split()) >= 40]
    check(f"{label}, {condition}: no real resume of 40 words or more is refused", not refused_long, f"refused: {refused_long}")
    check(f"{label}, {condition}: no other document is called a resume", not called_resume, f"called a resume: {called_resume}")
    return stopped, others


for label, resumes, others in (("SET A", samples.A_RESUMES, samples.A_OTHERS), ("SET B", samples.B_RESUMES, samples.B_OTHERS)):
    stopped, others_in_set = measure(label, resumes, others, "clean")
    check(f"{label}, clean: every other document is refused", len(stopped) == len(others_in_set), f"{len(stopped)} of {len(others_in_set)}")
    stopped, others_in_set = measure(label, resumes, others, "photographed")
    # In a photo some print can't be made out, and a form that is mostly blank lines then has too few words to judge:
    # it is let through as "not sure". At most one in ten may.
    check(f"{label}, photographed: nearly every other document is refused (all but one at most)", len(stopped) >= len(others_in_set) - 1, f"{len(stopped)} of {len(others_in_set)}")

failed = results.count(False)
print(f"\n{len(results) - failed} of {len(results)} checks passed")
sys.exit(1 if failed else 0)
