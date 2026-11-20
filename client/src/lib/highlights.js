import { supabase } from "./supabaseClient";
import { fetchIsVerified } from "./verification";
import { SOCIAL_PLATFORMS, fetchSocialLinks, fetchVerifiedLinks, isSafeLink, isSafeSocialLink, linkLabel, socialHandle, socialTitle } from "./profile";
import { fetchProfileHistory, fetchProfileStats, formatMemberSince } from "./profileStats";
import { fetchPortfolio, withoutHiddenCharacters } from "./portfolio";
import { fetchServiceRatings } from "./serviceReviews";
import { SLIDES_SELECT, itemSlides } from "./slides";
import { getCategory } from "./categories";
import { welcomeRoles } from "./welcomeTitles";
import { avatarUrl, coverUrl } from "./avatar";
import { shownPrice } from "./money";
import { STYLE_IDS, isPremiumStyle } from "../components/highlights/styles/index.js";
import { SOCIAL_GLYPHS } from "../components/highlights/socialGlyphs.js";

// Highlights (PLAN-highlights.md): a short film of a freelancer's profile that
// visitors can watch from the profile page (components/highlights). Everything
// in it comes from what the public profile already shows: the profile, the
// services, the portfolio (watermarked files only, nothing under review), the
// track record and the ratings. Ratings that are still hidden (blind ratings)
// never come back from the database, so they can't show up here either.

// ---------------------------------------------------------------------------
// The level: how strong the profile is decides how big the highlight goes.
// A score out of 100 from public numbers. Premium does NOT count, so a level
// can't be bought.
//   projects done 35 (full at 40), ratings received 20 (full at 30),
//   share of 4-5 star ratings 25 (counts fully from 10 ratings),
//   portfolio projects 10 (full at 20), services 5 (full at 3), verified ID 5.
// Beginner under 40, Average 40-64, Intermediate 65-84, Advanced 85 and up
// (Advanced is the hardest to reach, so a gold card stays rare).
// ---------------------------------------------------------------------------
export const LEVEL_NAMES = { beginner: "Beginner", average: "Average", intermediate: "Intermediate", advanced: "Advanced" };

export function levelOf({ done, ratingCount, positiveShare, portfolio, services, verified }) {
  const parts = [
    { label: "Projects done", points: 35 * Math.min(done, 40) / 40, max: 35 },
    { label: "Ratings received", points: 20 * Math.min(ratingCount, 30) / 30, max: 20 },
    { label: "Positive ratings (4-5★)", points: ratingCount ? 25 * positiveShare * Math.min(1, ratingCount / 10) : 0, max: 25 },
    { label: "Portfolio projects", points: 10 * Math.min(portfolio, 20) / 20, max: 10 },
    { label: "Services", points: 5 * Math.min(services, 3) / 3, max: 5 },
    { label: "Verified ID", points: verified ? 5 : 0, max: 5 }
  ];
  const score = Math.round(parts.reduce((sum, part) => sum + part.points, 0));
  const key = score >= 85 ? "advanced" : score >= 65 ? "intermediate" : score >= 40 ? "average" : "beginner";
  return { score, key, parts };
}

// One color per kind of work, for the job-title pills (keys: lib/categories.js).
const CATEGORY_COLORS = {
  "video-editing": "#f97316", "graphic-design": "#c084fc", "web-development": "#38bdf8", copywriting: "#22d3ee",
  "mobile-development": "#818cf8", "ui-ux-design": "#f472b6", "digital-marketing": "#a3e635", "social-media": "#fb7185",
  "virtual-assistant": "#2dd4bf", "customer-support": "#facc15", "data-entry": "#94a3b8", translation: "#4ade80",
  photography: "#fbbf24", "audio-music": "#e879f9", "animation-3d": "#60a5fa", accounting: "#34d399",
  tutoring: "#fdba74", other: "#cbd5e1"
};
// The bubbles' colors in the Feedback part.
const FEEDBACK_COLORS = ["#f97316", "#06b6d4", "#a855f7", "#22c55e"];

