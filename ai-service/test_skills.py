"""Checks the AI part of Post What You Need: skills.py (the skills it suggests
for a job post and the tidying of a typed skill) and its two endpoints in
main.py. It uses the real pretrained model (text_embedder.py) but no database:
the endpoint checks replace the login check. From the ai-service folder, run:

    python test_skills.py

(the service's own virtual environment is fine). Every check prints PASS or
FAIL, and the script exits with 1 if any check failed.

The made-up job posts in JOBS are what the numbers in skills.py were chosen
from: each has the skills a sensible person would expect. NEW_JOBS were
written later, the way real clients write (short, casual, some Taglish, the 4
real posts on the live site), and the numbers were NOT chosen from them, so
they show how well the AI does on posts it has never seen. The checks say how
many expected skills must be found, and how many of the skills filled in by
themselves must be right.
"""

import os
import sys

# Made-up values, set BEFORE main is imported, so the real keys in .env are never used.
os.environ["SUPABASE_URL"] = "https://example.invalid"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.made-up-signature-for-tests"

import skills  # noqa: E402
from skills_list import SKILLS  # noqa: E402

results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"  ({detail})" if detail and not ok else ""))


# (title, category, description, the skills it must get, other skills a person would be happy with)
# Since the AI fills skills in (2026-10-27), a skill the post names itself is
# in the second list ("Android and iOS app" -> iOS Development).
JOBS = [
    ("Hiring a logo designer for our cafe business", "graphic-design", "We are opening a coffee shop in Cebu and need a modern logo with brand colors. Please share samples of your past logo work.", ["Logo Design"], ["Brand Identity"]),
    ("Edit our wedding highlight video", "video-editing", "I have 2 hours of raw footage from our wedding. I need a 4 minute highlight video with music, color grading and nice transitions.", ["Wedding Video Editing", "Video Editing", "Color Grading"], []),
    ("React developer for a small online shop", "web-development", "We need product pages, a shopping cart and an admin page built in React with a Node.js backend and a REST API.", ["React", "Node.js", "REST APIs"], ["E-commerce Website", "Backend Development"]),
    ("Virtual assistant for emails and scheduling", "virtual-assistant", "Looking for a reliable VA to manage my inbox, book appointments and handle my calendar every day for 4 hours.", ["Virtual Assistance", "Email Management", "Calendar Management"], []),
    ("Translate a legal contract from Tagalog to English", "translation", "A 12 page contract has to be translated carefully from Tagalog to English.", ["Tagalog Translation", "Legal Translation", "Translation"], []),
    ("Product photos for my online store", "photography", "I sell handmade soap and need clean photos of 20 items on a white background, edited and ready for Shopee.", ["Product Photography", "Photo Editing", "Background Removal"], ["Photography"]),
    ("Social media manager for a restaurant", "social-media", "Manage our Facebook and Instagram pages: three posts per week, reels, stories, and replies to comments and messages.", ["Social Media Management", "Facebook Page Management", "Instagram Management"], ["Reels and Stories"]),
    ("Monthly bookkeeper using QuickBooks", "accounting", "We need someone to record transactions, do bank reconciliation and prepare monthly financial statements in QuickBooks Online.", ["Bookkeeping", "QuickBooks", "Bank Reconciliation", "Financial Statements"], []),
    ("Tagalog voice over for a radio ad", "audio-music", "30 second radio commercial for our hardware store, warm friendly male voice in Tagalog.", ["Voice Over", "Tagalog Voice Over", "Radio Ads"], []),
    ("Math tutor for a grade 8 student", "tutoring", "My son needs help with algebra and geometry twice a week over Zoom.", ["Math Tutoring", "Online Tutoring"], ["High School Tutoring"]),
    ("Flutter app for a delivery business", "mobile-development", "We want an Android and iOS app where customers order food and track the rider on a map.", ["Flutter", "Mobile App Development"], ["Android Development", "iOS Development"]),
    ("SEO blog articles for a dental clinic", "copywriting", "Write 8 blog articles about dental care, optimized for search with keywords.", ["SEO Writing", "Blog Writing"], ["Article Writing", "Content Writing"]),
    ("3D render of a perfume bottle", "animation-3d", "Create a realistic 3D model and render of our perfume bottle in Blender for our ads.", ["3D Modeling", "Blender", "3D Rendering"], ["Product Visualization"]),
    ("UI design for a fitness app in Figma", "ui-ux-design", "Design the screens of a workout tracking mobile app, with a clickable prototype and a design system.", ["UI Design", "Figma", "Prototyping", "Mobile App Design"], ["Design Systems"]),
    ("Chat support agent, night shift", "customer-support", "Answer customer chats and emails for our online store using Zendesk. Night shift, US hours.", ["Chat Support", "Customer Support", "Zendesk"], ["Night Shift Support", "Email Support"]),
    ("Clean up a customer list in Excel", "data-entry", "I have 5000 rows with duplicates and mistakes that need cleaning in Excel and Google Sheets.", ["Data Cleaning", "Microsoft Excel"], ["Google Sheets"]),
    ("Facebook ads for my online clothing shop", "digital-marketing", "Set up and run Facebook and Instagram ads to get more orders and leads, with a monthly report.", ["Facebook Ads"], ["Digital Marketing", "Instagram Ads"]),
    ("Poster for our school fair", "graphic-design", "Make an attractive poster and a few social media posts for our school fair using Canva.", ["Poster Design", "Canva"], ["Social Media Graphics"]),
    ("Podcast editor for weekly episodes", "audio-music", "Remove background noise and filler words, add intro music and export each weekly episode.", ["Podcast Editing"], ["Audio Editing"]),
    ("Animated explainer video for my app", "animation-3d", "A 60 second animated explainer with voice over and simple 2D characters.", ["Explainer Animation", "2D Animation"], ["Voice Over"]),
    ("WordPress website for a small clinic", "web-development", "Build a 5 page website with booking form and contact page using WordPress and Elementor.", ["WordPress", "Web Development"], []),
    ("Resume and cover letter writing", "copywriting", "I am applying for nursing jobs abroad and need a polished resume and cover letter.", ["Resume Writing"], []),
    ("Jingle for our bakery", "audio-music", "A catchy 20 second jingle with lyrics about our bakery.", ["Jingle Writing"], ["Songwriting"]),
    ("Shopee store assistant", "virtual-assistant", "Upload new products, update prices and stock, and answer buyer questions on our Shopee and Lazada stores.", ["Online Store Management", "Product Listing"], []),
    ("Payroll and BIR filing", "accounting", "Compute payroll for 15 employees and file monthly BIR forms and SSS, PhilHealth and Pag-IBIG contributions.", ["Payroll Processing", "BIR Tax Filing", "Government Contributions"], []),
    ("Photographer for a debut", "photography", "Photos for an 18th birthday party with a studio shoot and an event coverage.", ["Event Photography", "Photography"], []),
    ("Python script to scrape product prices", "web-development", "I need a Python script that scrapes prices from several websites into a spreadsheet every day.", ["Python", "Web Scraping"], []),
    ("English tutor for Korean kids", "tutoring", "Teach conversational English online to kids from Korea, 30 minute classes in the evening.", ["English Tutoring", "Online Tutoring"], ["ESL Teaching"]),
    ("Add subtitles to my YouTube videos", "video-editing", "I need English subtitles added to 10 short YouTube videos and a simple intro animation.", ["Video Subtitles", "YouTube Video Editing"], []),
    ("Pitch deck design for investors", "graphic-design", "Design a clean 12 slide investor presentation in PowerPoint using our brand colors.", ["Presentation Design"], ["Microsoft Office"]),
    ("Event coordinator for a wedding", "other", "Plan and coordinate our wedding day, from suppliers to the program.", ["Event Planning"], []),
    ("App tester for bugs", "other", "Test our mobile app on different phones and report bugs with clear steps.", ["Quality Assurance Testing"], []),
]

