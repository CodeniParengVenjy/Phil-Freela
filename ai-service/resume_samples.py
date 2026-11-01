"""Made-up resumes and other documents that resume_check.py is measured on
(test_resume_check.py). Every name, email, phone number and school here is
invented. Each text is what a PDF or Word file's text looks like after it is
read: one line per line, headings in the middle of other text.

SET A is what the numbers in resume_check.py were chosen from. SET B was
written AFTER those numbers were fixed, in other styles and fields, and shows
how the check does on files it has never seen. Each set has resumes (people
must be able to send them) and others (documents that must be stopped or at
least not called a resume).
"""

# ============================ SET A: the numbers were chosen from these ============================

A_RESUMES = {
    "designer": """MARIA CRISTINA SANTOS
Graphic Designer | Brand Identity and Packaging
Cebu City, Philippines | 0918 555 0142 | maria.santos.sample@example.com | behance.net/mariasantos-sample
PROFILE
Detail-oriented graphic designer with four years of experience creating logos, packaging labels and social media graphics for food and retail businesses.
EXPERIENCE
Senior Graphic Designer - Cebu Sweets Co., Cebu City
March 2021 - Present
Lead the design of product labels and seasonal packaging for 25 products.
Prepare print-ready files and work with local printers on color and size.
Graphic Designer - Island Print House, Mandaue
June 2019 - February 2021
Designed tarpaulins, brochures and menus for small businesses.
EDUCATION
Bachelor of Fine Arts in Visual Communication, University of Cebu Sample, 2015 - 2019
SKILLS
Adobe Illustrator, Adobe Photoshop, InDesign, Canva, Logo Design, Brand Identity, Packaging Design, Typography
CERTIFICATIONS
Packaging Design Fundamentals (online), 2022""",

    "classic_filipino": """RESUME
Name: JUAN PAOLO REYES
Address: 123 Sampaguita Street, Barangay San Isidro, Quezon City
Contact No.: 0917 123 0000
Email Address: juanpaolo.reyes.sample@example.com
OBJECTIVE
To secure a position in a company where I can use my skills and grow professionally.
EDUCATIONAL BACKGROUND
Tertiary: Bachelor of Science in Information Technology, Sample State University, 2018 - 2022
Secondary: San Isidro National High School, 2014 - 2018
Primary: San Isidro Elementary School, 2008 - 2014
WORK EXPERIENCE
Student Intern, IT Department, City Hall of Sampaguita, January 2022 - April 2022
Assisted in repairing computers and installing software.
PERSONAL INFORMATION
Date of Birth: May 5, 2000
Place of Birth: Quezon City
Civil Status: Single
Citizenship: Filipino
Religion: Roman Catholic
SEMINARS ATTENDED
Basic Cybersecurity Seminar, 2021
CHARACTER REFERENCES
Available upon request.""",

    "developer": """Angelo M. Dizon
Full-Stack Developer
Davao City | angelo.dizon.sample@example.com | +63 917 555 0199 | github.com/angelodizon-sample
SUMMARY
Developer with three years of experience building web apps with React and Node.js. I like clean code, short feedback loops and shipping on time.
TECHNICAL SKILLS
JavaScript, TypeScript, React, Node.js, Python, PostgreSQL, MongoDB, Git, Docker, REST APIs
EXPERIENCE
Web Developer, Mindanao Digital Studio (2022 - Present)
- Built an online booking system used by 40 resorts.
- Reduced page load time by 45% by optimizing images and queries.
Junior Developer, Freelance (2021 - 2022)
- Delivered 12 websites for local shops using WordPress and React.
PROJECTS
Barangay Queue App: a queue and appointment system with SMS reminders.
EDUCATION
BS Computer Science, Sample Mindanao University, 2017 - 2021""",

    "virtual_assistant": """Patricia Anne Lim
Virtual Assistant | Customer Support | Admin Support
Pasig City | pat.lim.sample@example.com | 0927 555 0111
PROFESSIONAL SUMMARY
Reliable virtual assistant with 5 years of experience in email management, scheduling, data entry and chat support for clients in Australia and the US.
CORE COMPETENCIES
Calendar management, inbox management, data entry, Google Workspace, Notion, Zendesk, customer support, bookkeeping basics
EMPLOYMENT HISTORY
Virtual Assistant, Aussie Home Services (Remote) - 2021 to Present
Manage the owner's calendar, invoices and customer emails.
Customer Support Representative, Sample BPO Inc. - 2019 to 2021
Handled 60 chats and emails per day with a 95% satisfaction score.
EDUCATION
Bachelor of Science in Business Administration, Sample College of Manila, 2014 - 2018
LANGUAGES
English, Filipino""",

    "video_editor": """KENNETH TAN
Video Editor and Motion Designer
Cagayan de Oro | kenneth.tan.sample@example.com | 0916 555 0177 | portfolio.example.com/kenneth
WORK HISTORY
Freelance Video Editor (June 2020 - Present)
Edited wedding highlights, YouTube videos and TikTok ads for over 60 clients.
Video Editor, Northern Mindanao Media (2018 - 2020)
Edited news segments and promo videos.
SKILLS
Adobe Premiere Pro | After Effects | DaVinci Resolve | CapCut | Color Grading | Motion Graphics | Sound Design
EDUCATION
BA in Broadcasting, Sample Xavier College, 2014 - 2018
ACHIEVEMENTS
Best Short Film Editing, Regional Student Film Festival, 2017""",

    "writer": """Rhea Villanueva
Content Writer and Copywriter
rhea.villanueva.sample@example.com  |  0919 555 0123  |  Iloilo City
About me
I write blog posts, product descriptions and email newsletters for small online shops. I research the topic first and I always meet the deadline.
Experience
Content Writer, Visayas Home Goods (2021 - 2024): wrote 200+ product pages and 30 blog posts that raised organic traffic by 60%.
Freelance Copywriter (2019 - 2021): wrote ads and landing pages for 15 clients.
Education
AB English, Sample University of the Visayas, 2015 - 2019
Skills
SEO writing, copywriting, proofreading, WordPress, Canva, Mailchimp""",

    "short": """JOSE RAMOS
Photographer
Contact: 0915 555 0100, jose.ramos.sample@example.com
Experience: Event photographer, 2020 - Present (weddings, birthdays, corporate events).
Skills: Photography, Lightroom, Photoshop.
Education: Senior High School, Sample Academy, 2018""",

    "academic_cv": """CURRICULUM VITAE
Dr. Teresita B. Cruz
Department of Biology, Sample State University, Manila
Email: teresita.cruz.sample@example.com | Phone: +63 2 8555 0123
EDUCATION
PhD in Biology, Sample Institute of Science, 2012 - 2016
MS in Biology, Sample State University, 2009 - 2011
BS Biology, Sample State University, 2005 - 2009
ACADEMIC APPOINTMENTS
Associate Professor, Department of Biology, 2019 - Present
Assistant Professor, Department of Biology, 2016 - 2019
PUBLICATIONS
Cruz, T. (2021). Mangrove recovery in Manila Bay. Journal of Sample Biology, 12(3), 45-60.
Cruz, T. and Lopez, A. (2018). Fish diversity in coastal waters. Philippine Science Letters, 9(1), 1-14.
GRANTS AND AWARDS
Research grant, Sample Science Council, 2020
TEACHING
General Biology, Ecology, Research Methods
REFERENCES
Available upon request.""",

    "taglish": """Ana Marie Bautista
Contact: 0928 555 0166 | ana.bautista.sample@example.com | Taguig City
LAYUNIN (Objective)
Makahanap ng trabaho na magagamit ko ang aking kakayahan sa pag-edit ng litrato at video.
KARANASAN SA TRABAHO (Work Experience)
Photo Editor, Sample Studio, Taguig - 2021 hanggang 2024
Nag-edit ng mahigit 3,000 na litrato para sa kasal at debut.
EDUKASYON
Senior High School, Sample National High School, 2017 - 2019
MGA KASANAYAN
Adobe Photoshop, Lightroom, video editing, Canva""",

    "no_headings": """Hello, I'm Paolo Mendoza, a freelance 3D artist from Bacolod. I have been making 3D models and animations since 2019 using Blender and ZBrush. Before freelancing I worked at Sample Games Studio from 2019 to 2022 where I modeled characters and props for two mobile games. I studied Multimedia Arts at Sample Negros College from 2015 to 2019. I can also do texturing and rigging. You can reach me at paolo.mendoza.sample@example.com or 0917 555 0155.""",

    "two_columns": """CONTACT SKILLS Ellaine Joy Navarro
0917 555 0188 Customer service Sales Representative
ellaine.navarro.sample@example.com Data entry 2020 - 2023 Sample Retail Corp
Makati City Microsoft Excel Handled 80 customers a day
EDUCATION Communication EXPERIENCE
BS Business Administration Cashier, Sample Mart 2018 - 2020
Sample College, 2014 - 2018 Counted and balanced the daily sales
LANGUAGES REFERENCES
English, Filipino Available upon request""",

    "tutor": """RESUME OF MARIEL ANDRADA
Licensed Professional Teacher
Address: Naga City, Camarines Sur | Mobile: 0929 555 0133 | Email: mariel.andrada.sample@example.com
Summary of Qualifications
Licensed teacher with two years of tutoring experience in English and Math for elementary and high school students.
Work Experience
Online English Tutor - Sample Tutoring Hub, 2022 - Present
Private Tutor, Naga City, 2021 - 2022
Educational Attainment
Bachelor of Secondary Education major in English, Sample Bicol University, 2016 - 2020
Licensure Examination for Teachers, Passer, 2021
Trainings and Seminars
Teaching English as a Second Language Workshop, 2022
Skills
Lesson planning, classroom management, Google Classroom, Zoom""",
}