const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "Client";

// A picture for people without a profile picture: their first letter on a gradient.
function initialsPicture(name) {
  const letter = (name || "?").trim().charAt(0).toUpperCase() || "?";
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#ea580c"/><stop offset="1" stop-color="#7c2d12"/></linearGradient></defs>' +
    '<rect width="120" height="120" fill="url(#g)"/><text x="60" y="78" text-anchor="middle" font-family="Arial, sans-serif" font-size="56" font-weight="700" fill="#fff">' +
    letter.replace(/[<>&"']/g, "") + "</text></svg>";
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

// Their description, shortened for the screen, with up to 4 of their skills
// marked [[like this]] so the Profile part can light them up.
function bioWithSkills(description, skills) {
  let text = (description || "").replace(/\[\[|\]\]/g, "").replace(/\s+/g, " ").trim();
  if (text.length > 200) text = text.slice(0, 200).replace(/\s+\S*$/, "") + "…";
  let marked = 0;
  for (const skill of skills || []) {
    if (marked >= 4 || !skill || skill.length < 3) continue;
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const found = text.match(new RegExp("(^|[^\\w\\[])(" + escaped + ")(?![\\w\\]])", "i"));
    if (found) {
      const at = found.index + found[1].length;
      text = text.slice(0, at) + "[[" + found[2] + "]]" + text.slice(at + found[2].length);
      marked += 1;
    }
  }
  return text;
}

// A portfolio project as the film shows it: its first file is the cover (a
// photo, a video, a PDF's first page, or a document's title). mark: draw the
// clean @name in the corner, because the file has no watermark of its own (the
// same rule as the slideshows, lib/slides.js showOwnerName).
function projectOf(item) {
  if (item.status === "flagged") return null;
  const base = { id: item.id, title: item.title, cat: item.category || "other", desc: item.description || "" };
  if (item.kind === "document") return { ...base, doc: true, text: withoutHiddenCharacters(item.body).slice(0, 160) };
  const slides = itemSlides(item).filter((slide) => !slide.underReview);
  const cover = slides[0];
  if (!cover) return null;
  const video = slides.find((slide) => slide.mediaType === "video");
  const extra = { videoUrl: video ? video.url : null, videoMark: video ? video.showOwnerName : false, videoSlides: slides.filter((slide) => slide.mediaType === "video").length };
  if (cover.mediaType === "image") return { ...base, ...extra, img: cover.url, mark: cover.showOwnerName };
  if (cover.mediaType === "video") return { ...base, ...extra, video: cover.url, mark: cover.showOwnerName };
  return { ...base, ...extra, doc: true, img: cover.pages?.[0] || null, mark: false };
}

function serviceOf(service, rating) {
  const cover = itemSlides(service).filter((slide) => !slide.underReview)[0];
  return {
    id: service.id,
    title: service.title,
    cat: service.category || "other",
    price: service.price ? shownPrice(service.price, service.currency) : null,
    rawPrice: service.price, currency: service.currency,
    img: cover?.mediaType === "image" ? cover.url : cover?.mediaType === "document" ? cover.pages?.[0] || null : null,
    video: cover?.mediaType === "video" ? cover.url : null,
    doc: cover?.mediaType === "document",
    rating: rating?.average ?? null,
    count: rating?.count ?? 0
  };
}

// Your own highlight style (PLAN-highlight-styles.md, Step 3): the saved one, "cinema" when none.
export async function fetchHighlightStyle(userId) {
  const { data, error } = await supabase.from("profiles").select("highlight_style").eq("id", userId).maybeSingle();
  if (error) throw error;
  return STYLE_IDS.includes(data?.highlight_style) ? data.highlight_style : "cinema";
}

// Saves your highlight style. The database refuses a Premium style without Premium (the trigger
// profiles_premium_highlight_style); that refusal comes back as a plain sentence.
export async function saveHighlightStyle(userId, styleId) {
  if (!STYLE_IDS.includes(styleId)) throw new Error("That style doesn't exist.");
  const { data, error } = await supabase.from("profiles").update({ highlight_style: styleId }).eq("id", userId).select("highlight_style").maybeSingle();
  if (error) throw new Error(/Premium perk/i.test(error.message || "") ? "Highlight styles are a Premium perk. Get Premium to use this style." : "Couldn't save your style. Please try again.");
  if (!data) throw new Error("Couldn't save your style. Please try again.");
  return data.highlight_style;
}

// Everything one freelancer's highlight needs, read at the same time. Returns
// { data, items } or { error }. items: their portfolio projects as stored, for
// the project viewer (PortfolioViewer) when a visitor opens one.
export async function loadHighlight(userId) {
  const [profileRes, verified, verifiedLinks, socialLinks, proRes, servicesRes, items, stats, history] = await Promise.all([
    supabase.from("profiles").select("id, full_name, username, account_type, avatar_path, cover_path, description, skills, available_for_work, portfolio_links, highlight_style").eq("id", userId).maybeSingle(),
    fetchIsVerified(userId),
    fetchVerifiedLinks(userId),
    fetchSocialLinks(userId),
    supabase.from("pro_members").select("pro_until").eq("user_id", userId).maybeSingle(),
    supabase.from("services").select(`id, title, category, price, currency, image_url, media_type, ${SLIDES_SELECT}`).eq("freelancer_id", userId).order("created_at", { ascending: false }),
    fetchPortfolio(userId).catch(() => []),
    fetchProfileStats(userId, "freelancer"),
    fetchProfileHistory(userId, "freelancer", 50)
  ]);
  const person = profileRes.data;
  if (!person) return { error: "This profile wasn't found." };

  const name = person.full_name || person.username;
  const ratingsByService = await fetchServiceRatings((servicesRes.data || []).map((service) => service.id));
  const services = (servicesRes.data || []).map((service) => serviceOf(service, ratingsByService.get(service.id)));
  const visibleItems = (items || []).filter((item) => item.status !== "flagged");
  const projects = visibleItems.map(projectOf).filter(Boolean);

  // The featured project the camera flies to: the newest with a picture or a video.
  const focus = Math.max(0, projects.findIndex((project) => project.img || project.video));
  if (projects[focus]) projects[focus].focus = true;

  // Videos for the Video reel: one per project that has a video, at most 6 play.
  const videos = projects.filter((project) => project.videoUrl).map((project) => ({ id: project.id, title: project.title, cat: project.cat, video: project.videoUrl, mark: project.videoMark }));
  const videoCount = projects.reduce((sum, project) => sum + (project.videoSlides || 0), 0);

  // Ratings: the visible ones from Done projects (the 50 newest for the stars chart).
  const rated = (history || []).filter((row) => row.stars);
  const breakdown = [5, 4, 3, 2, 1].map((stars) => rated.filter((row) => row.stars === stars).length);
  const ratingCount = stats?.rating_count ?? rated.length;
  const avg = stats?.avg_stars != null ? Number(stats.avg_stars) : rated.length ? rated.reduce((sum, row) => sum + row.stars, 0) / rated.length : 0;
  const positiveShare = rated.length ? rated.filter((row) => row.stars >= 4).length / rated.length : 0;
  const feedback = rated
    .filter((row) => row.feedback && row.feedback.trim())
    .slice(0, 4)
    .map((row, index) => ({ who: firstName(row.other_name || row.other_username), what: row.title, stars: row.stars, color: FEEDBACK_COLORS[index % FEEDBACK_COLORS.length], text: row.feedback.trim().slice(0, 240) }));

  // Job titles from the kinds of work they offer (like the dashboard's welcome title).
  let cats = [...new Set(services.map((service) => service.cat))];
  if (!cats.length) cats = [...new Set(projects.map((project) => project.cat))];
  const roles = cats.filter((cat) => welcomeRoles[cat]).map((cat) => ({ cat, name: welcomeRoles[cat].name, color: CATEGORY_COLORS[cat] || "#f97316", icon: getCategory(cat).icon }));
  const names = roles.map((role) => role.name);
  // Every kind of work that shows up (services and projects): its label, job title, color and icon.
  const catInfo = Object.fromEntries([...new Set([...services.map((service) => service.cat), ...projects.map((project) => project.cat)])].map((cat) => [cat, {
    label: getCategory(cat).label, role: welcomeRoles[cat]?.name || getCategory(cat).label, color: CATEGORY_COLORS[cat] || "#f97316", icon: getCategory(cat).icon || "bi-briefcase-fill"
  }]));
  const title = !names.length ? "Freelancer on PhilFreela" : names.length === 1 ? `A skillful ${names[0]}` : names.slice(0, 3).join(" · ") + (names.length > 3 ? ` · +${names.length - 3} more` : "");

  // "from ₱1,200": only when all their prices are in one currency, so they compare.
  const priced = services.filter((service) => service.rawPrice);
  const oneCurrency = priced.length && priced.every((service) => service.currency === priced[0].currency);
  const lowest = oneCurrency ? priced.reduce((low, service) => (service.rawPrice < low.rawPrice ? service : low), priced[0]) : null;

  const done = stats?.completed_count || 0;
  const lvl = levelOf({ done, ratingCount, positiveShare, portfolio: projects.length, services: services.length, verified });
  // Their highlight style (PLAN-highlight-styles.md): a Premium style plays only while they have Premium; the
  // saved choice is kept when Premium ends (the same rule as the two-color look), so it comes back with Premium.
  const premium = Boolean(proRes.data && Date.parse(proRes.data.pro_until) > Date.now());
  const savedStyle = STYLE_IDS.includes(person.highlight_style) ? person.highlight_style : "cinema";
  const data = {
    id: person.id, name, first: firstName(name), handle: person.username,
    ava: person.avatar_path ? avatarUrl(person.avatar_path) : initialsPicture(name),
    cover: person.cover_path ? coverUrl(person.cover_path) : null,
    verified, premium, available: Boolean(person.available_for_work),
    style: premium || !isPremiumStyle(savedStyle) ? savedStyle : "cinema", savedStyle,
    since: formatMemberSince(stats?.member_since),
    bio: bioWithSkills(person.description, person.skills),
    skills: (person.skills || []).slice(0, 8),
    links: (person.portfolio_links || []).filter(isSafeLink).slice(0, 4).map((link) => ({ url: linkLabel(link), ok: Boolean(verifiedLinks[link]) })),
    // Their social accounts (PLAN-social-accounts.md), in the fixed platform order: the film shows the first 4, then "+N more".
    // (socialLinks is null when they couldn't be loaded: then the film simply has none.)
    socials: SOCIAL_PLATFORMS.filter((p) => isSafeSocialLink(p.key, socialLinks?.[p.key]) && SOCIAL_GLYPHS[p.key])
      .map((p) => ({ key: p.key, label: p.label, handle: socialHandle(p.key, socialLinks[p.key]), title: socialTitle(p.key, socialLinks[p.key], firstName(name)), ...SOCIAL_GLYPHS[p.key] })),
    services, lowestPrice: lowest ? lowest.price : null,
    portfolio: projects, videos, videoCount,
    done, breakdown, ratingCount, avg, rating: Math.round(avg * 10) / 10, trust: Math.round(avg * 20),
    feedback, phrases: feedback.map((entry) => `${entry.stars}★ ${entry.who.toUpperCase()}`),
    roles, catInfo, title, multi: names.length > 1,
    lvl
  };
  return { data, items: visibleItems };
}