# Written after the numbers were chosen, to see how the AI does on posts it was
# never tuned on: short, casual, some Taglish, a wrong category, and the 4 real
# posts on the live site (2026-10-27).
NEW_JOBS = [
    ("Video editor needed", "video-editing", "Need someone to edit my vlog videos for YouTube, simple cuts and music.", ["Video Editing", "YouTube Video Editing"], []),
    ("Video edition for our event", "video-editing", "We need video edition of our company anniversary event, around 5 minutes.", ["Video Editing"], ["Event Videography"]),
    ("Kailangan ng video editor para sa kasal", "video-editing", "Kailangan namin ng mag-eedit ng video ng kasal namin, mga 3 minutes na highlight.", ["Video Editing", "Wedding Video Editing"], []),
    ("TikTok videos for my milk tea shop", "video-editing", "Edit short videos for TikTok and Reels showing our drinks, 10 videos per month.", ["Short-Form Video", "Video Editing"], ["TikTok Content", "Reels and Stories"]),
    ("Videographer for a birthday party", "video-editing", "Shoot and edit a video of my daughter's 7th birthday party at a restaurant.", ["Event Videography"], ["Video Editing", "Video Production"]),
    ("Logo para sa sari-sari store", "graphic-design", "Gawa ng logo para sa aming tindahan, simple lang at madaling basahin.", ["Logo Design"], ["Graphic Design"]),
    ("Menu for our carinderia", "graphic-design", "Design a printed menu with our dishes and prices, A4 size.", ["Menu Design"], ["Print Design", "Graphic Design"]),
    ("Wedding invitation design", "graphic-design", "Elegant invitation for our wedding in December, with a RSVP card.", ["Invitation Design"], ["Print Design"]),
    ("Shirt design for our barangay league", "graphic-design", "Basketball jersey and t-shirt design for our team with our names and numbers.", ["T-Shirt Design"], ["Graphic Design"]),
    ("Fix my website", "web-development", "My WordPress site is slow and some pages are broken after an update.", ["WordPress", "Website Maintenance"], ["Website Speed Optimization"]),
    ("Build a simple website for my resort", "web-development", "A website showing our rooms, prices, photos and a contact form. Must look good on phones.", ["Web Development"], ["Responsive Web Design", "Landing Page", "Web Design"]),
    ("Capstone system help", "web-development", "Need help finishing our capstone project, a web system with login and reports using PHP and MySQL.", ["Capstone Project Help", "PHP", "MySQL"], ["Web Development"]),
    ("AI Developer for Web App", "web-development", "AI Developer for Web App", ["AI Integration"], ["Web Development", "Machine Learning", "Chatbot Development", "Full-Stack Development"]),
    ("Chatbot for our Facebook page", "web-development", "Make a chatbot that answers customer questions automatically on Messenger.", ["Chatbot Development"], ["AI Integration", "Automation"]),
    ("Android app for our school", "mobile-development", "An Android app where students can see announcements and their grades.", ["Android Development", "Mobile App Development"], []),
    ("Redesign our app screens", "ui-ux-design", "Our app looks old. We need a modern look for 15 screens in Figma.", ["UI Design", "Figma", "Mobile App Design"], ["UX Design"]),
    ("Product descriptions for Shopee", "copywriting", "Write catchy descriptions for 50 products in our Shopee store.", ["Product Descriptions"], ["Copywriting"]),
    ("Proofread my thesis", "copywriting", "Check the grammar and spelling of my 80 page thesis before defense.", ["Proofreading"], ["Editing", "Thesis Guidance"]),
    ("Captions for our Facebook posts", "copywriting", "Write funny and engaging captions for our daily Facebook posts.", ["Social Media Captions"], ["Copywriting"]),
    ("Grow our page followers", "social-media", "Handle our Facebook page and post daily to get more likes and followers.", ["Facebook Page Management", "Social Media Management"], ["Content Creation", "Community Management"]),
    ("Live seller host", "social-media", "Host our live selling on Facebook and TikTok every night, 3 hours.", ["Live Selling"], []),
    ("Run Google Ads for my clinic", "digital-marketing", "Set up Google search ads so more patients find our dental clinic.", ["Google Ads"], ["Digital Marketing"]),
    ("Rank my website on Google", "digital-marketing", "I want my website to show on the first page of Google search.", ["SEO"], ["Keyword Research", "Link Building"]),
    ("Personal assistant", "virtual-assistant", "Help me with emails, bookings, and reminders, part time.", ["Virtual Assistance"], ["Email Management", "Calendar Management", "Appointment Setting", "Administrative Support"]),
    ("Book my flights and hotels", "virtual-assistant", "Find and book cheap flights and hotels for a family trip to Japan.", ["Travel Booking"], ["Online Research", "Virtual Assistance"]),
    ("Phone support for our internet company", "customer-support", "Answer calls from customers about their internet problems.", ["Phone Support", "Technical Support"], ["Customer Support", "Call Center"]),
    ("Encode survey answers", "data-entry", "Type 300 paper survey forms into Google Sheets.", ["Survey Encoding", "Data Entry"], ["Google Sheets"]),
    ("Make charts from our sales", "data-entry", "Make a dashboard from our sales data in Power BI.", ["Power BI", "Data Visualization"], ["Data Analysis", "Dashboard Design"]),
    ("Transcribe interviews", "translation", "Turn 5 recorded interviews into text, about 3 hours of audio.", ["Audio Transcription", "Transcription"], []),
    ("Japanese to English translator", "translation", "Translate our product manual from Japanese to English.", ["Japanese Translation", "Translation"], ["Technical Writing"]),
    ("Food photos for our menu", "photography", "Take photos of 25 dishes for our new menu and Grab listing.", ["Food Photography"], ["Photography", "Photo Editing"]),
    ("Remove background of product pictures", "photography", "Make the background white on 100 product photos.", ["Background Removal"], ["Photo Editing", "Product Photography"]),
    ("Restore old family photo", "photography", "Fix an old damaged photo of my grandparents, scratches and faded colors.", ["Photo Restoration"], ["Photo Retouching", "Photo Editing"]),
    ("I need someone create a voice over", "audio-music", "I need someone to create a voice over in my characters that I created in blender.", ["Voice Over", "Voice Acting"], []),
    ("Beat for my rap song", "audio-music", "Make an original beat for my rap song, hip hop style.", ["Beat Making"], ["Music Production"]),
    ("Mix and master my song", "audio-music", "I recorded my vocals and guitar, need it mixed and mastered for Spotify.", ["Mixing and Mastering"], ["Audio Editing", "Music Production"]),
    ("3D model of our house design", "animation-3d", "Make a 3D view of our planned two storey house from the floor plan.", ["Architectural Visualization", "3D Modeling"], ["3D Rendering", "Architectural Drafting"]),
    ("Game character for my mobile game", "animation-3d", "Design and model a cute character for my Unity game, rigged for animation.", ["Character Design", "Unity", "3D Modeling", "Rigging"], ["Game Assets", "3D Animation"]),
    ("Bookkeeper for my small business", "accounting", "Record my daily sales and expenses and make a monthly report.", ["Bookkeeping"], ["Financial Statements", "Accounting"]),
    ("File my taxes", "accounting", "Help me file my BIR taxes as a freelancer, 1701Q and 2551Q.", ["BIR Tax Filing"], ["Tax Preparation"]),
    ("IELTS review", "tutoring", "I need a tutor to help me prepare for IELTS, focus on speaking and writing.", ["IELTS Preparation"], ["English Tutoring", "Test Preparation", "Online Tutoring"]),
    ("Coding tutor for my son", "tutoring", "Teach my 12 year old basic programming with Python and Scratch.", ["Programming Tutoring"], ["Python", "Online Tutoring"]),
    ("Board exam reviewer", "tutoring", "Need a reviewer for the nursing board exam, weekends only.", ["Test Preparation"], ["Online Tutoring", "Academic Coaching"]),
    ("Interior design for our condo", "other", "Plan the layout and furniture of our 30 sqm condo unit.", ["Interior Design"], []),
    ("Set up our office network", "other", "Install wifi and connect 10 computers and a printer in our office.", ["Network Setup"], ["IT Support"]),
    ("Logo Designer for a Small Business", "graphic-design", "We are looking for a creative Filipino freelance designer to create a simple and attractive logo for our small business. The logo should be unique, professional, and suitable for social media and business materials. The freelancer should provide the final design in PNG and JPG formats. Please submit your portfolio or sample designs.", ["Logo Design"], ["Graphic Design", "Brand Identity"]),
    ("QA Test - Logo for a small coffee shop", "graphic-design", "Need a simple modern logo for a neighborhood coffee shop. Deliver PNG and SVG. QA test post, please do not apply for real.", ["Logo Design"], ["Graphic Design", "Brand Identity", "Vector Illustration"]),
    ("Need help sa Excel", "data-entry", "Pa-gawa ng formulas sa Excel para sa inventory namin, VLOOKUP at SUMIF.", ["Spreadsheet Formulas", "Microsoft Excel"], []),
    ("Hire a recruiter", "other", "Find and screen 10 call center agents for our company.", ["Recruitment"], ["HR Support"]),
    ("Kailangan ng tutor sa math", "tutoring", "Grade 5 anak ko, kailangan ng tutor sa math tuwing hapon.", ["Math Tutoring"], ["Elementary Tutoring", "Online Tutoring"]),
    ("Edit my reels", "other", "Edit 10 Instagram reels for my clothing brand.", ["Short-Form Video", "Video Editing"], ["Reels and Stories", "Instagram Management"]),
    ("Website", "web-development", "Need a website for my business", ["Web Development"], ["Landing Page", "Web Design"]),
]