A_OTHERS = {
    "invoice": """INVOICE
Invoice No: 2026-0042
Date: October 12, 2026
Bill To: Tala Coffee Shop, 45 Mabini Street, Quezon City
Description Quantity Unit Price Amount
Logo design (2 concepts) 1 3,500.00 3,500.00
Menu board layout 1 1,500.00 1,500.00
Total amount due: PHP 5,000.00
Payment terms: 50% down payment, balance upon delivery. GCash: 0917 555 0001
Thank you for your business.
Questions? Email billing.sample@example.com""",

    "receipt": """OFFICIAL RECEIPT
Received from Bea Mendoza the amount of One Thousand Five Hundred Pesos (PHP 1,500.00)
as payment for menu board design.
Reference number: GC-2026-883412
Date: October 20, 2026
Payment method: GCash
Received by: Miguel Dela Cruz
Thank you for your payment.""",

    "contract": """SERVICE AGREEMENT
This agreement is made on October 5, 2026 between Tala Coffee Shop (the Client) and Miguel Dela Cruz (the Freelancer).
1. Scope of Work. The Freelancer will design a logo and a brand kit consisting of colors and fonts.
2. Payment. The Client will pay PHP 8,000, half upon signing and half upon delivery of the final files.
3. Revisions. The agreement includes two rounds of revisions.
4. Confidentiality. Both parties agree to keep project information private.
5. Termination. Either party may end this agreement with written notice of seven days.
Signed: ______________________ (Client)    ______________________ (Freelancer)""",

    "cover_letter": """Dear Hiring Manager,
I am writing to apply for the Graphic Designer position posted on your website. I have three years of experience designing logos and social media graphics, and I believe my background makes me a strong candidate.
In my current role at Sample Design Studio, I create brand materials for small businesses. I am confident that I can bring the same care and creativity to your team.
Thank you for your time and consideration. I look forward to hearing from you.
Sincerely,
Carla Mae Domingo
carla.domingo.sample@example.com
0917 555 0120""",

    "job_post": """GRAPHIC DESIGNER NEEDED
We are a small coffee company in Quezon City and we are looking for a graphic designer to join our team.
Responsibilities
Design menus, posters and social media posts every week.
Prepare print-ready files.
Requirements
At least 1 year of experience in graphic design
Skills in Adobe Illustrator, Photoshop or Canva
Good communication
Benefits
Flexible schedule, 13th month pay
How to apply: send your portfolio to careers.sample@example.com""",

    "certificate": """CERTIFICATE OF COMPLETION
This is to certify that
JOHN MICHAEL TORRES
has successfully completed the course
BASIC WEB DEVELOPMENT
given by Sample Training Center on September 14, 2026
Awarded this 20th day of September 2026 in Manila, Philippines.
Director: ______________________""",

    "essay": """The Importance of Reading in the Digital Age
Reading is one of the most important skills a student can have. In this essay, I will discuss why reading still matters even though we now have videos and social media.
First, reading improves our vocabulary. When we read books, we meet new words and learn how to use them. Second, reading helps us think. A book asks us to imagine and to understand other people.
In conclusion, reading remains important in the digital age. Students should read every day, even for ten minutes.""",

    "menu": """KAPE TALA MENU
Brewed Coffee 80
Cafe Latte 120
Cappuccino 120
Iced Spanish Latte 140
Hot Chocolate 110
Ensaymada 60
Banana Bread 70
Ham and Cheese Sandwich 95
Open daily 7am to 9pm. Order through GCash or cash.""",

    "recommendation": """To Whom It May Concern:
I am pleased to recommend Ms. Lorna Pascual, who worked under my supervision as a bookkeeper at Sample Trading from 2020 to 2024. She was always on time and handled our accounts with honesty and care.
I am confident that she will be an asset to any organization. Please feel free to contact me for more information.
Respectfully yours,
Engr. Ricardo Salazar
General Manager, Sample Trading""",

    "case_study": """Case Study: Rebranding Kape Alon
The Client
Kape Alon is a small coffee shop in Cebu with a loyal local following but an outdated look.
The Problem
The owner wanted a fresh identity that would work on cups, signs and social media.
The Process
I started with interviews and mood boards, then sketched five logo directions in Illustrator. After feedback we chose a wave-inspired mark in teal and cream.
The Result
Sales of packaged coffee rose by 20% in three months after the new packaging launched.
Tools: Adobe Illustrator, Photoshop, Figma""",

    "minutes": """MEETING MINUTES
Date: October 8, 2026
Attendees: Ana, Ben, Carlo, Dina
Agenda: 1. Website update 2. Event schedule 3. Budget
Discussion: The team agreed to launch the new page on October 20. Ben will prepare the photos.
Action items: Carlo to confirm the venue; Dina to send the budget by Friday.
Next meeting: October 15""",

    "terms": """Terms of Service
By using this website you agree to these terms. We may update them at any time.
1. Accounts. You are responsible for keeping your password safe.
2. Content. You own the content you post, and you allow us to display it on the site.
3. Prohibited use. Do not post illegal, harmful or misleading material.
4. Privacy. We collect only the information needed to run the service, as explained in our Privacy Policy.
5. Contact. Questions about these terms can be sent to legal.sample@example.com.""",
}


