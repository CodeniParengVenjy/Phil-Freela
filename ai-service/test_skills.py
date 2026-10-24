"""Checks the AI part of Post What You Need: skills.py (the skills it suggests
for a job post and the tidying of a typed skill) and its two endpoints in
main.py. It uses the real pretrained model (text_embedder.py) but no database:
the endpoint checks replace the login check. From the ai-service folder, run:

    python test_skills.py

(the service's own virtual environment is fine). Every check prints PASS or
FAIL, and the script exits with 1 if any check failed.

The made-up job posts are what the numbers in skills.py were chosen from:
each has the skills a sensible person would expect, and the checks say how
many of them must be among the six suggested.
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
JOBS = [
    ("Hiring a logo designer for our cafe business", "graphic-design", "We are opening a coffee shop in Cebu and need a modern logo with brand colors. Please share samples of your past logo work.", ["Logo Design"], ["Brand Identity"]),
    ("Edit our wedding highlight video", "video-editing", "I have 2 hours of raw footage from our wedding. I need a 4 minute highlight video with music, color grading and nice transitions.", ["Wedding Video Editing", "Video Editing", "Color Grading"], []),
    ("React developer for a small online shop", "web-development", "We need product pages, a shopping cart and an admin page built in React with a Node.js backend and a REST API.", ["React", "Node.js", "REST APIs"], ["E-commerce Website"]),
    ("Virtual assistant for emails and scheduling", "virtual-assistant", "Looking for a reliable VA to manage my inbox, book appointments and handle my calendar every day for 4 hours.", ["Virtual Assistance", "Email Management", "Calendar Management"], []),
    ("Translate a legal contract from Tagalog to English", "translation", "A 12 page contract has to be translated carefully from Tagalog to English.", ["Tagalog Translation", "Legal Translation", "Translation"], []),
    ("Product photos for my online store", "photography", "I sell handmade soap and need clean photos of 20 items on a white background, edited and ready for Shopee.", ["Product Photography", "Photo Editing", "Background Removal"], []),
    ("Social media manager for a restaurant", "social-media", "Manage our Facebook and Instagram pages: three posts per week, reels, stories, and replies to comments and messages.", ["Social Media Management", "Facebook Page Management", "Instagram Management"], []),
    ("Monthly bookkeeper using QuickBooks", "accounting", "We need someone to record transactions, do bank reconciliation and prepare monthly financial statements in QuickBooks Online.", ["Bookkeeping", "QuickBooks", "Bank Reconciliation", "Financial Statements"], []),
    ("Tagalog voice over for a radio ad", "audio-music", "30 second radio commercial for our hardware store, warm friendly male voice in Tagalog.", ["Voice Over", "Tagalog Voice Over", "Radio Ads"], []),
    ("Math tutor for a grade 8 student", "tutoring", "My son needs help with algebra and geometry twice a week over Zoom.", ["Math Tutoring", "Online Tutoring"], ["High School Tutoring"]),
    ("Flutter app for a delivery business", "mobile-development", "We want an Android and iOS app where customers order food and track the rider on a map.", ["Flutter", "Mobile App Development"], []),
    ("SEO blog articles for a dental clinic", "copywriting", "Write 8 blog articles about dental care, optimized for search with keywords.", ["SEO Writing", "Blog Writing", "Content Writing"], []),
    ("3D render of a perfume bottle", "animation-3d", "Create a realistic 3D model and render of our perfume bottle in Blender for our ads.", ["3D Modeling", "Blender", "3D Rendering"], ["Product Visualization"]),
    ("UI design for a fitness app in Figma", "ui-ux-design", "Design the screens of a workout tracking mobile app, with a clickable prototype and a design system.", ["UI Design", "Figma", "Prototyping", "Mobile App Design"], []),
    ("Chat support agent, night shift", "customer-support", "Answer customer chats and emails for our online store using Zendesk. Night shift, US hours.", ["Chat Support", "Customer Support", "Zendesk"], []),
    ("Clean up a customer list in Excel", "data-entry", "I have 5000 rows with duplicates and mistakes that need cleaning in Excel and Google Sheets.", ["Data Cleaning", "Microsoft Excel"], []),
    ("Facebook ads for my online clothing shop", "digital-marketing", "Set up and run Facebook and Instagram ads to get more orders and leads, with a monthly report.", ["Facebook Ads"], ["Digital Marketing"]),
    ("Poster for our school fair", "graphic-design", "Make an attractive poster and a few social media posts for our school fair using Canva.", ["Poster Design", "Canva"], ["Social Media Graphics"]),
    ("Podcast editor for weekly episodes", "audio-music", "Remove background noise and filler words, add intro music and export each weekly episode.", ["Podcast Editing"], ["Audio Editing"]),
    ("Animated explainer video for my app", "animation-3d", "A 60 second animated explainer with voice over and simple 2D characters.", ["Explainer Animation", "2D Animation"], []),
    ("WordPress website for a small clinic", "web-development", "Build a 5 page website with booking form and contact page using WordPress and Elementor.", ["WordPress", "Web Development"], []),
    ("Resume and cover letter writing", "copywriting", "I am applying for nursing jobs abroad and need a polished resume and cover letter.", ["Resume Writing"], []),
    ("Jingle for our bakery", "audio-music", "A catchy 20 second jingle with lyrics about our bakery.", ["Jingle Writing"], ["Songwriting"]),
    ("Shopee store assistant", "virtual-assistant", "Upload new products, update prices and stock, and answer buyer questions on our Shopee and Lazada stores.", ["Online Store Management", "Product Listing"], []),
    ("Payroll and BIR filing", "accounting", "Compute payroll for 15 employees and file monthly BIR forms and SSS, PhilHealth and Pag-IBIG contributions.", ["Payroll Processing", "BIR Tax Filing", "Government Contributions"], []),
    ("Photographer for a debut", "photography", "Photos for an 18th birthday party with a studio shoot and an event coverage.", ["Event Photography", "Photography"], []),
    ("Python script to scrape product prices", "web-development", "I need a Python script that scrapes prices from several websites into a spreadsheet every day.", ["Python", "Web Scraping"], []),
    ("English tutor for Korean kids", "tutoring", "Teach conversational English online to kids from Korea, 30 minute classes in the evening.", ["English Tutoring", "Online Tutoring"], ["ESL Teaching"]),
    ("Add subtitles to my YouTube videos", "video-editing", "I need English subtitles added to 10 short YouTube videos and a simple intro animation.", ["Video Subtitles", "YouTube Video Editing"], []),
    ("Pitch deck design for investors", "graphic-design", "Design a clean 12 slide investor presentation in PowerPoint using our brand colors.", ["Presentation Design"], []),
    ("Event coordinator for a wedding", "other", "Plan and coordinate our wedding day, from suppliers to the program.", ["Event Planning"], []),
    ("App tester for bugs", "other", "Test our mobile app on different phones and report bugs with clear steps.", ["Quality Assurance Testing"], []),
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

# --- 2. Suggestions on made-up job posts -------------------------------------
found = wanted = 0
for title, category, description, must, nice in JOBS:
    got = skills.suggest_skills(title, category, description)
    check(f"'{title[:38]}': suggests {must}", all(skill in got for skill in must), f"got {got}")
    check(f"'{title[:38]}': at most 6 suggestions, no repeats", len(got) <= 6 and len(set(got)) == len(got), str(got))
    found += sum(skill in got for skill in must + nice)
    wanted += len(must) + len(nice)
check(f"over all the made-up posts, 85% or more of the expected skills are suggested ({found} of {wanted})", found / wanted >= 0.85)
check("a post about something we have no skill for (walking a dog) gets no suggestions", skills.suggest_skills("Walk my dog", "other", "I need someone to walk my dog every morning in my village.") == [])
check("too little text still answers (an empty list, no error)", skills.suggest_skills("Hi", "other", "") == [])

# --- 3. Rules inside the suggestions ------------------------------------------
logo = skills.suggest_skills("Hiring a logo designer for our cafe business", "graphic-design", JOBS[0][2], have=["Logo Design"])
check("a skill the post already has is not suggested again", "Logo Design" not in logo and len(logo) > 0, str(logo))
check("...even written another way ('logo design' in small letters)", "Logo Design" not in skills.suggest_skills(JOBS[0][0], "graphic-design", JOBS[0][2], have=["logo design"]))
swift_job = ("Need a swift reply", "photography", "Please send a swift reply, I have a notion that you can shoot photos of our event quickly.")
check("everyday words ('swift', 'notion') don't count as the skills Swift and Notion in a photography job", not {"Swift", "Notion"} & set(skills.suggest_skills(*swift_job)), str(skills.suggest_skills(*swift_job)))
check("...but 'Swift' in an iOS job does", "Swift" in skills.suggest_skills("iOS app in Swift", "mobile-development", "Build a small iPhone app written in Swift with a few screens and a login."))
check("a tool named in the text is suggested even when its meaning is far away (QuickBooks)", "QuickBooks" in skills.suggest_skills("Help with my books", "accounting", "Please keep my books up to date every week in QuickBooks."))

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
check("/skills/suggest answers {skills: [...]} with the right skill first", response.status_code == 200 and response.json()["skills"][:1] == ["Logo Design"], response.text[:120])
response = client.post("/skills/suggest", headers=headers, json={"title": JOBS[0][0], "category": "graphic-design", "description": JOBS[0][2], "have": ["Logo Design"]})
check("/skills/suggest leaves out the skills in 'have'", response.status_code == 200 and "Logo Design" not in response.json()["skills"], response.text[:120])
response = client.post("/skills/suggest", headers=headers, json={"title": "Hi", "category": "other", "description": "x"})
check("/skills/suggest with too little text answers an empty list", response.status_code == 200 and response.json() == {"skills": []}, response.text[:120])
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