# --- 1. The list itself -------------------------------------------------------
names = [s[0] for s in SKILLS]
check("every skill name is 1 to 40 characters (the database's limit)", all(1 <= len(n) <= 40 for n in names), str([n for n in names if not 1 <= len(n) <= 40]))
check("no skill is listed twice", len({n.lower() for n in names}) == len(names))
check("every skill belongs to one of the 18 categories", all(s[1] in skills.CATEGORY_NAMES for s in SKILLS), str([s[0] for s in SKILLS if s[1] not in skills.CATEGORY_NAMES]))
owners = {}
clashes = []
for index, keys in enumerate(skills._KEYS):
    for key in keys:
        if owners.setdefault(key, index) != index:
            clashes.append(f"{key}: {names[owners[key]]} / {names[index]}")
check("no way of writing a skill is claimed by two skills", not clashes, "; ".join(clashes[:3]))
check("the list has about 300 skills", 280 <= len(SKILLS) <= 400, str(len(SKILLS)))

# --- 2. Skills for made-up job posts ------------------------------------------
def suggest(title, category, description, have=()):
    """Both lists together, and the ones filled in by themselves."""
    answer = skills.suggest_skills(title, category, description, have=have)
    return answer["skills"] + answer["more"], answer["skills"]


def score(jobs):
    """Over a set of posts: (expected skills found, expected skills, must-have
    skills found, must-have skills, filled-in skills that are right, filled in)."""
    totals = [0] * 6
    for title, category, description, must, nice in jobs:
        got, filled = suggest(title, category, description)
        totals[0] += sum(skill in got for skill in must + nice)
        totals[1] += len(must) + len(nice)
        totals[2] += sum(skill in got for skill in must)
        totals[3] += len(must)
        totals[4] += sum(skill in must + nice for skill in filled)
        totals[5] += len(filled)
    return totals