# ============================ SET B: written after the numbers were fixed ============================
# Other fields and other styles than set A, written without looking at how the
# check scores them.

B_RESUMES = {
    "nurse": """NURSING RESUME
Kristine Joy Alcantara, RN
Block 5 Lot 8, Greenfields Subdivision, Antipolo City
Mobile: 0917 555 0210   Email: kristine.alcantara.sample@example.com
CAREER OBJECTIVE
To work as a staff nurse in a hospital where I can give safe and compassionate care to patients.
LICENSURE
Registered Nurse, Professional Regulation Commission, passed November 2021
CLINICAL EXPERIENCE
Staff Nurse, Sample Medical Center, Marikina City (February 2022 - Present)
Medical-surgical ward, 20 patients per shift. Give medicines, take vital signs, assist the doctors.
Student Nurse, Sample General Hospital, 2020 - 2021
EDUCATION
Bachelor of Science in Nursing, Sample University of Rizal, 2017 - 2021
TRAININGS
Basic Life Support, 2021
IV Therapy, 2022
CHARACTER REFERENCES
Provided upon request.""",

    "accountant": """RODRIGO P. MANALO, CPA
Makati City | rodrigo.manalo.sample@example.com | +63 917 555 0245
PROFESSIONAL PROFILE
Certified public accountant with six years of experience in bookkeeping, payroll and BIR filing for small and medium businesses.
WORK EXPERIENCE
Senior Accountant, Sample Trading Corporation        2021 - Present
Prepare monthly financial statements and tax returns for four companies.
Accountant, Sample Audit Firm        2018 - 2021
Handled audit of 15 clients and their year-end reports.
EDUCATION
Bachelor of Science in Accountancy, Sample University of Manila, 2013 - 2017
SKILLS
QuickBooks, Xero, Microsoft Excel, payroll, bookkeeping, tax compliance
LICENSES
Certified Public Accountant, 2018""",

    "call_center": """CHARMAINE DELA ROSA
Contact number: 0926 555 0177
Email: charmaine.delarosa.sample@example.com
Address: Cavite
SKILLS SUMMARY
Good communication skills, typing 55 wpm, can work night shift, knows basic computer
EMPLOYMENT RECORD
Customer Service Representative, Sample BPO Solutions, Cavite (2022 - 2024)
Handled calls from US customers, solved billing problems, met quality targets
Service Crew, Sample Burger, 2020 - 2021
EDUCATIONAL ATTAINMENT
College level - BS Hotel and Restaurant Management, Sample College, 2018 - 2020
Senior High School graduate, 2018
I hereby certify that the above information is true and correct.""",

    "architect": """Engr. Arch. Noel S. Gutierrez
Architect and CAD Draftsman
Baguio City, Philippines
noel.gutierrez.sample@example.com / 0915 555 0188
Work Experience
Junior Architect, Sample Design and Build, Baguio City - July 2021 to present
Produce floor plans, elevations and 3D renders for houses and small commercial buildings.
CAD Draftsman, Sample Engineering, 2019 - 2021
Software Proficiency
AutoCAD, SketchUp, Revit, Lumion, Adobe Photoshop, Microsoft Office
Projects Handled
Two-storey residence, Baguio City, 180 sqm
Mini cafe renovation, La Trinidad
Education
Bachelor of Science in Architecture, Sample Cordillera University, 2014 - 2019
Licenses
Registered Architect, 2020""",

    "social_media": """Hi, I'm Bianca Reyes
Social Media Manager | Content Creator
bianca.reyes.sample@example.com | 0918 555 0144 | instagram.com/biancareyes-sample
What I do
I manage Facebook and Instagram pages for small brands: content calendars, posts, reels and monthly reports.
Experience
Social Media Manager, Sample Skincare (2022 - now) - grew the page from 2k to 40k followers
Content Creator, freelance (2020 - 2022) - made 150+ reels for 8 clients
Tools I use
Canva, CapCut, Meta Business Suite, Notion, Google Analytics
Education
BS Mass Communication, Sample University, 2016 - 2020""",

    "voice_actor": """JAMES PORTILLO - VOICE ACTOR
Studio-quality home recording | Filipino and English
james.portillo.sample@example.com | 0919 555 0190 | demo reel: portfolio.example.com/james
VOICE OVER EXPERIENCE
Radio ads and TV commercials for local brands, 2019 - present
Audiobook narration (English), 12 titles, 2021 - 2023
E-learning narration for companies, 2020 - present
TRAINING
Voice Acting Workshop, Sample Media Arts, 2019
Home Studio Recording Course (online), 2020
SOFTWARE AND EQUIPMENT
Audacity, Adobe Audition, condenser microphone, sound booth""",

    "fresh_grad": """ERIKA NICOLE BAUTISTA
Sta. Rosa, Laguna | 0917 555 0201 | erika.bautista.sample@example.com
CAREER OBJECTIVE
A fresh graduate looking for an entry-level marketing job where I can learn and contribute.
ACADEMIC BACKGROUND
Bachelor of Science in Business Administration major in Marketing
Sample University of Laguna, 2019 - 2023
Graduated with honors (Cum Laude)
ORGANIZATIONS
Marketing Society, Vice President, 2022 - 2023
Student Council, Committee Member, 2021 - 2022
AWARDS
Dean's Lister, 2019 to 2023
SKILLS
MS Office, Canva, social media posting, public speaking, teamwork""",

    "translator": """LORENZO FERRER
Translator and Interpreter (Filipino, English, Spanish)
Quezon City | lorenzo.ferrer.sample@example.com | +63 928 555 0112
LANGUAGES
Filipino (native), English (fluent), Spanish (intermediate, DELE B2)
PROFESSIONAL EXPERIENCE
Freelance Translator, 2018 - Present: translated 400,000 words of legal, travel and marketing documents.
In-house Translator, Sample Translation Agency, 2016 - 2018
CERTIFICATIONS
DELE B2 Spanish, Instituto Cervantes, 2017
EDUCATION
AB Literature, Sample University of the Philippines Campus, 2012 - 2016
TOOLS
Trados, memoQ, Google Docs, proofreading""",
}

