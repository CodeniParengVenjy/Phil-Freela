# Required skills filled in by the AI (plan and result)

Status (2026-10-27): approved ("ok", with "it can be type a skill but make the AI
based more accurate"), built and tested. One step, no database change. Follows
PLAN-posting-job.md step 3 (the AI used to only suggest skills to tap).

## Why

The user asked that a job post's Required skills be "AI based, not manually put":
when a client needs, for example, video editing, the AI should put the skill in by
itself. Typing a skill stays allowed, and the AI had to become more accurate,
because skills it puts in by itself must be right.

## What people see (Post a Project / Post a Job)

1. "Required skills (filled in by the AI, up to 10)". About a second after the
   client stops typing the title or description, the AI fills in the skills it is
   sure of, as chips with a star ("Filled in by the AI from your description.
   Remove any that don't fit."). It reads again when the text or category changes,
   and its chips follow the new text.
2. Each chip has an x. A skill the client removes is not filled in again on that
   form; it stays among the ideas, so a mistake is undone with a tap.
3. "Other skills the AI found:" are the AI's less certain ideas, tap to add.
4. The client can still type a skill (Enter or comma); it is tidied to its
   standard name as before ("photoshop" -> "Adobe Photoshop"). The client's own
   skills come first and are kept when the AI reads the text again.
5. Editing an old post keeps its saved skills. While its title, category and
   description are unchanged, nothing is filled in ("The AI suggests:" ideas
   only); once the text changes, the AI fills in next to the saved skills.
6. AI offline: "The AI can't be reached right now. You can type the skills
   yourself." The post can still be saved. Nothing found: "The AI found no skills
   in your description. Add more details about the work, or type the skills
   yourself."
7. The full tour's Skills note says the AI fills them in (client tour).

## How the AI decides (ai-service/skills.py)

Same pretrained all-MiniLM-L6-v2 model, nothing trained. Changes:
1. Meaning uses every way of writing a skill (its name and other names), the
   closest one counts: "videographer" is near Event Videography.
2. Word forms: a skill of two or more words counts as written when all its words
   are in the text in any form ("video edition" -> Video Editing).
3. 46 common Filipino words are swapped for English before reading ("kasal" ->
   wedding, "tindahan" -> store, "mag-eedit" -> edit).
4. The answer is two lists, `{"skills": [...], "more": [...]}`: "skills" (filled in,
   at most 5) are the ones whose words are in the text, and the one skill closest
   in meaning; "more" (at most 5) are the rest of the good ideas.

Endpoint: `POST /skills/suggest` (same body; `have` still accepted) now answers
`{skills, more}`. `/skills/match` unchanged. Website: `suggestSkills()` in
`client/src/lib/aiService.js` returns `{ skills, more }`; the form is
`client/src/pages/dashboard/views/PostNeedView.jsx`.

## Accuracy (ai-service/test_skills.py, 136 checks)

Measured on 52 NEW made-up posts written before any result was seen (short,
casual, some Taglish, a wrong category, the 4 real posts on the live site); the
numbers were not chosen from them:
- Before: if all 6 old suggestions had been filled in, 54% would have been right
  (about 1.7 wrong skills per post), and 89% of the must-have skills were found.
- Now: 92% of the skills filled in are right (77 of 84, about 1 wrong skill in 8
  posts), 1.6 filled in per post, and 96% of the must-have skills are found
  (filled in or among the ideas).
- On the 32 older posts the numbers were tuned on: 96% right (80 of 83). Their
  answer key got the skills a post names itself ("Android and iOS app" -> iOS
  Development) and Content Writing became a nice-to-have for the SEO blog post.

Known misses: a word used in another sense still counts ("call center agents"
in a recruiting post -> Call Center; "characters I created in Blender" ->
Blender; "my vocals" -> Singing); "Need a website for my business" fills in
E-commerce Website; the AI can't see "edit my reels" in the Other category as
Video Editing (Short-Form Video is offered as an idea).

Bug fixed on the way: typing a skill that differs from its standard name only in
capitals ("react") used to make the chip disappear; now it becomes "React".

## Tests

- `ai-service/test_skills.py`: 136 checks, 0 failed (run `python test_skills.py`
  in the service's venv).
- Browser, the real form against a pretend database and AI service, laptop dark
  and phone light: 66 checks, 0 failed (filling in, the star and its note,
  removing and undoing, tapping, typing and tidying, "react" -> "React", reading
  again after the text changes, a removed skill not refilled, saving order, a
  skill left in the box, nothing found, AI offline, the 10-skill limit, a slow
  older answer ignored, editing an old post with and without text changes, no
  sideways scrolling, no page errors).
- Not tried on the live site: the AI service redeploys from main on Vercel.

## Rollout (2026-10-28)

The finished work sat uncommitted overnight, so the live site still showed the old
manual form ("Required skills (optional)"). The user said they could not see the
function; it was committed and pushed together: the website (Cloudflare) and the
AI service (Vercel) deploy separately from the same push, and the website is
usually live first. One safety line was added to `suggestSkills()`: an answer
without `more` (the not-yet-updated AI service, which answers one list) is shown
only as ideas to tap and nothing is filled in by itself, because the old list was
less accurate (54% right). Also tested now: Post a Job fills the skills in too, and
that not-yet-updated answer (browser test, laptop dark and phone light: 78 checks,
0 failed, the earlier 66 plus 12 new).