for title, category, description, must, nice in JOBS:
    answer = skills.suggest_skills(title, category, description)
    got = answer["skills"] + answer["more"]
    check(f"'{title[:38]}': finds {must}", all(skill in got for skill in must), f"got {answer}")
    check(f"'{title[:38]}': at most 5 filled in and 5 more, no repeats", len(answer["skills"]) <= 5 and len(answer["more"]) <= 5 and len(set(got)) == len(got), str(answer))
found, wanted, _, _, right, filled = score(JOBS)
check(f"made-up posts: 85% or more of the expected skills are found ({found} of {wanted})", found / wanted >= 0.85)
check(f"made-up posts: 90% or more of the skills filled in are right ({right} of {filled})", right / filled >= 0.90)
found, wanted, must_found, must_wanted, right, filled = score(NEW_JOBS)
check(f"new posts: 90% or more of the must-have skills are found ({must_found} of {must_wanted})", must_found / must_wanted >= 0.90)
check(f"new posts: 65% or more of all the expected skills are found ({found} of {wanted})", found / wanted >= 0.65)
check(f"new posts: 90% or more of the skills filled in are right ({right} of {filled})", right / filled >= 0.90)
check(f"new posts: about 1 to 3 skills are filled in per post ({filled / len(NEW_JOBS):.1f})", 1 <= filled / len(NEW_JOBS) <= 3)
check("a post about something we have no skill for (walking a dog) gets nothing", skills.suggest_skills("Walk my dog", "other", "I need someone to walk my dog every morning in my village.") == {"skills": [], "more": []})
check("too little text still answers (empty lists, no error)", skills.suggest_skills("Hi", "other", "") == {"skills": [], "more": []})