B_OTHERS = {
    "bank_statement": """SAMPLE BANK - STATEMENT OF ACCOUNT
Account name: JUAN P. REYES   Account no.: 0012-3456-7890
Statement period: September 1 - September 30, 2026
Date Description Debit Credit Balance
09/02 Salary credit 25,000.00 31,200.00
09/05 ATM withdrawal 3,000.00 28,200.00
09/12 GCash cash in 1,500.00 26,700.00
09/20 Electric bill payment 2,350.00 24,350.00
Ending balance: 24,350.00
For inquiries, call our hotline or visit any branch.""",

    "lesson_plan": """DETAILED LESSON PLAN IN ENGLISH 7
I. Objectives
At the end of the lesson, the students should be able to identify the main idea of a paragraph, write a short summary, and show cooperation in group work.
II. Subject Matter
Topic: Finding the Main Idea. Materials: short story, manila paper, markers.
III. Procedure
A. Motivation: Show a picture and ask the class what they see.
B. Activity: Group reading and summary writing.
C. Assessment: 5-item quiz.
IV. Assignment
Read the next story and write its main idea.""",

    "recipe": """Pork Adobo
Serves 4. Cooking time: 45 minutes.
Ingredients: 1 kg pork belly, 1/2 cup soy sauce, 1/3 cup vinegar, 6 cloves garlic, 2 bay leaves, 1 teaspoon whole peppercorns, 1 cup water.
Instructions: Combine everything in a pot. Bring to a boil, then simmer for 40 minutes until the pork is tender. Fry the pork pieces until golden if you like, then pour the sauce over. Serve with hot rice.""",

    "flyer": """GRAND OPENING!
Sampaguita Pet Shop opens this Saturday, November 14, in Antipolo City.
Free dog treats for the first 50 customers
Up to 30% off on pet food and accessories
Free grooming demo at 2:00 PM
Follow us on Facebook for more promos. See you there!""",

    "news": """Heavy rains expected in Luzon this weekend
MANILA - The weather bureau said on Thursday that a low pressure area is expected to bring heavy rains to parts of Luzon over the weekend. Residents in low-lying areas were advised to prepare for possible flooding. Local governments have started to check evacuation centers and ready relief goods, officials said. Classes in some towns may be suspended depending on the weather on Friday.""",

    "company_job_description": """About Sample Logistics
Sample Logistics is a growing delivery company with branches in Luzon and Visayas.
Position: Operations Supervisor
Job Summary: The Operations Supervisor manages daily dispatch and a team of 12 riders and coordinators.
Responsibilities: Monitor deliveries, handle customer complaints, prepare daily reports, train new riders.
Qualifications: Bachelor's degree in any course, at least 2 years of experience in logistics or operations, good leadership and communication skills, proficient in Microsoft Excel.
We offer: competitive salary, HMO, 13th month pay.
Interested applicants may send their resume to hr.sample@example.com.""",

    "service_offer": """I will design a professional logo for your business
About this service
Hello! I am a graphic designer with 4 years of experience. I will create a unique and modern logo for your brand, with unlimited revisions until you are happy.
What you get: 3 logo concepts, source files (AI, PSD), transparent PNG, social media kit.
Delivery time: 3 days.
Why choose me? Fast replies, clean work, 100% original designs.
Tools: Adobe Illustrator, Photoshop, Figma. Message me before ordering.""",

    "barangay_form": """REPUBLIC OF THE PHILIPPINES
BARANGAY CLEARANCE APPLICATION FORM
Name: _______________________  Age: ____  Sex: ____
Address: ____________________________________
Civil status: __________  Citizenship: __________
Purpose: ___ Employment  ___ Business  ___ Others
Date: ______________   Signature: ______________
Fee: PHP 100.00   Official receipt no.: ________""",

    "chat_email": """Hi Kuya Miguel,
Thanks for the quick reply! The menu board looks great. Can you change the color of the title to green and make the prices bigger? Also, please send the final file in PDF and PNG so I can print it at the shop on Saturday. I'll pay the balance via GCash once I see the final version.
Thanks again,
Bea""",

    "application_letter": """November 3, 2026
The Hiring Manager
Sample Creative Agency
Dear Sir or Madam:
I am applying for the position of Junior Video Editor. I graduated with a degree in Multimedia Arts in 2024 and I have one year of experience editing short videos for local businesses. I am skilled in Adobe Premiere Pro and CapCut, and I work well under deadlines.
I have attached my resume for your review. I would be glad to discuss how I can help your team.
Respectfully yours,
Daniel Cruz
daniel.cruz.sample@example.com | 0917 555 0230""",
}
