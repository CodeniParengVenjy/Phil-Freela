// The highlight styles (PLAN-highlight-styles.md). The Director's Cut ("cinema") is for every freelancer; the five
// other styles are a Premium perk (the user, 2026-11-20). There is no color choice: every style uses PhilFreela
// orange. The saved choice is profiles.highlight_style (the database refuses a Premium style without Premium).
//
// Only the style that plays is downloaded: its file (with its CSS) and its fonts, when a highlight in that style
// opens. Nothing here loads on other pages.

export const STYLES = [
  { id: "cinema", name: "Director's Cut", premium: false, look: "Movie trailer: light, camera moves, gold for legends", music: "Lo-fi up to festival beats, by level" },
  { id: "paper", name: "Papercut", premium: true, look: "Cut-paper layers that move in stop motion", music: "Handmade folk: ukulele, glockenspiel, claps" },
  { id: "retro", name: "Retro", premium: true, look: "An 8-bit video game: pixel art, pixel font, an old TV", music: "Chiptune: square waves and noise drums" },
  { id: "toon", name: "Cartoony", premium: true, look: "A cartoon: thick outlines, bright colors, bouncy", music: "Cartoon band: tuba, xylophone, slide whistle" },
  { id: "kinetic", name: "Kinetic type", premium: true, look: "Big bold words that move on the beat", music: "Electro beat: kick, claps, vocal chops" },
  { id: "comic", name: "Comic book", premium: true, look: "Comic panels, halftone dots, POW! sound words", music: "Superhero theme: strings, brass, timpani" }
];
export const STYLE_IDS = STYLES.map((style) => style.id);
export const isPremiumStyle = (id) => STYLES.some((style) => style.id === id && style.premium);

const LOADERS = {
  paper: () => import("./paper.js"),
  retro: () => import("./retro.js"),
  toon: () => import("./toon.js"),
  kinetic: () => import("./kinetic.js"),
  comic: () => import("./comic.js")
};

// Each style's fonts (Google Fonts, like the rest of the site): the stylesheet, and the faces to wait for.
const FONTS = {
  paper: { css: "family=Baloo+2:wght@500;600;700;800&family=Patrick+Hand", faces: ['800 1em "Baloo 2"', '700 1em "Baloo 2"', '1em "Patrick Hand"'] },
  retro: { css: "family=Press+Start+2P&family=VT323", faces: ['1em "Press Start 2P"', '1em "VT323"'] },
  toon: { css: "family=Fredoka:wght@500;600;700&family=Luckiest+Guy", faces: ['1em "Luckiest Guy"', '700 1em "Fredoka"', '600 1em "Fredoka"'] },
  kinetic: { css: "family=Anton", faces: ['1em "Anton"'] },
  comic: { css: "family=Bangers&family=Comic+Neue:wght@700", faces: ['1em "Bangers"', '700 1em "Comic Neue"'] }
};

// Adds the style's font stylesheet once, then waits (at most about 2.5 seconds) until its faces are ready, so
// the film's first words don't jump when a font arrives. A slow or failed font never blocks the highlight.
function loadFonts(id) {
  const font = FONTS[id];
  if (!font) return Promise.resolve();
  const linkId = "hl-font-" + id;
  let link = document.getElementById(linkId);
  const sheet = new Promise((resolve) => {
    if (link && link.dataset.loaded) { resolve(); return; }
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?" + font.css + "&display=swap";
      document.head.appendChild(link);
    }
    link.addEventListener("load", () => { link.dataset.loaded = "1"; resolve(); }, { once: true });
    link.addEventListener("error", () => resolve(), { once: true });
  });
  const faces = sheet.then(() => (document.fonts ? Promise.all(font.faces.map((face) => document.fonts.load(face).catch(() => null))) : null));
  return Promise.race([faces, new Promise((resolve) => setTimeout(resolve, 2500))]);
}

// The style's hooks for the film (the default export of styles/<id>.js), or null for the Director's Cut or an
// unknown name. Its file and its fonts load at the same time.
export async function loadStyle(id) {
  if (!LOADERS[id]) return null;
  const [mod] = await Promise.all([LOADERS[id](), loadFonts(id)]);
  return mod.default;
}