# --- 3. Rules inside the suggestions ------------------------------------------
logo, _ = suggest("Hiring a logo designer for our cafe business", "graphic-design", JOBS[0][2], have=["Logo Design"])
check("a skill the post already has is not suggested again", "Logo Design" not in logo and len(logo) > 0, str(logo))
check("...even written another way ('logo design' in small letters)", "Logo Design" not in suggest(JOBS[0][0], "graphic-design", JOBS[0][2], have=["logo design"])[0])
swift_job = ("Need a swift reply", "photography", "Please send a swift reply, I have a notion that you can shoot photos of our event quickly.")
check("everyday words ('swift', 'notion') don't count as the skills Swift and Notion in a photography job", not {"Swift", "Notion"} & set(suggest(*swift_job)[0]), str(suggest(*swift_job)))
check("...but 'Swift' in an iOS job is filled in", "Swift" in suggest("iOS app in Swift", "mobile-development", "Build a small iPhone app written in Swift with a few screens and a login.")[1])
check("a tool named in the text is filled in even when its meaning is far away (QuickBooks)", "QuickBooks" in suggest("Help with my books", "accounting", "Please keep my books up to date every week in QuickBooks.")[1])
filled = suggest("Video edition for our event", "video-editing", "We need video edition of our company anniversary event, around 5 minutes.")[1]
check("the words of a skill in another form are found: 'video edition' fills in Video Editing", "Video Editing" in filled, str(filled))
filled = suggest("Kailangan ng video editor para sa kasal", "video-editing", "Kailangan namin ng mag-eedit ng video ng kasal namin, mga 3 minutes na highlight.")[1]
check("Filipino words are read: 'video ng kasal' fills in Wedding Video Editing", "Wedding Video Editing" in filled, str(filled))
check("...and swapped as whole words only ('mag-eedit' -> 'edit', 'sari-sari' and English words stay)", skills._english("Mag-eedit ng video, sari-sari store, Kasal") == "edit ng video, sari-sari store, wedding")
filled = suggest("Videographer for a birthday party", "video-editing", "Shoot and edit a video of my daughter's 7th birthday party at a restaurant.")[1]
check("another name of a skill counts for its meaning: 'videographer' fills in Event Videography", "Event Videography" in filled, str(filled))
filled = suggest("Book my flights and hotels", "virtual-assistant", "Find and book cheap flights and hotels for a family trip to Japan.")[1]
check("the skill closest in meaning is filled in even without its words (Travel Booking)", filled[:1] == ["Travel Booking"], str(filled))
check("word forms: 'editing', 'edition', 'editor' and 'edited' are one word; 'tutor' and 'tutoring' too",
      len({tuple(skills._word_forms(w)) for w in ("editing", "edition", "editor", "edited")}) == 1 and skills._same_word(*skills._word_forms("tutor tutoring")))
