// What the dashboard's welcome banner calls a freelancer ("Welcome, Ana, a
// skillful Video Editor") and the line under it. It is picked from these lists:
// there is no AI writer behind it, so it is instant and costs nothing.
//
// The keys are the category values from lib/categories.js. A category with no
// entry here ("other") gives no job name, so the banner only says "Welcome, Ana".
export const welcomeRoles = {
  "video-editing": {
    name: "Video Editor",
    lines: ["Turning raw clips into stories people remember.", "Every cut and transition shapes how a story feels."]
  },
  "graphic-design": {
    name: "Graphic Designer",
    lines: ["Making ideas look good, one poster and logo at a time.", "Great design speaks before a single word is read."]
  },
  "web-development": {
    name: "Web Developer",
    lines: ["Building websites and apps people enjoy using.", "Turning clean code into pages that work everywhere."]
  },
  copywriting: {
    name: "Copywriter",
    lines: ["Words that inform, persuade and stay in the reader's mind.", "Turning ideas into content people want to read."]
  },
  "mobile-development": {
    name: "Mobile App Developer",
    lines: ["Putting great apps in people's pockets.", "Building apps that feel smooth in every hand."]
  },
  "ui-ux-design": {
    name: "UI/UX Designer",
    lines: ["Designing screens that are clear, easy and a joy to use.", "Making every click feel simple and natural."]
  },
  "digital-marketing": {
    name: "Digital Marketer",
    lines: ["Helping businesses get found and grow online.", "Turning clicks and searches into real customers."]
  },
  "social-media": {
    name: "Social Media Manager",
    lines: ["Keeping brands active, friendly and worth following.", "Turning posts into conversations and followers into fans."]
  },
  "virtual-assistant": {
    name: "Virtual Assistant",
    lines: ["Keeping everything organized so others can focus.", "The reliable hand behind a busy business."]
  },
  "customer-support": {
    name: "Customer Support Specialist",
    lines: ["Making every customer feel heard and helped.", "Turning problems into happy customers."]
  },
  "data-entry": {
    name: "Data Entry Specialist",
    lines: ["Accurate data, neatly organized and ready to use.", "Careful details make the difference in every spreadsheet."]
  },
  translation: {
    name: "Translator",
    lines: ["Helping words cross languages without losing their meaning.", "Bridging languages so everyone understands."]
  },
  photography: {
    name: "Photographer",
    lines: ["Capturing moments worth keeping.", "Seeing the story in every frame."]
  },
  "audio-music": {
    name: "Audio Producer",
    lines: ["Making every voice and sound clear and memorable.", "Turning sound into something people feel."]
  },
  "animation-3d": {
    name: "3D Animator",
    lines: ["Bringing characters and ideas to life, frame by frame.", "Turning imagination into moving worlds."]
  },
  accounting: {
    name: "Bookkeeper",
    lines: ["Keeping the numbers clear, correct and under control.", "Helping businesses know exactly where they stand."]
  },
  tutoring: {
    name: "Online Tutor",
    lines: ["Helping students learn, and believe they can.", "Making hard lessons easy to understand."]
  }
};

// Nice words that go in front of the job name (freelancers) or of "client" (clients).
const compliments = [
  "skillful", "talented", "creative", "dedicated", "reliable", "passionate",
  "brilliant", "hardworking", "outstanding", "amazing", "excellent", "inspiring"
];
const clientCompliments = ["thoughtful", "motivated", "visionary", "friendly", "supportive", "generous", "driven", "wise"];

// The lines under a client's welcome; {role} becomes the job name ("video editor").
const clientLines = [
  "Finding the right {role} for your next project.",
  "Great work starts with the right {role}.",
  "Your project deserves a great {role}."
];

// "a skillful" or "an outstanding". UI/UX starts with a vowel letter but is said "you-eye".
export function article(word) {
  return /^[aeiou]/i.test(word) && !/^(ui|uni|use)/i.test(word) ? "an" : "a";
}

// A job name in the middle of a sentence is written in small letters
// ("Video Editor" -> "video editor"), except when it holds letters that must
// stay capital ("UI/UX Designer", "3D Animator").
function inSentence(role) {
  return /[A-Z]{2}|\d/.test(role) ? role : role.toLowerCase();
}

function randomIndex(length) {
  return Math.floor(Math.random() * length);
}

// From the categories of someone's services and hires (or, for a client, of
// their open job posts), makes the list the banner goes through:
// [{ phrase: "a skillful Video Editor", line: "..." }]. The banner writes it
// after "Welcome, Name, ". For a client the phrase is "a thoughtful client
// looking for a Video Editor". Each job name appears once, categories without a
// job name are left out, and the compliments differ from one job name to the next.
export function pickWelcomeRoles(categories, forClient = false) {
  const known = [...new Set(categories)].filter((category) => welcomeRoles[category]);
  const words = forClient ? clientCompliments : compliments;
  const firstWord = randomIndex(words.length);
  return known.map((category, i) => {
    const { name, lines } = welcomeRoles[category];
    const word = words[(firstWord + i) % words.length];
    if (forClient) {
      return {
        phrase: `${article(word)} ${word} client looking for ${article(name)} ${name}`,
        line: clientLines[randomIndex(clientLines.length)].replace("{role}", inSentence(name))
      };
    }
    return { phrase: `${article(word)} ${word} ${name}`, line: lines[randomIndex(lines.length)] };
  });
}