check("word forms: 'web' starts 'website', but a 2-letter word must be the same ('ad' is not 'admin')", skills._same_word("web", "website") and not skills._same_word("ad", "admin"))

# --- 4. Tidying a skill the client typed -------------------------------------
tidy = {
    "photoshop": "Adobe Photoshop", "PHOTOSHOP": "Adobe Photoshop", "vid editng": "Video Editing", "logo desing": "Logo Design",
    "wordpres": "WordPress", "node js": "Node.js", "Node.js": "Node.js", "react": "React", "java script": "JavaScript",
    "ms excel": "Microsoft Excel", "facbook ads": "Facebook Ads", "fb ads": "Facebook Ads", "Python3": "Python",
    "film editing": "Video Editing", "data analytics": "Data Analysis", "Bookkeping": "Bookkeeping", "copywritting": "Copywriting",
    "Kotln": "Kotlin", "Lazada store": "Online Store Management", "Public Speaking": "Public Speaking Coaching",
}
for typed, standard in tidy.items():
    check(f"typed '{typed}' becomes '{standard}'", skills.match_skill(typed) == standard, str(skills.match_skill(typed)))
stay = ["Origami", "Tagalog", "C++", "Cooking", "tiktok", "accounting software", "marketing", "writing", "design", "video", "go", "Zero", "ui", "Shopee"]
for typed in stay:
    check(f"typed '{typed}' is left as typed", skills.match_skill(typed) is None, str(skills.match_skill(typed)))
check("'Java' stays Java (it is a skill of its own, not a typo of JavaScript)", skills.match_skill("Java") == "Java")
check("'Sales' and 'Xero' keep their names (short words are never 'fixed')", skills.match_skill("Sales") == "Sales" and skills.match_skill("Xero") == "Xero")
check("an empty or blank skill is not a match", skills.match_skill("") is None and skills.match_skill("   ") is None)

# --- 5. The two endpoints ----------------------------------------------------
import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(main.app)
real_login_check = main.get_user_id

response = client.post("/skills/suggest", json={"title": "Logo", "category": "graphic-design", "description": "A logo please, for my shop"})
check("/skills/suggest without a login is refused (401)", response.status_code == 401, str(response.status_code))
response = client.post("/skills/match", json={"text": "photoshop"})
check("/skills/match without a login is refused (401)", response.status_code == 401, str(response.status_code))

main.get_user_id = lambda authorization: "a-user"  # the login check is the only thing replaced
headers = {"Authorization": "Bearer made-up"}
response = client.post("/skills/suggest", headers=headers, json={"title": JOBS[0][0], "category": "graphic-design", "description": JOBS[0][2]})
check("/skills/suggest answers {skills: [...], more: [...]} with the right skill filled in first",
      response.status_code == 200 and response.json()["skills"][:1] == ["Logo Design"] and isinstance(response.json()["more"], list), response.text[:120])
response = client.post("/skills/suggest", headers=headers, json={"title": JOBS[0][0], "category": "graphic-design", "description": JOBS[0][2], "have": ["Logo Design"]})
check("/skills/suggest leaves out the skills in 'have'", response.status_code == 200 and "Logo Design" not in response.json()["skills"] + response.json()["more"], response.text[:120])
response = client.post("/skills/suggest", headers=headers, json={"title": "Hi", "category": "other", "description": "x"})
check("/skills/suggest with too little text answers empty lists", response.status_code == 200 and response.json() == {"skills": [], "more": []}, response.text[:120])
response = client.post("/skills/suggest", headers=headers, json={"title": "Logo " * 200, "category": "nonsense-category", "description": "A logo for my shop " * 500, "have": ["x"] * 100})
check("very long text and an unknown category don't break it", response.status_code == 200 and isinstance(response.json()["skills"], list), response.text[:120])
response = client.post("/skills/match", headers=headers, json={"text": "vid editng"})
check("/skills/match answers the standard name", response.status_code == 200 and response.json() == {"skill": "Video Editing"}, response.text[:120])
response = client.post("/skills/match", headers=headers, json={"text": "Origami"})
check("/skills/match answers null for a skill it doesn't know", response.status_code == 200 and response.json() == {"skill": None}, response.text[:120])
response = client.post("/skills/match", headers=headers, json={"text": "  "})
check("/skills/match with blank text answers null", response.status_code == 200 and response.json() == {"skill": None}, response.text[:120])
response = client.post("/skills/match", headers=headers, json={})
check("/skills/match without the text field is a 422, not a crash", response.status_code == 422, str(response.status_code))
main.get_user_id = real_login_check

print(f"\n{sum(results)}/{len(results)} passed")
sys.exit(0 if all(results) else 1)
