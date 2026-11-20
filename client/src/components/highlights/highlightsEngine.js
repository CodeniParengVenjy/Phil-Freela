// The Highlights player (PLAN-highlights.md, Step 2): a freelancer's profile as a short film, drawn live in the
// page (no video file). Its look was designed and approved as a preview (previews/highlights-directors-cut/) and
// moved here as it is; only the data is real now (lib/highlights.js) and its buttons talk to the site.
//
// startHighlights(host, U, opts) runs it inside host (an empty box of HighlightsPlayer.jsx):
//   U     the data from loadHighlight(): profile, services, portfolio, ratings, feedback and level
//   opts  { levelPick, sound, onClose, onMessage, onSeeServices, onOpenService(id), onOpenProject(id), debug }
// It returns { stop, viewerClosed }: stop() ends it (music, videos, key and resize listeners) and removes its
// box; viewerClosed() lets it carry on after the project viewer (PortfolioViewer) was closed.
//
// How it works: a list of parts ("scenes"), each with an entrance and a "ready" time; frame() draws about 60
// times a second; the viewer moves on with a tap, Next, the arrow keys or a swipe (nothing runs on a timer). The
// opening is a card draw whose color depends on the freelancer's level; the music is made live with Web Audio.
//
// Highlight styles (PLAN-highlight-styles.md): opts.style is a Premium style (components/highlights/styles/),
// loaded by HighlightsPlayer, or nothing for the Director's Cut. A style is a set of hooks (ST) that this file
// calls: its frame rate, backgrounds, effects, changes between parts, sounds and music. Without hooks everything
// here plays exactly as the Director's Cut.
import { FILM_MARKUP } from "./highlightsMarkup";
import { makeStyle } from "./styles/kit";

export function startHighlights(host, U, opts = {}) {
  // The player's own box: built fresh each time and removed by stop(), so nothing it added stays behind.
  const root = document.createElement("div");
  root.className = "hl-film"; root.tabIndex = -1;
  root.setAttribute("role", "dialog"); root.setAttribute("aria-modal", "true"); root.setAttribute("aria-label", "Highlights");
  root.innerHTML = FILM_MARKUP;
  host.appendChild(root);
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // Elements are looked up inside the player only.
  const $ = (id) => root.querySelector("#" + id);
  let stopped = false;
  // The owner can preview another level's style, or a highlight style visitors don't see (opts.stylePreview), on
  // their own highlight ("· Preview" shows in the top bar).
  const previewing = (!!opts.levelPick && opts.levelPick !== U.lvl.key) || !!opts.stylePreview;

  // ---------- Math helpers ----------
  const clamp = (x, a = 0, b = 1) => Math.min(Math.max(x, a), b);
  const lerp = (a, b, t) => a + (b - a) * t;
  const eOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const eInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const eBack = (x) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const pad2 = (n) => String(Math.floor(n)).padStart(2, "0");
  const plural = (n, one, many) => n + " " + (n === 1 ? one : many);
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function txt(tag, cls, t) { const e = el(tag, cls); e.textContent = t; return e; }

  const ICON = {
    play: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>',
    pause: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor"/></svg>',
    on: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9h4L12.5 5v14l-5-4h-4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    off: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 9h4L12.5 5v14l-5-4h-4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#22c55e"/><path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    crown: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="currentColor"/></svg>',
    globe: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    chat: '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" fill="currentColor"/></svg>',
    tri: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>'
  };
  // The kinds of work used by the samples: the site's category label, the job title the dashboard
  // uses for it (lib/welcomeTitles.js), a color and an icon.
  // Kinds of work: the site's category label, the job title, a color and a Bootstrap icon (U.catInfo).
  const catOf = (cat) => (U.catInfo && U.catInfo[cat]) || { label: "Other", role: "Freelancer", color: "#cbd5e1", icon: "bi-briefcase-fill" };
  // A job-title pill, from U.roles: { cat, name, color, icon }.
  function rolePill(role, i) {
    const p = el("span", "role", '<span class="ri"><i class="bi ' + role.icon + '"></i></span>');
    p.appendChild(document.createTextNode(role.name)); p.style.setProperty("--rc", role.color); p.style.setProperty("--i", i || 0); p.dataset.cat = role.cat; return p;
  }
  const STAR = "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z";
  const starStr = (n) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

  const LVL_ICON = {
    beginner: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21v-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 13c0-4.5 3-7.5 8-7.5 0 5-3.2 7.5-8 7.5zM12 12c0-3.6-2.3-6-6.5-6 0 4 2.3 6 6.5 6z" fill="currentColor"/></svg>',
    average: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.3L12 16.8l-5.6 3.1 1.3-6.3L3 9.3l6.3-.7z" fill="currentColor"/></svg>',
    intermediate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 3 2 4 3 4 0-3-1-6 0-9z" fill="currentColor"/></svg>',
    advanced: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z" fill="currentColor"/><path d="M2 9h20M9 3l3 18M15 3l-3 18" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="1.2"/></svg>'
  };
  // What each level changes in the highlight. Every level opens with a card draw; the level's color is the
  // color its card stops at (plain, blue, purple, gold), and the level sets how hard the music hits (GROOVE).
  // opening "open" or "count" would bring back the older openings (PhilFreela presents / 3-2-1).
  const TIERS = {
    beginner: { key: "beginner", name: "Beginner", color: "#cbd5e1", opening: "pull", particles: false, stats: false, hype: false, gold: false, bpm: 90, flashes: 0.25, confetti: false, shake: false, slam: false, endFlip: false, camera: 0.5,
      style: "a plain card that simply turns over to show the profile (no rarity word), then a calm highlight: soft lo-fi music, gentle fades, no shaking or confetti" },
    average: { key: "average", name: "Average", color: "#60a5fa", opening: "pull", particles: true, stats: false, hype: false, gold: false, bpm: 108, flashes: 0.6, confetti: true, shake: false, slam: false, endFlip: true, camera: 0.75,
      style: "a blue RARE card that spins open, then a lively highlight with a light pop beat and a little confetti" },
    intermediate: { key: "intermediate", name: "Intermediate", color: "#c084fc", opening: "pull", particles: true, stats: true, hype: true, gold: false, bpm: 124, flashes: 1, confetti: true, shake: true, slam: true, endFlip: true, camera: 1,
      style: "an EPIC purple card that cracks, then keeps you waiting about 5 seconds (the screen darkens, the camera pushes in, shakes and cuts to other angles, a freeze) before it bursts open on the drop; after that a driving dance beat, stats that slam in and speed lines" },
    advanced: { key: "advanced", name: "Advanced", color: "#fbbf24", opening: "pull", particles: true, stats: true, hype: true, gold: true, bpm: 128, flashes: 1.1, confetti: true, shake: true, slam: true, endFlip: true, camera: 1,
      style: "the LEGENDARY gold draw: about 10 seconds of build-up (a fake-out, cracks of gold light, camera cuts, a frozen moment), then the room turns gold and the message \"You found a better person.\" comes in under the card; then festival-level music (supersaws, brass hits, sub bass) and everything gold" }
  };
  let TIER = TIERS.beginner;   // the style of the level now playing (set in start())
  const THEME = "#f97316";     // every highlight style uses PhilFreela orange (no color choice, the user's rule)
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- Elements ----------
  const film = root, bgC = $("bg"), fxC = $("fx"), bgX = bgC.getContext("2d"), fxX = fxC.getContext("2d");
  "PhilFreela presents".split("").forEach((ch, i) => { const s = txt("span", i >= 11 ? "em" : "", ch); s.style.setProperty("--i", i); $("openText").appendChild(s); });
  const starEls = [0, 1, 2, 3, 4].map((i) => {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24");
    s.innerHTML = '<path d="' + STAR + '" fill="url(#hl-goldGrad)" clip-path="url(#hl-sc' + i + ')"/><path class="sline" d="' + STAR + '"/>';
    $("stars5").appendChild(s); return { line: s.querySelector(".sline"), rect: root.querySelector("#hl-sc" + i + " rect") };
  });
  let STAR_LEN = 70;
  (function () {
    const c = document.createElement("canvas"); c.width = c.height = 160; const x = c.getContext("2d"); const img = x.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0); $("grain").style.backgroundImage = "url(" + c.toDataURL() + ")";
  })();

  // ---------- Sound: the soundtrack and the effects, made live with Web Audio ----------
  // The level decides how hard the music hits. Beginner: a soft lo-fi groove. Average: a light pop beat.
  // Intermediate: a driving dance beat. Advanced: a festival drop (supersaw stabs, brass hits, sub bass and a
  // snare roll into every phrase). On the stronger levels pads, bass and synths "pump" under the kick.
  const A = { ctx: null, on: true, master: null, music: null, drums: null, pump: null, rev: null, sfx: null, noise: null, pads: [], drone: null,
    nextStep: 0, step: 0, gridT0: 0, nextWait: 0, BEAT: 0.5, STEP: 0.125, chord: null };
  const CH = {
    Am: [110, 164.81, 220, 261.63], F: [87.31, 130.81, 174.61, 220], Dm: [73.42, 146.83, 220, 293.66], C: [130.81, 196, 261.63, 329.63],
    G: [98, 146.83, 196, 246.94], Em: [82.41, 123.47, 164.81, 196], Bb: [58.27, 174.61, 233.08, 293.66], Cmaj: [65.41, 196, 261.63, 329.63]
  };
  function audioInit() {
    if (A.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    try {
      const c = new AC(); A.ctx = c;
      A.master = c.createGain(); A.master.gain.value = A.on ? 0.55 : 0;
      // A gentle limiter, so the loudest levels don't clip
      const lim = c.createDynamicsCompressor(); lim.threshold.value = -12; lim.knee.value = 10; lim.ratio.value = 5; lim.attack.value = 0.004; lim.release.value = 0.25;
      A.master.connect(lim); lim.connect(c.destination);
      A.music = c.createGain(); A.music.gain.value = 0.7;
      A.lp = c.createBiquadFilter(); A.lp.type = "lowpass"; A.lp.frequency.value = 18000; A.lp.Q.value = 0.8;   // muffles the music during a change of part
      A.music.connect(A.lp); A.lp.connect(A.master);
      A.drums = c.createGain(); A.drums.connect(A.music);
      A.pump = c.createGain(); A.pump.connect(A.music);
      A.sfx = c.createGain(); A.sfx.gain.value = 0.85; A.sfx.connect(A.master);
      const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      A.noise = b;
      // A little room around the claps and synths: a reverb made from fading noise
      const len = Math.floor(c.sampleRate * 1.7), ir = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      const conv = c.createConvolver(); conv.buffer = ir; const wet = c.createGain(); wet.gain.value = 0.3;
      A.rev = c.createGain(); A.rev.connect(conv); conv.connect(wet); wet.connect(A.music);
      return true;
    } catch { A.ctx = null; return false; }
  }
  const now = () => A.ctx.currentTime;
  function env(g, t, peak, a, dcy) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dcy); }
  function send(g, amt) { const s = A.ctx.createGain(); s.gain.value = amt; g.connect(s); s.connect(A.rev); }
  function noiseHit(t, type, freq, v, dur, dest, q) {
    const s = A.ctx.createBufferSource(); s.buffer = A.noise; const f = A.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
    const g = A.ctx.createGain(); env(g, t, v, 0.002, dur); s.connect(f); f.connect(g); g.connect(dest || A.drums); s.start(t, Math.random() * 0.6); s.stop(t + dur + 0.05); return g;
  }
  // Drums
  function kick(t, v, full) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(full ? 160 : 140, t); o.frequency.exponentialRampToValueAtTime(full ? 46 : 42, t + 0.15);
    env(g, t, v, 0.004, full ? 0.42 : 0.3); o.connect(g); g.connect(A.drums); o.start(t); o.stop(t + 0.5);
    if (full) noiseHit(t, "highpass", 2600, v * 0.1, 0.012);   // a click on top, so it cuts through
  }
  function clap(t, v) { [0, 0.01, 0.021].forEach((d, i) => noiseHit(t + d, "bandpass", 1400, v * (i === 2 ? 1 : 0.55), i === 2 ? 0.15 : 0.01, A.drums, 0.8)); send(noiseHit(t + 0.021, "bandpass", 1700, v * 0.6, 0.2, A.drums, 0.8), 0.9); }
  function snare(t, v, dest) {
    noiseHit(t, "highpass", 1700, v, 0.13, dest);
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.07);
    env(g, t, v * 0.6, 0.002, 0.08); o.connect(g); g.connect(dest || A.drums); o.start(t); o.stop(t + 0.12);
  }
  function hat(t, v, open) { noiseHit(t, "highpass", open ? 6800 : 8600, v, open ? 0.18 : 0.03); }
  function tom(t, f, v) { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(f * 1.7, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.1); env(g, t, v, 0.003, 0.28); o.connect(g); g.connect(A.drums); o.start(t); o.stop(t + 0.33); }
  function crash(t, v) { noiseHit(t, "highpass", 5000, v, 1.5); send(noiseHit(t, "highpass", 6500, v * 0.5, 1, A.drums), 0.8); }
  // Bass and synths (they go through the pump)
  function sub(t, f, v, dur) { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.value = f; env(g, t, v, 0.008, dur); o.connect(g); g.connect(A.pump); o.start(t); o.stop(t + dur + 0.05); }
  function bass(t, f, v, dur, bright) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter(); o.type = "sawtooth"; o.frequency.value = f;
    lp.type = "lowpass"; lp.Q.value = 5; lp.frequency.setValueAtTime(bright, t); lp.frequency.exponentialRampToValueAtTime(150, t + dur);
    env(g, t, v, 0.004, dur); o.connect(lp); lp.connect(g); g.connect(A.pump); o.start(t); o.stop(t + dur + 0.05);
  }
  function pluck(t, f, v, type) {
    const o = A.ctx.createOscillator(), g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter(); o.type = type || "triangle"; o.frequency.value = f;
    lp.type = "lowpass"; lp.frequency.setValueAtTime(type === "sawtooth" ? 4500 : 2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.24);
    env(g, t, v, 0.004, 0.26); o.connect(lp); lp.connect(g); g.connect(A.pump); send(g, 0.45); o.start(t); o.stop(t + 0.36);
  }
  function stab(t, notes, v, dur) {   // a supersaw chord stab
    const g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(5500, t); lp.frequency.exponentialRampToValueAtTime(1100, t + dur); env(g, t, v, 0.004, dur);
    notes.forEach((f) => [-16, 0, 16].forEach((de) => { const o = A.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = de; o.connect(lp); o.start(t); o.stop(t + dur + 0.05); }));
    lp.connect(g); g.connect(A.pump); send(g, 0.6);
  }
  function brass(t, notes, v) {   // a big brass-like hit: saws behind a filter that opens and closes
    const g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 2;
    lp.frequency.setValueAtTime(320, t); lp.frequency.exponentialRampToValueAtTime(3000, t + 0.08); lp.frequency.exponentialRampToValueAtTime(650, t + 0.9);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.025); g.gain.exponentialRampToValueAtTime(v * 0.45, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    notes.forEach((f) => [-9, 9].forEach((de) => { const o = A.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = de; o.connect(lp); o.start(t); o.stop(t + 1.15); }));
    lp.connect(g); g.connect(A.pump); send(g, 0.7);
  }
  // The pump: pads, bass and synths duck under each kick and swell back
  function pumpAt(t, depth) { const p = A.pump.gain; p.cancelScheduledValues(t); p.setValueAtTime(1, t); p.linearRampToValueAtTime(1 - depth, t + 0.01); p.linearRampToValueAtTime(1, t + A.BEAT * 0.62); }
  function padTo(name, vol) {
    if (!A.ctx) return; const t = now();
    A.pads.forEach((p) => { p.g.gain.cancelScheduledValues(t); p.g.gain.setValueAtTime(Math.max(p.g.gain.value, 0.0001), t); p.g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2); p.o.forEach((o) => o.stop(t + 1.3)); });
    A.pads = []; A.chord = name; if (!name) return;
    const G = GROOVE[TIER.key], v = vol || G.pad;
    CH[name].forEach((f) => {
      const g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = G.padTone;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.9);
      const os = [-7, 7].map((det) => { const o = A.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = det; o.connect(lp); o.start(t); return o; });
      lp.connect(g); g.connect(A.pump); A.pads.push({ g, o: os });
    });
  }
  // Each level's groove, one bar of 16 steps: which steps play what. Every level up adds layers.
  const ALL16 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], OFF8 = [2, 6, 10, 14], ODD16 = [1, 3, 5, 7, 9, 11, 13, 15], ROLLB = [2, 3, 6, 7, 10, 11, 14, 15];
  const GROOVE = {
    beginner: { pad: 0.022, padTone: 800, pump: 0, kick: [0, 10], kickV: 0.24, full: false, clap: [], clapV: 0, snare: [8], snareV: 0.035, hats: [4, 12], hatV: 0.02, open: [], openV: 0,
      bass: [0, 10], bassV: 0.045, bright: 420, arp: [0, 3, 6, 8, 11, 14], arpV: 0.032, arpType: "triangle", stab: [], stabV: 0, brass: false, sub: 0, fill: false, roll: false, crash: 0 },
    average: { pad: 0.024, padTone: 1000, pump: 0.25, kick: [0, 4, 8, 12], kickV: 0.42, full: false, clap: [4, 12], clapV: 0.11, snare: [], snareV: 0, hats: OFF8, hatV: 0.045, open: [], openV: 0,
      bass: OFF8, bassV: 0.065, bright: 650, arp: [0, 2, 4, 6, 8, 10, 12, 14], arpV: 0.04, arpType: "triangle", stab: [], stabV: 0, brass: false, sub: 0, fill: false, roll: false, crash: 0.06 },
    intermediate: { pad: 0.026, padTone: 1300, pump: 0.55, kick: [0, 4, 8, 12], kickV: 0.62, full: true, clap: [4, 12], clapV: 0.18, snare: [4, 12], snareV: 0.06, hats: ODD16, hatV: 0.028, open: OFF8, openV: 0.045,
      bass: ROLLB, bassV: 0.075, bright: 1100, arp: ALL16, arpV: 0.03, arpType: "sawtooth", stab: [], stabV: 0, brass: false, sub: 0.16, fill: true, roll: false, crash: 0.08 },
    advanced: { pad: 0.028, padTone: 1600, pump: 0.65, kick: [0, 4, 8, 12], kickV: 0.68, full: true, clap: [4, 12], clapV: 0.2, snare: [4, 12], snareV: 0.08, hats: ODD16, hatV: 0.03, open: OFF8, openV: 0.05,
      bass: ROLLB, bassV: 0.08, bright: 1300, arp: ALL16, arpV: 0.026, arpType: "sawtooth", stab: OFF8, stabV: 0.03, brass: true, sub: 0.22, fill: true, roll: true, crash: 0.09 }
  };
  const bassRoot = (f) => { while (f >= 110) f /= 2; while (f < 55) f *= 2; return f; };
  const arpNote = (n, k, saw) => (saw ? [n[1] * 2, n[2] * 2, n[3] * 2, n[2] * 4] : [n[2] * 2, n[3] * 2, n[1] * 4, n[3] * 2])[k % 4];
  function beatFrom(t) { A.step = 0; A.nextStep = t; A.gridT0 = t; }   // the groove starts a new bar at time t
  // During a change of part the music goes muffled (as if heard from the next room), then opens up again.
  function musicMuffle(on) { if (!A.ctx || !A.lp) return; const f = A.lp.frequency, t = now(); f.cancelScheduledValues(t); f.setValueAtTime(Math.max(f.value, 200), t); f.exponentialRampToValueAtTime(on ? 700 : 18000, t + (on ? 0.7 : 0.4)); }
  const SFX = {
    whoosh(dur = 0.8, up = true) { if (!A.ctx) return; const t = now(), s = A.ctx.createBufferSource(); s.buffer = A.noise; s.loop = true; const f = A.ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.1; f.frequency.setValueAtTime(up ? 280 : 3200, t); f.frequency.exponentialRampToValueAtTime(up ? 3600 : 240, t + dur); const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t); s.stop(t + dur + 0.05); },
    impact(v = 1) { if (!A.ctx) return; const t = now(); const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.7); g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 1); o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + 1.05); const s = A.ctx.createBufferSource(); s.buffer = A.noise; const lp = A.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(180, t + 0.6); const g2 = A.ctx.createGain(); g2.gain.setValueAtTime(0.45 * v, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); s.connect(lp); lp.connect(g2); g2.connect(A.sfx); s.start(t); s.stop(t + 0.75); },
    ping(f = 1318.5, v = 0.12) { if (!A.ctx) return; const t = now(); [f, f * 2].forEach((ff, i) => { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.value = ff; env(g, t, v / (i + 1), 0.004, 0.6); o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + 0.7); }); },
    tick(v = 0.1) { if (!A.ctx) return; noiseHit(now(), "highpass", 4200, v, 0.02, A.sfx); },
    pop() { if (!A.ctx) return; const t = now(), o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(980, t + 0.07); env(g, t, 0.16, 0.004, 0.1); o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + 0.15); },
    riser(dur = 1.6) { if (!A.ctx) return; const t = now(), s = A.ctx.createBufferSource(); s.buffer = A.noise; s.loop = true; const f = A.ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur); const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1); s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t); s.stop(t + dur + 0.15); },
    // The card draw: heartbeat thumps, a sparkling shimmer at the reveal
    thump(v = 0.6) { if (!A.ctx) return; const t = now(), o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(72, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.18); env(g, t, v, 0.008, 0.26); o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + 0.32); },
    shimmer(dur = 2.2) {
      if (!A.ctx) return; const t = now(), s = A.ctx.createBufferSource(); s.buffer = A.noise; s.loop = true;
      const f = A.ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 6; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(9000, t + dur);
      const g = A.ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t); s.stop(t + dur + 0.05);
      for (let k = 0; k < 16; k++) { const tt = t + 0.05 + Math.random() * dur * 0.75, o = A.ctx.createOscillator(), gg = A.ctx.createGain(); o.frequency.value = 2200 + Math.random() * 2800; env(gg, tt, 0.035, 0.003, 0.28); o.connect(gg); gg.connect(A.sfx); o.start(tt); o.stop(tt + 0.32); }
    },
    counter(dur = 1.6, n = 12) { if (!A.ctx) return; for (let k = 0; k < n; k++) { const p = 1 - Math.pow(1 - k / n, 2); noiseHit(now() + p * dur, "highpass", 3800, 0.08, 0.015, A.sfx); } },
    // A tap on the card: a short knock that climbs with every tap
    tap(i) { if (!A.ctx) return; const t = now(); noiseHit(t, "bandpass", 2400 + i * 900, 0.22, 0.05, A.sfx, 1.2); const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.type = "square"; o.frequency.setValueAtTime(320 + i * 160, t); o.frequency.exponentialRampToValueAtTime(140 + i * 60, t + 0.09); env(g, t, 0.07, 0.003, 0.09); o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + 0.12); },
    // A cut to another camera angle in the thrill: a quick whip
    whip() { if (!A.ctx) return; const t = now(), s = A.ctx.createBufferSource(); s.buffer = A.noise; const f = A.ctx.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.4; f.frequency.setValueAtTime(5000, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.16); const g = A.ctx.createGain(); env(g, t, 0.3, 0.01, 0.15); s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t, Math.random() * 0.5); s.stop(t + 0.2); },
    // A crack of gold light (Advanced): a sharp snap and a glassy ring
    crack(v = 1) { if (!A.ctx) return; const t = now(); noiseHit(t, "highpass", 3200, 0.42 * v, 0.06, A.sfx); noiseHit(t, "bandpass", 900, 0.3 * v, 0.12, A.sfx, 2); [2637, 3520].forEach((f, i) => { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.value = f; env(g, t + i * 0.03, 0.05 * v, 0.002, 0.5); o.connect(g); g.connect(A.sfx); send(g, 0.9); o.start(t); o.stop(t + 0.6); }); },
    // A pitched riser that climbs an octave and a half
    sweep(dur = 2) { if (!A.ctx) return; const t = now(), g = A.ctx.createGain(), lp = A.ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(5000, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + dur * 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05); [-12, 12].forEach((de) => { const o = A.ctx.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(330, t + dur); o.detune.value = de; o.connect(lp); o.start(t); o.stop(t + dur + 0.1); }); lp.connect(g); g.connect(A.sfx); },
    // A snare roll that speeds up (4 hits a second up to 24), timed ahead
    roll(dur, v) { if (!A.ctx) return; const t0 = now(); for (let t = t0; t < t0 + dur;) { const p = (t - t0) / dur; snare(t, v * (0.3 + 0.7 * p), A.sfx); t += 1 / (4 + 20 * p * p); } }
  };
  const SFX0 = Object.assign({}, SFX);   // the Director's Cut sounds; a style swaps in its own (applyLook)
  let ST = {};                            // the hooks of the style now playing (none for the Director's Cut)
  // While the card waits: a dark drone on the hype levels (a soft pad on the others) that opens up with every
  // tap, and a heartbeat that gets faster. The build and the drop are timed by the card draw itself.
  function droneStart(vol) {
    if (!A.ctx || A.drone) return; const c = A.ctx, t = now();
    const g = c.createGain(), lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 200; lp.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 1.4);
    const os = [[55, "sawtooth", -7], [55, "sawtooth", 7], [110, "sine", 0], [82.41, "triangle", 3]].map(([f, ty, de]) => { const o = c.createOscillator(); o.type = ty; o.frequency.value = f; o.detune.value = de; o.connect(lp); o.start(t); return o; });
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.2; lg.gain.value = 50; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); os.push(lfo);
    lp.connect(g); g.connect(A.music); A.drone = { g, lp, os, vol };
  }
  function droneTo(freq, vol, secs) {
    if (!A.drone) return; const t = now(), d = A.drone;
    d.lp.frequency.cancelScheduledValues(t); d.lp.frequency.setValueAtTime(Math.max(d.lp.frequency.value, 40), t); d.lp.frequency.exponentialRampToValueAtTime(freq, t + secs);
    if (vol) { d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(Math.max(d.g.gain.value, 0.0001), t); d.g.gain.exponentialRampToValueAtTime(vol, t + secs); }
  }
  function droneStop(fade) {
    if (!A.drone) return; const d = A.drone, t = now(); A.drone = null;
    d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(Math.max(d.g.gain.value, 0.0001), t); d.g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    d.os.forEach((o) => { try { o.stop(t + fade + 0.05); } catch { /* already stopped */ } });
  }
  function heartAt(t, v) { [0, 0.17].forEach((d, i) => { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(74, t + d); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.16); env(g, t + d, v * (i ? 0.65 : 1), 0.006, 0.22); o.connect(g); g.connect(A.sfx); o.start(t + d); o.stop(t + d + 0.3); }); }
  const BEAT_SCENES = new Set(["intro", "stats", "profile", "services", "projects", "videos", "ratings", "feedback", "end"]);
  // The beat starts when the card opens (on the hype levels the reveal is the drop) and carries on through every
  // part at the viewer's pace. The ending keeps only the pad and the arpeggio.
  const beatOn = (s) => !!s && (BEAT_SCENES.has(s.id) || (s.id === "pull" && local >= DS.drop));
  function schedule() {
    if (!A.ctx || A.ctx.state !== "running" || !playing) return;
    if (ST.music) { ST.music.schedule(); return; }   // a style plays its own music (styles/kit.js)
    const s = SC[idx];
    if (s && s.id === "pull" && !beatOn(s)) {
      // Waiting for taps (hype levels): a heartbeat after the first tap, faster after the second
      if (TIER.hype && DS.taps.length && DS.taps.length < 3) {
        const per = [0.95, 0.7][DS.taps.length - 1];
        if (A.nextWait < now()) A.nextWait = now() + 0.05;
        while (A.nextWait < now() + 0.12) { heartAt(A.nextWait, 0.36 + 0.12 * DS.taps.length); A.nextWait += per; }
      }
      return;
    }
    if (!beatOn(s)) return;
    if (A.nextStep < now() - 0.2) { A.nextStep = now() + 0.04; A.gridT0 = A.nextStep - A.step * A.STEP; }   // after a pause: carry on from the next step
    const G = GROOVE[TIER.key], n = CH[A.chord] || CH.Am, root = bassRoot(n[0]), saw = G.arpType === "sawtooth", outro = s.id === "end";
    while (A.nextStep < now() + 0.12) {
      const t = A.nextStep, st = A.step % 16, bar = Math.floor(A.step / 16) % 8, last = bar === 7;
      if (outro) { if (G.arp.includes(st) && st % 2 === 0) pluck(t, arpNote(n, A.step, false), G.arpV * 0.8, "triangle"); A.nextStep += A.STEP; A.step++; continue; }
      const build = last && G.roll && st >= 8;   // Advanced: the kick drops out under a snare roll at the end of each phrase
      if (G.kick.includes(st) && !build) { kick(t, G.kickV, G.full); if (G.pump) pumpAt(t, G.pump); if (G.sub) sub(t, root, G.sub, A.BEAT * 0.7); }
      if (G.clap.includes(st)) clap(t, G.clapV);
      if (G.snare.includes(st)) snare(t, G.snareV);
      if (G.hats.includes(st)) hat(t, G.hatV * (st % 4 === 3 ? 1.3 : 1));
      if (G.open.includes(st)) hat(t, G.openV, true);
      if (G.bass.includes(st) && !build) bass(t, root, G.bassV, A.STEP * 1.7, G.bright);
      if (G.arp.includes(st)) pluck(t, arpNote(n, A.step, saw), G.arpV, G.arpType);
      if (G.stab.includes(st) && !build) stab(t, [n[1] * 2, n[2] * 2, n[3] * 2], G.stabV, A.STEP * 1.6);
      if (G.brass && st === 0 && bar % 4 === 0) brass(t, [n[1], n[2], n[3]], 0.075);
      if (st === 0 && bar === 0 && G.crash && A.step > 0) crash(t, G.crash);
      if (last && G.fill && st >= 12) tom(t, [196, 165, 131, 110][st - 12], 0.2);   // a tom fill into the next phrase
      if (build) snare(t, 0.035 + (st - 8) * 0.012);
      A.nextStep += A.STEP; A.step++;
    }
  }
  function setSoundIcon() { $("soundBtn").innerHTML = A.on ? ICON.on : ICON.off; $("soundBtn").setAttribute("aria-label", A.on ? "Turn sound off" : "Turn sound on"); }

  // ---------- Videos: they only play while their part is on screen ----------
  function makeVideo(p, cls) {
    const v = el("video", cls); v.muted = true; v.defaultMuted = true; v.setAttribute("muted", ""); v.playsInline = true; v.setAttribute("playsinline", "");
    v.preload = "metadata"; v.disablePictureInPicture = true; v.setAttribute("controlslist", "nodownload"); v.src = p.video;
    // Whether it is a tall video (a Reel) is only known once it starts loading.
    v.addEventListener("loadedmetadata", () => { v.dataset.tall = v.videoHeight > v.videoWidth ? "1" : ""; });
    v.addEventListener("contextmenu", (e) => e.preventDefault()); return v;
  }
  function startVideo(v, from) {
    v.classList.add("live");
    try { if (from != null) v.currentTime = from; } catch { /* not loaded yet: it starts from the beginning anyway */ }
    if (playing) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
  }
  function stopMedia(root) { root.querySelectorAll("video").forEach((v) => { v.pause(); v.classList.remove("live"); }); }

  // ---------- Build the film for the chosen freelancer ----------
  let tiles = [], cards = [], msgEls = [], eqBars = [], showPanels = [], reelClips = [], reelMore = 0, starFill = [], projLayout = "wall", focusIdx = 0, statItems = [];
  const MAX_TILES = 36, REEL_MAX = 6;
  function makeOdo(node, value) {
    node.innerHTML = "";
    String(value).padStart(2, "0").split("").forEach((d) => {
      const dg = el("span", "dg"), strip = el("span", "strip"); strip.dataset.to = d;
      for (let r = 0; r < 3; r++) for (let n = 0; n < 10; n++) strip.appendChild(txt("span", "", String(n)));
      dg.appendChild(strip); node.appendChild(dg);
    });
  }
  function wordsInto(node, text, cls) {
    let i = 0;
    text.split(/(\[\[.*?\]\])/).filter(Boolean).forEach((chunk) => {
      const kw = chunk.startsWith("[[");
      chunk.replace(/\[\[|\]\]/g, "").split(" ").filter(Boolean).forEach((w) => {
        const s = txt("span", cls + (kw ? " kw" : ""), w); s.style.setProperty("--i", i++);
        node.appendChild(s); node.appendChild(document.createTextNode(" "));
      });
    });
  }
  function vtag(dur) { return '<span class="vtag">' + ICON.tri + (dur || "Video") + "</span>"; }
  // Under the mouse a project tile lifts (and shows its View project button).
  function liftOnHover(node) {
    node.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { node._hov = true; node.classList.add("hov"); } });
    node.addEventListener("pointerleave", () => { if (!node.querySelector(":focus-visible")) { node._hov = false; node.classList.remove("hov"); } });
    node.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  // The "+N more" tile is a button as a whole: a click or tap, or Enter/Space with keyboard focus, opens the viewer.
  function makeOpenable(node, i, label) {
    node.tabIndex = 0; node.setAttribute("role", "button"); node.setAttribute("aria-label", label);
    node.addEventListener("click", () => { if (!wallDragged) openViewer(i, node); });
    node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openViewer(i, node); } });
    liftOnHover(node);
  }
  // A project itself is not a button: a click on it moves on, like anywhere else in the film (the user asked for this,
  // 2026-11-19). Its own View project button opens it. With a mouse the button shows on the tile under the pointer
  // (or with keyboard focus); on a touchscreen every tile shows a small eye button in its corner (.touchy).
  function viewButton(node, i, title, cls, label) {
    const b = el("button", cls, EYE + label); b.type = "button"; b.setAttribute("aria-label", "View project: " + title);
    b.addEventListener("click", () => { if (!wallDragged) openViewer(i, b); });
    b.addEventListener("focus", () => { if (b.matches(":focus-visible")) { node._hov = true; node.classList.add("hov"); } });
    b.addEventListener("blur", () => { node._hov = false; node.classList.remove("hov"); });
    return b;
  }
  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5c-5 0-9 4.6-10 6.5 1 1.9 5 6.5 10 6.5s9-4.6 10-6.5c-1-1.9-5-6.5-10-6.5z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg>';
  // A picture element for a file link (never built as HTML text, so a link can't break the page).
  function picture(src, cls) { const i = el("img", cls); i.alt = ""; i.draggable = false; i.src = src; i.addEventListener("contextmenu", (e) => e.preventDefault()); return i; }
  // A background for the cover banner: their cover photo, or a plain dark gradient when they have none.
  const coverBg = () => (U.cover ? 'url("' + U.cover.replace(/"/g, "%22") + '")' : "linear-gradient(135deg, #1e293b, #0b0d14 70%)");
  const fmtDur = (s) => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
  // The first lines of a piece of writing, as a white page (only the public preview text, never the whole).
  function writingTile(p) { const d = el("div", "tdoc"); d.appendChild(txt("b", "", p.title)); if (p.text) d.appendChild(txt("span", "", p.text)); return d; }
  function buildFilm() {
    stopMedia(film);
    film.setAttribute("aria-label", "Highlights of @" + U.handle);
    // Introduction (only used by the older openings, which no level uses now)
    $("introAva").innerHTML = ""; $("introAva").appendChild(picture(U.ava));
    $("introSr").textContent = U.name;
    $("introSub").textContent = "@" + U.handle + " · " + U.title;
    const ib = $("introBadges"); ib.innerHTML = "";
    const lvB = el("span", "fbadge lvlb", LVL_ICON[TIER.key] + TIER.name); lvB.style.setProperty("--lc", TIER.color); lvB.style.setProperty("--i", 0); ib.appendChild(lvB);
    [[U.verified, "", ICON.check + "ID verified"], [U.premium, "gold", ICON.crown + "Premium"], [U.available, "", '<span class="dot"></span>Available for work']]
      .filter((b) => b[0]).forEach((b, i) => { const e = el("span", "fbadge " + b[1], b[2]); e.style.setProperty("--i", i + 1); ib.appendChild(e); });
    // The top bar never names the level: it would give away the card draw before it opens (the user, 2026-11-20).
    // Only the owner trying another level or style sees "Preview" there, in PhilFreela orange (not the level's color).
    $("lvlChip").textContent = previewing ? "Preview" : ""; $("lvlChip").hidden = !previewing;
    // Stats that slam in (Intermediate and Advanced)
    const rated = U.breakdown.reduce((a, b) => a + b, 0), posPct = rated ? Math.round((U.breakdown[0] + U.breakdown[1]) / rated * 100) : 0;
    statItems = U.ratingCount ? [[String(U.done), U.done === 1 ? "project done" : "projects done"], [U.rating.toFixed(1) + "★", "average rating"], [posPct + "%", "positive ratings"]]
      : [[String(U.done), U.done === 1 ? "project done" : "projects done"], [String(U.portfolio.length), "portfolio projects"], [String(U.services.length), "services"]];
    const sa = $("stAll"); sa.innerHTML = "";
    statItems.forEach((s) => { const d = el("div", "", "<b></b><span></span>"); d.querySelector("b").textContent = s[0]; d.querySelector("span").textContent = s[1]; sa.appendChild(d); });
    // The card draw: the card stops at the level's color (plain, blue, purple or gold) and turns face up to show
    // their score, level, picture, name, job titles, numbers and badges (Beginner: no score or level, just the profile).
    const topK = D.colors[2], ps = sceneEl("pull");
    ps.classList.remove("rar-plain", "rar-blue", "rar-purple", "rar-gold"); ps.classList.add("rar-" + topK);
    $("pullWord").textContent = RARITY[topK].word;
    const pf = $("pcFront");
    pf.innerHTML = '<div class="pcf"><div class="pcf-art"></div><div class="pcf-top"><div class="pcf-score"><b></b><span>Score</span></div><span class="pcf-rar"></span></div>' +
      '<div class="pcf-ava"></div><p class="pcf-name"></p><p class="pcf-title"></p><div class="pcf-stats"></div><div class="pcf-badges"></div><div class="pcf-foil"></div></div>';
    pf.querySelector(".pcf-art").style.backgroundImage = coverBg();
    pf.querySelector(".pcf-score b").textContent = U.lvl.score;
    pf.querySelector(".pcf-rar").innerHTML = LVL_ICON[TIER.key] + TIER.name;
    pf.querySelector(".pcf-ava").appendChild(picture(U.ava));
    pf.querySelector(".pcf-name").textContent = U.name;
    pf.querySelector(".pcf-title").textContent = U.title;
    const cst = U.ratingCount ? [[U.rating.toFixed(1) + "★", "Rating"], [String(U.done), "Done"], [posPct + "%", "Positive"]] : [[String(U.done), "Done"], [String(U.portfolio.length), "Projects"], [String(U.services.length), "Services"]];
    cst.forEach((s) => { const d = el("div", "", "<b></b><span></span>"); d.querySelector("b").textContent = s[0]; d.querySelector("span").textContent = s[1]; pf.querySelector(".pcf-stats").appendChild(d); });
    [[U.verified, "", ICON.check + "ID verified"], [U.premium, "gold", ICON.crown + "Premium"], [U.available, "", '<i class="dot"></i>Available']]
      .filter((b) => b[0]).forEach((b) => pf.querySelector(".pcf-badges").appendChild(el("span", b[1], b[2])));
    $("pullSr").textContent = RARITY[topK].word ? U.name + ", " + TIER.name + " freelancer, score " + U.lvl.score + " out of 100" + (TIER.gold ? ". " + LEGEND_MSG : "") : U.name;
    pullHintTop = RARITY[topK].word && !TIER.gold ? RARITY[topK].word + " · " + TIER.name + " freelancer · Score " + U.lvl.score + " / 100" : "";
    // Legendary: the message takes the pill's place under the card (word by word, so it wraps on a phone)
    const pm = $("pmBig"); pm.innerHTML = ""; let ci = 0;
    LEGEND_MSG.split(" ").forEach((w, wi) => { if (wi) pm.appendChild(document.createTextNode(" ")); const ws = el("span", "wd"); w.split("").forEach((ch) => { const c = txt("span", "ch", ch); c.style.setProperty("--i", ci++); ws.appendChild(c); }); pm.appendChild(ws); });
    $("pullMsg").style.setProperty("--n", ci);
    $("pmSub").textContent = TIER.name + " freelancer · Score " + U.lvl.score + " / 100";
    // Profile: cover banner, picture, name, job titles, description, skills, links
    $("pCover").style.backgroundImage = coverBg();
    $("pAva").innerHTML = ""; $("pAva").appendChild(picture(U.ava));
    const pn = $("pName"); pn.innerHTML = "";
    U.name.split(" ").forEach((w, i) => { const o = el("span", "w"), s = txt("span", "", w); s.style.setProperty("--i", i); o.appendChild(s); pn.appendChild(o); });
    let j = 0;
    if (U.verified) { const ic = el("span", "nic", ICON.check); ic.title = "ID verified"; ic.style.setProperty("--j", j++); pn.appendChild(ic); }
    if (U.premium) { const ic = el("span", "nic", ICON.crown); ic.title = "Premium"; ic.style.setProperty("--j", j++); pn.appendChild(ic); }
    const ph = $("pHandle"); ph.innerHTML = ""; ph.appendChild(txt("span", "", "@" + U.handle + (U.multi ? "" : " · " + U.title)));
    if (U.available) ph.appendChild(el("span", "avail", "<i></i>Available for work"));
    ph.appendChild(txt("span", "", "Since " + U.since));
    const pr = $("pRoles"); pr.innerHTML = ""; pr.hidden = !U.multi;
    if (U.multi) U.roles.forEach((c, i) => pr.appendChild(rolePill(c, i)));
    $("bio").innerHTML = ""; $("bio").hidden = !U.bio; if (U.bio) wordsInto($("bio"), U.bio, "wd");
    $("chips3").innerHTML = ""; U.skills.forEach((k, i) => { const c = txt("span", "chip3", k); c.style.setProperty("--i", i); $("chips3").appendChild(c); });
    $("plinks").innerHTML = ""; U.links.forEach((l) => { const s = el("span", "", ICON.globe); s.appendChild(document.createTextNode(l.url)); if (l.ok) s.appendChild(txt("span", "vb", "Verified owner")); $("plinks").appendChild(s); });
    // Social accounts (PLAN-social-accounts.md), on a line of their own under the website links. On a computer: the
    // first 4 as logo + handle, then "+N more on the profile". On a phone (where the chapter is already tall, and a
    // row of pills with handles pushed the picture under the top bar): just the logos, all of them in one row, the
    // handle in the tooltip. The logo paths are our own constants (socialGlyphs.js); the handle goes in as plain text.
    const socials = U.socials || [], phone = window.innerWidth <= 640, cap = phone ? socials.length : 4;
    if (socials.length && U.links.length) $("plinks").appendChild(el("span", "brk"));
    socials.slice(0, cap).forEach((a, i) => {
      const s = el("span", phone ? "soc soc-ic" : "soc"), lg = el("span", "lg", '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="' + a.d + '"></path></svg>');
      s.style.setProperty("--i", i); lg.style.setProperty("--sc", a.tint); lg.style.setProperty("--sg", a.glyph);
      s.title = a.title || a.handle; s.appendChild(lg);
      if (!phone) s.appendChild(document.createTextNode(a.handle));
      $("plinks").appendChild(s);
    });
    if (socials.length > cap) $("plinks").appendChild(txt("span", "soc-more", "+" + (socials.length - cap) + " more on the profile"));
    // Services: one card per offer, each with the job title of its kind of work. A click opens that offer's
    // page (where its description and the Book button are).
    const n = U.services.length, fan = $("fan"); fan.innerHTML = "";
    fan.style.setProperty("--cw", n === 1 ? "clamp(220px, 30vw, 330px)" : "");
    $("svcTitle").textContent = n === 1 ? U.first + "'s service" : "What " + U.first + " offers";
    $("svcSub").textContent = !n ? "" : (U.multi ? plural(n, "service", "services") + " in " + U.roles.length + " kinds of work" : plural(n, "service", "services")) + (U.lowestPrice ? " · from " + U.lowestPrice : "");
    const sr = $("svcRoles"); sr.innerHTML = ""; U.roles.forEach((c, i) => sr.appendChild(rolePill(c, i)));
    cards = U.services.map((s) => {
      const c = el("div", "scard", '<div class="simg"></div><div class="sbody"><span class="srole"><span class="ri"></span><span></span></span><span class="stitle"></span><div class="srow"><span class="sprice"></span><span class="srate"></span></div></div>');
      const cat = catOf(s.cat), simg = c.querySelector(".simg"); c.style.setProperty("--rc", cat.color);
      if (s.doc) c.classList.add("doc");   // its cover is a document's first page (Retro keeps it readable)
      if (s.video) { const v = makeVideo({ video: s.video + "#t=0.5" }, ""); v.preload = "metadata"; simg.appendChild(v); }
      else if (s.img) simg.appendChild(picture(s.img));
      else simg.appendChild(el("div", "snone", '<i class="bi ' + cat.icon + '"></i>'));
      c.querySelector(".srole .ri").innerHTML = '<i class="bi ' + cat.icon + '"></i>'; c.querySelector(".srole span:last-child").textContent = cat.role;
      c.querySelector(".stitle").textContent = s.title;
      const sp = c.querySelector(".sprice");
      if (s.price) { sp.appendChild(txt("small", "", "from")); sp.appendChild(document.createTextNode(s.price)); } else sp.appendChild(txt("small", "", "Price on request"));
      const rt = c.querySelector(".srate");
      if (s.count) { rt.textContent = "★ " + Number(s.rating).toFixed(1) + " "; rt.appendChild(txt("span", "", "(" + s.count + ")")); } else rt.appendChild(txt("span", "", "New"));
      c.addEventListener("contextmenu", (e) => e.preventDefault());
      // Under the pointer (or with keyboard focus on its button) a card lifts. The card itself is not a button: a
      // click on it moves on, like anywhere else in the film (the user asked for this, 2026-11-19). Its own
      // View offer button goes to that offer (where Book lives).
      const card = { el: c, cat: s.cat, hov: false, h: 0 };
      c.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") card.hov = true; });
      c.addEventListener("pointerleave", () => { if (!c.querySelector(":focus-visible")) card.hov = false; });
      const vb = el("button", "s-view", EYE + "View offer"); vb.type = "button";
      vb.setAttribute("aria-label", "View offer: " + s.title + (s.price ? ", from " + s.price : ""));
      vb.addEventListener("click", () => { if (opts.onOpenService) opts.onOpenService(s.id); });
      vb.addEventListener("focus", () => { if (vb.matches(":focus-visible")) card.hov = true; });
      vb.addEventListener("blur", () => { card.hov = false; });
      c.querySelector(".sbody").appendChild(vb);
      fan.appendChild(c); return card;
    });
    // Projects: wall, strip or showcase, depending on how many there are; videos play inside. The clean @name
    // mark goes only on files without a watermark of their own (p.mark).
    const pc = U.portfolio.length;
    projLayout = pc >= 20 ? "mega" : pc >= 6 ? "wall" : pc >= 3 ? "strip" : "showcase";
    focusIdx = U.portfolio.findIndex((p) => p.focus); if (focusIdx < 0 || focusIdx >= MAX_TILES - 1) focusIdx = Math.floor(Math.min(pc, MAX_TILES - 1) / 2);
    const wall = $("wall"); wall.innerHTML = "";
    wall.style.setProperty("--cols", projLayout === "strip" ? pc : projLayout === "mega" ? (pc >= 30 ? 6 : 5) : pc >= 12 ? 4 : 3);
    // A big portfolio gets smaller tiles, so the camera can show how many there are.
    wall.style.setProperty("--tw", projLayout === "mega" ? (window.innerWidth <= 700 ? "min(27vw, 13vh)" : "min(14.5vw, 17vh)") : "");
    const shownP = projLayout === "showcase" ? [] : pc > MAX_TILES ? U.portfolio.slice(0, MAX_TILES - 1) : U.portfolio;
    tiles = shownP.map((p, k) => {
      const tag = p.video ? vtag("Video") : p.doc ? '<span class="vtag"><i class="bi bi-file-earmark-text-fill"></i>Document</span>' : "";
      const t = el("div", "tile" + (p.doc ? " doc" : ""), (p.mark ? '<span class="mk"></span>' : "") + tag + '<span class="tcap"></span>');   // .doc: each style dresses documents its own way
      if (p.video) {
        const v = makeVideo(p, ""); t.insertBefore(v, t.firstChild);
        v.addEventListener("loadedmetadata", () => { const vt = t.querySelector(".vtag"); if (vt && isFinite(v.duration)) vt.lastChild.textContent = fmtDur(v.duration); });
      } else t.insertBefore(p.img ? picture(p.img) : writingTile(p), t.firstChild);
      if (p.mark) t.querySelector(".mk").textContent = "@" + U.handle;
      t.querySelector(".tcap").textContent = p.title;
      liftOnHover(t); t.appendChild(viewButton(t, k, p.title, "t-view", '<span class="tv-l">View<span class="tv-w"> project</span></span>'));
      wall.appendChild(t); return t;
    });
    if (pc > MAX_TILES) { const m = el("div", "tile more", "<div><b>+" + (pc - MAX_TILES + 1) + "</b><small>more projects</small></div>"); makeOpenable(m, MAX_TILES - 1, "View the other " + (pc - MAX_TILES + 1) + " projects"); wall.appendChild(m); tiles.push(m); }
    const sc = $("showcase"); sc.innerHTML = ""; sc.className = "showcase n" + Math.min(pc, 2);
    showPanels = projLayout !== "showcase" ? [] : U.portfolio.map((p, k) => {
      const f = el("figure", "sc-p" + (p.doc ? " doc" : ""), (p.mark ? '<span class="mk"></span>' : "") + (p.video ? vtag("Video") : "") + '<figcaption><span class="fc-cat"></span><span class="sc-t"></span></figcaption>');
      f.insertBefore(p.video ? makeVideo(p, "") : p.img ? picture(p.img) : writingTile(p), f.firstChild);
      if (p.mark) f.querySelector(".mk").textContent = "@" + U.handle;
      f.querySelector(".fc-cat").textContent = catOf(p.cat).label; f.querySelector(".sc-t").textContent = p.title;
      f.querySelector("figcaption").appendChild(viewButton(f, k, p.title, "sc-view", "View project"));
      f.addEventListener("contextmenu", (e) => e.preventDefault()); sc.appendChild(f); return f;
    });
    $("wallCam").hidden = projLayout === "showcase"; sc.hidden = projLayout !== "showcase"; $("focusCap").hidden = projLayout === "showcase";
    sceneEl("projects").classList.toggle("is-showcase", projLayout === "showcase");
    sceneEl("projects").classList.toggle("has-doc", projLayout === "showcase" && U.portfolio.some((p) => p.doc));   // (a page as a card: highlights.css)
    if (pc) {
      const fp = U.portfolio[focusIdx]; $("fcCat").textContent = catOf(fp.cat).label; $("fcTitle").textContent = fp.title;
      $("fcVideo").hidden = !fp.video; $("fcVideo").innerHTML = ICON.tri + "Video";
    }
    makeOdo($("odo1"), U.done); makeOdo($("odo2"), pc);
    $("odo1Label").textContent = U.done === 1 ? "project finished on PhilFreela" : "projects finished on PhilFreela";
    $("odo2Label").textContent = (pc === 1 ? "project in the portfolio" : "projects in the portfolio") + (U.videoCount ? ", " + plural(U.videoCount, "video", "videos") : "");
    // Video reel (2 or more projects with a video): the top ones, then how many more there are
    const rs = $("reelStage"); rs.innerHTML = "";
    reelClips = U.videos.length >= 2 ? U.videos.slice(0, REEL_MAX).map((p) => {
      const c = el("div", "rclip", '<div class="rbg"></div>');
      const v = makeVideo(p, "rvid"); c.appendChild(v); rs.appendChild(c); return { el: c, v, p };
    }) : [];
    reelMore = reelClips.length ? U.videos.length - reelClips.length : 0;
    $("reelSub").textContent = (reelMore > 0 ? "Top " + reelClips.length + " of " + U.videos.length + " videos" : plural(U.videos.length, "video", "videos")) + " by @" + U.handle;
    $("reelMark").textContent = "@" + U.handle;
    const rw = $("rmWall"); rw.innerHTML = "";
    if (reelMore > 0) {
      const covers = U.portfolio.filter((p) => p.img).map((p) => p.img);
      if (covers.length) for (let i = 0; i < 56; i++) { const s = el("span"); s.style.backgroundImage = 'url("' + covers[i % covers.length].replace(/"/g, "%22") + '")'; rw.appendChild(s); }
      $("rmBig").textContent = "+" + reelMore; $("rmSub").textContent = (reelMore === 1 ? "more video by @" : "more videos by @") + U.handle;
    }
    // Ratings (the visible ones from Done projects; the chart uses the 50 newest)
    starFill = [0, 1, 2, 3, 4].map((i) => clamp(U.avg - i));
    $("scoreNum").textContent = U.rating.toFixed(1);
    $("rateSub").textContent = "From " + plural(U.ratingCount, "client", "clients") + ", rated after paid, finished projects" + (rated && rated < U.ratingCount ? " (chart: the latest " + rated + ")" : "");
    const eq = $("eq"); eq.innerHTML = ""; const mx2 = Math.max(1, ...U.breakdown);
    eqBars = U.breakdown.map((cnt, k) => { const c = el("div", "b5", "<span>" + (5 - k) + '★</span><span class="b5-t"><i></i></span><span class="b5-n">' + cnt + "</span>"); eq.appendChild(c); return { bar: c.querySelector("i"), v: cnt / mx2 }; });
    // Feedback (first names only, and the project it was for)
    const ft = $("fbTitle"); ft.innerHTML = ""; ft.appendChild(document.createTextNode("What clients ")); ft.appendChild(txt("em", "", "say")); ft.appendChild(document.createTextNode(" about " + U.first));
    $("avaStack").innerHTML = ""; U.feedback.forEach((f) => { const i = txt("i", "", f.who[0]); i.style.background = f.color; $("avaStack").appendChild(i); });
    $("fbCount").textContent = plural(U.feedback.length, "review", "reviews") + " · " + U.rating.toFixed(1) + " average";
    $("kwLayer").innerHTML = ""; U.phrases.forEach((p, i) => { const s = txt("span", "", p); s.style.top = (14 + i * 28) + "%"; s.style.left = (i % 2 ? 30 : -5) + "%"; $("kwLayer").appendChild(s); });
    $("msgs").innerHTML = "";
    msgEls = U.feedback.map((f) => {
      const m = el("div", "msg", '<span class="av"></span><div class="bubble"><span class="dots"><i></i><i></i><i></i></span><span class="btxt"><span class="st"></span><span class="tx"></span></span></div><span class="meta"></span>');
      m.querySelector(".av").style.background = f.color; m.querySelector(".av").textContent = f.who[0];
      m.querySelector(".st").textContent = starStr(f.stars); m.querySelector(".tx").textContent = f.text; m.querySelector(".meta").textContent = f.who + " · " + f.what;
      $("msgs").appendChild(m); return m;
    });
    // Conclusion: Message and See services (Book stays on each offer's own page)
    $("ecBanner").style.backgroundImage = coverBg();
    $("ecAva").innerHTML = ""; $("ecAva").appendChild(picture(U.ava));
    $("ecName").textContent = "Work with " + U.first;
    $("ecTitle").textContent = "@" + U.handle + (U.multi ? "" : " · " + U.title);
    const er = $("ecRoles"); er.innerHTML = ""; er.hidden = !U.multi; if (U.multi) U.roles.forEach((c, i) => er.appendChild(rolePill(c, i)));
    const st = [];
    if (U.ratingCount) st.push([U.rating.toFixed(1) + "★", "rating"]);
    st.push([String(U.done), U.done === 1 ? "project done" : "projects done"]);
    if (U.videoCount) st.push([String(U.videoCount), U.videoCount === 1 ? "video" : "videos"]);
    else if (U.services.length) st.push([String(U.services.length), U.services.length === 1 ? "service" : "services"]);
    else if (U.ratingCount) st.push([U.trust + "%", "trust score"]);
    const es = $("ecStats"); es.innerHTML = ""; es.style.setProperty("--k", st.length);
    st.forEach((s) => { const e = el("div", "ec-stat", "<b></b><span></span>"); e.querySelector("b").textContent = s[0]; e.querySelector("span").textContent = s[1]; es.appendChild(e); });
    $("ctaMsg").innerHTML = ICON.chat; $("ctaMsg").appendChild(document.createTextNode("Message " + U.first));
    $("ctaMsg").hidden = !opts.onMessage;   // not on your own highlight
    $("ctaSvc").hidden = !U.services.length;
    $("peCount").textContent = plural(pc, "project", "projects");
    // The scenes
    SC = makeScenes();
  }

  // ---------- Size, particles, wall math ----------
  let W = 0, H = 0, DPR = 1, BAR = 60, parts = [], nameBox = { top: 0, bottom: 0, cy: 0 };
  const P = 1100;
  function resize() {
    W = film.clientWidth; H = film.clientHeight; if (!W || !H) return;
    DPR = Math.min(window.devicePixelRatio || 1, 1.5);
    fxC.width = Math.round(W * DPR); fxC.height = Math.round(H * DPR); fxX.setTransform(DPR, 0, 0, DPR, 0, 0);
    bgC.width = Math.max(64, Math.round(W / 8)); bgC.height = Math.max(40, Math.round(H / 8));
    BAR = clamp(H * 0.09, 40, 84);
    film.style.setProperty("--pw", pullW().toFixed(1) + "px");   // the card in the card draw
    buildParticles(); layoutIntro();
    try { STAR_LEN = starEls[0].line.getTotalLength(); } catch { STAR_LEN = 70; }
  }
  function buildParticles() {
    parts = [];
    const nameU = U.name.toUpperCase(), sp = nameU.indexOf(" ");
    const two = W < 720 && sp > 0, lines = two ? [nameU.slice(0, sp), nameU.slice(sp + 1)] : [nameU];
    const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
    x.font = '800 200px Syne, "Plus Jakarta Sans", sans-serif';
    const widest = Math.max(...lines.map((l) => x.measureText(l).width));
    const fs = Math.min(200 * (W * 0.86) / widest, H * (two ? 0.15 : 0.21));
    x.font = "800 " + fs + 'px Syne, "Plus Jakarta Sans", sans-serif'; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "#ffffff";
    const lh = fs * 0.98, cy = H * 0.47, top = cy - (lines.length - 1) * lh / 2;
    lines.forEach((l, i) => x.fillText(l, W / 2, top + i * lh));
    nameBox = { top: top - fs * 0.5, bottom: top + (lines.length - 1) * lh + fs * 0.5, cy };
    const nm = $("introName"); nm.style.fontSize = fs.toFixed(1) + "px"; nm.style.lineHeight = (lh / fs).toFixed(3); nm.innerHTML = ""; lines.forEach((l, i) => { if (i) nm.appendChild(document.createElement("br")); nm.appendChild(document.createTextNode(l)); });
    // Beginner: no particles, the name simply rises in. With the card draw there is no introduction part (the card is it).
    if (reduce || !TIER.particles || TIER.opening === "pull") return;
    const data = x.getImageData(0, 0, W, H).data, gap = Math.max(2, Math.round(fs / 40)), pts = [];
    for (let yy = 0; yy < H; yy += gap) for (let xx = 0; xx < W; xx += gap) if (data[(yy * W + xx) * 4 + 3] > 140) pts.push(xx, yy);
    const n = pts.length / 2, maxN = two ? 2200 : 4200, step = Math.max(1, n / maxN), R = Math.max(W, H);
    for (let k = 0; k < n; k += step) {
      const i = Math.floor(k) * 2, tx = pts[i], ty = pts[i + 1], ang = Math.random() * Math.PI * 2, rad = R * (0.55 + Math.random() * 0.6);
      const dx = tx - W / 2, dy = ty - cy, dl = Math.hypot(dx, dy) || 1;
      parts.push({ tx, ty, sx: W / 2 + Math.cos(ang) * rad, sy: cy + Math.sin(ang) * rad, d: Math.random() * 0.55, c: Math.random() < 0.5 ? 0 : (Math.random() < 0.6 ? 1 : 2), sz: Math.random() < 0.14 ? 2.6 : 1.7, ex: dx / dl + (Math.random() - 0.5) * 0.7, ey: dy / dl + (Math.random() - 0.5) * 0.7, ph: Math.random() * 6.28 });
    }
  }
  function layoutIntro() {
    const avaH = clamp(H * 0.1, 60, 100), meetTop = Math.max(BAR + avaH + 18, nameBox.top - 34);
    $("introMeet").style.top = meetTop + "px";
    $("introAva").style.top = Math.max(BAR + 8, meetTop - avaH - 14) + "px";
    $("introSub").style.top = (nameBox.bottom + 12) + "px";
    const subH = $("introSub").offsetHeight || 30;
    $("introBadges").style.top = (nameBox.bottom + 26 + subH) + "px";
    $("introName").style.top = nameBox.cy + "px";
  }

  // ---------- Background glow, dust, particles, confetti ----------
  const PAL = { open: ["#1a0d05", "#0a0c12", "#120a06"], count: ["#ea580c", "#0b0d14", "#7c2d12"], pull: ["#1e293b", "#05060a", "#0f172a"], stats: ["#f97316", "#0b1220", "#7c2d12"], intro: ["#ea580c", "#0b1220", "#7c2d12"], profile: ["#f97316", "#0f172a", "#9a3412"], services: ["#f97316", "#0b1220", "#7c2d12"], projects: ["#f97316", "#111827", "#7c2d12"], videos: ["#ea580c", "#0b0d14", "#7c2d12"], ratings: ["#f59e0b", "#1c1208", "#78350f"], feedback: ["#0891b2", "#0b1220", "#164e63"], end: ["#f97316", "#fbbf24", "#7c2d12"] };
  let palCur = PAL.open.map(hex), palTo = PAL.open.map(hex);
  function drawBg(time, dt) {
    const bw = bgC.width, bh = bgC.height, k = clamp(dt * 1.6);
    palCur = palCur.map((c, i) => c.map((v, j) => lerp(v, palTo[i][j], k)));
    bgX.globalCompositeOperation = "source-over"; bgX.fillStyle = "#05060a"; bgX.fillRect(0, 0, bw, bh);
    bgX.globalCompositeOperation = "lighter";
    for (let j = 0; j < 4; j++) {
      const c = palCur[j % 3], cx = bw * (0.5 + 0.38 * Math.sin(time * 0.14 * (j + 1) + j * 2.1)), cy = bh * (0.5 + 0.32 * Math.cos(time * 0.11 * (j + 1.3) + j));
      const r = Math.max(bw, bh) * (0.42 + 0.1 * Math.sin(time * 0.2 + j)), g = bgX.createRadialGradient(cx, cy, 0, cx, cy, r), rgb = c.map(Math.round).join(",");
      g.addColorStop(0, "rgba(" + rgb + "," + (j === 3 ? 0.16 : 0.4) + ")"); g.addColorStop(1, "rgba(" + rgb + ",0)");
      bgX.fillStyle = g; bgX.fillRect(0, 0, bw, bh);
    }
    bgX.globalCompositeOperation = "source-over";
  }
  const dust = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), s: Math.random() * 10 }));
  function drawDust(time, dt) {
    for (const p of dust) {
      if (playing && !fxFrozen) { p.y -= dt * 0.012 * (0.3 + p.z); if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); } }
      const x = (p.x + Math.sin(time * 0.3 + p.s) * 0.01) * W + mx * p.z * 24, y = p.y * H + my * p.z * 24, sz = 0.6 + p.z * 1.8;
      fxX.fillStyle = "rgba(253,186,116," + (0.12 + p.z * 0.35).toFixed(3) + ")"; fxX.fillRect(x, y, sz, sz);
    }
  }
  let PCOL = ["#ffffff", "#fdba74", "#f97316"];
  function drawParticles(t, dur, time) {
    if (!parts.length) return;
    const exitAt = dur - 0.75, R = Math.max(W, H), sweep = (t - 2.25) / 0.9 * (W + 200) - 100;
    fxX.globalCompositeOperation = "lighter";
    for (let c = 0; c < 3; c++) {
      fxX.fillStyle = PCOL[c];
      for (const p of parts) {
        if (p.c !== c) continue;
        let x, y, a = 1, s = p.sz;
        if (t < exitAt) {
          const q = (t - 0.2 - p.d) / 1.35;
          if (q <= 0) { a = 0.25; x = p.sx; y = p.sy; }
          else if (q < 1) {
            const e = eInOut(q), sw = Math.sin(e * Math.PI) * (p.d - 0.27) * 420;
            const nx = -(p.ty - p.sy), ny = p.tx - p.sx, nl = Math.hypot(nx, ny) || 1;
            x = lerp(p.sx, p.tx, e) + nx / nl * sw; y = lerp(p.sy, p.ty, e) + ny / nl * sw; a = 0.3 + 0.7 * e;
          } else { x = p.tx + Math.sin(time * 2 + p.ph) * 0.7; y = p.ty + Math.cos(time * 2.3 + p.ph) * 0.7; a = 1 - 0.7 * clamp((t - 1.8) / 0.5); }
          if (Math.abs(p.tx - sweep) < 26) s *= 2.1;
        } else {
          const e = clamp((t - exitAt) / 0.75), k = e * e;
          x = p.tx + p.ex * k * R * 0.9; y = p.ty + p.ey * k * R * 0.9; a = 1 - e; s = p.sz * (1 + e * 2.6);
        }
        fxX.globalAlpha = a; fxX.fillRect(x, y, s, s);
      }
    }
    fxX.globalAlpha = 1; fxX.globalCompositeOperation = "source-over";
  }
  let conf = [];
  function burst(x, y, n, colors) {
    if (!TIER.confetti) return;
    const cols = colors || (TIER.gold ? ["#fbbf24", "#fde68a", "#fff7d6", "#f59e0b"] : ["#fbbf24", "#f97316", "#fde68a", "#ffffff"]);
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3, v = 380 + Math.random() * 760; conf.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14, w: 5 + Math.random() * 7, h: 3 + Math.random() * 4, c: cols[i % 4], life: 0, k: Math.floor(Math.random() * 4) }); }   // k: a style's shape for this piece
  }
  function drawConfetti(dt) {
    if (!conf.length) return;
    conf = conf.filter((p) => p.y < H + 40 && p.life < 4.5);
    for (const p of conf) {
      if (playing) { p.vy += 1300 * dt; p.vx *= 1 - 0.9 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.life += dt; }
      if (ST.confetti) { ST.confetti(fxX, p); continue; }   // a style draws its own pieces (paper bits, pixels, stars...)
      fxX.save(); fxX.translate(p.x, p.y); fxX.rotate(p.r); fxX.fillStyle = p.c; fxX.globalAlpha = clamp(1.2 - p.life / 4);
      fxX.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 1.7))); fxX.restore();
    }
    fxX.globalAlpha = 1;
  }
  let flashV = 0;
  function flash(v) { flashV = Math.max(flashV, v * TIER.flashes); }
  // Hype levels: speed lines burst out from the middle on hits and changes of part.
  let lines = null;
  function speedLines(s) { if (TIER.hype && !reduce) lines = { t0: clock, s: s || 1, seed: Math.floor(Math.random() * 100000) }; }
  function drawLines() {
    if (!lines) return; const q = (clock - lines.t0) / 0.5; if (q >= 1) { lines = null; return; }
    const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2, rnd = mulberry(lines.seed);
    if (ST.lines) { ST.lines(fxX, q, rnd, cx, cy, R, lines.s); return; }
    fxX.save(); fxX.globalCompositeOperation = "lighter"; fxX.strokeStyle = TIER.gold ? "rgb(253,224,140)" : "rgb(255,196,140)";
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2, r0 = R * (0.22 + rnd() * 0.3) + q * R * 0.5, len = R * (0.18 + rnd() * 0.35) * (1 - q);
      fxX.globalAlpha = (1 - q) * 0.55 * lines.s; fxX.lineWidth = 1 + rnd() * 2.4;
      fxX.beginPath(); fxX.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); fxX.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len)); fxX.stroke();
    }
    fxX.restore();
  }
  let shakeV = 0;
  function shake(v) { if (TIER.shake && !reduce) shakeV = Math.max(shakeV, v); }

  // ---------- The card draw (every level's opening) ----------
  // A face-down card waits for the viewer: "Tap to open". Nothing moves on until it is open (no timer).
  // Every tap pops a "TAP!" and can step the card's glow up one color; the third tap opens it, and the level
  // decides how. Beginner: a plain card that just turns over to show the profile (no rarity word). Average: a
  // blue RARE card. Intermediate: a purple EPIC card after a thrill (the screen darkens, the camera pushes in,
  // shakes in the hand and cuts to other angles, a freeze, then it bursts open on the drop). Advanced: the same
  // thrill, longer and bigger, with a fake-out, cracks of gold light and a LEGENDARY gold room.
  const RARITY = {
    plain: { glow: [226, 232, 240], pal: ["#334155", "#05070b", "#1e293b"], ember: [[255, 255, 255], [226, 232, 240], [203, 213, 225]], confetti: ["#e2e8f0", "#ffffff", "#cbd5e1", "#94a3b8"], word: "" },
    blue: { glow: [96, 165, 250], pal: ["#1d4ed8", "#060914", "#1e3a8a"], ember: [[147, 197, 253], [96, 165, 250], [219, 234, 254]], confetti: ["#60a5fa", "#bfdbfe", "#ffffff", "#3b82f6"], word: "Rare" },
    purple: { glow: [192, 132, 252], pal: ["#7e22ce", "#09060f", "#581c87"], ember: [[216, 180, 254], [192, 132, 252], [168, 85, 247]], confetti: ["#c084fc", "#e9d5ff", "#ffffff", "#a855f7"], word: "Epic" },
    gold: { glow: [251, 191, 36], pal: ["#f59e0b", "#1c1208", "#b45309"], ember: [[255, 247, 214], [253, 230, 138], [251, 191, 36], [245, 158, 11]], confetti: ["#fbbf24", "#fde68a", "#fff7d6", "#f59e0b"], word: "Legendary" }
  };
  // Per level: the glow after each tap (the third is the color it opens at), how long after the third tap it
  // opens (charge), how long it takes to turn face up, how far it spins (an odd number of half turns, so it lands
  // face up), how much of the room changes, and the thrill: how far the camera pushes in, how hard it shakes,
  // how dark it gets, the colors it teases, the heartbeat, the cuts to other angles [when, how long, which], the
  // fake-out, the cracks of gold and the freeze just before it opens. Times are seconds after the third tap.
  const DRAWS = {
    beginner: { colors: ["plain", "plain", "plain"], charge: 0.35, flip: 1.15, spin: 180, room: 0.45, rays: 0, spot: false, pillars: false, embers: 8 },
    average: { colors: ["plain", "blue", "blue"], charge: 0.6, flip: 1.0, spin: 540, room: 0.75, rays: 0.45, spot: false, pillars: false, embers: 18 },
    // Intermediate: the card cracks (purple light) right after the third tap, then about 5 more seconds of suspense.
    intermediate: { colors: ["plain", "blue", "purple"], charge: 6.0, flip: 1.3, spin: 900, room: 0.95, rays: 0.8, spot: false, pillars: false, embers: 30,
      thrill: { push: 0.24, shake: 8, dark: 0.85, tease: ["blue", "purple"], crackGlow: "purple", beats: [1.0, 1.16, 1.9, 2.05, 2.7, 2.84, 3.35, 3.48, 3.9, 4.02, 4.35, 4.46, 4.75, 4.85, 5.1, 5.2],
        cuts: [[1.6, 0.32, "dutch"], [2.6, 0.3, "side"], [3.6, 0.28, "low"], [4.5, 0.26, "close"]], fake: null, cracks: [0.25, 0.55, 0.85], freeze: [5.4, 0.6] } },
    // Advanced (legendary): about 10 seconds. A purple tease, a long fake-out (silence, the glow dies), six cracks of
    // gold, a second build with camera cuts and a freeze; after it lands, "You found a better person."
    advanced: { colors: ["blue", "purple", "gold"], charge: 10.0, flip: 1.8, spin: 1260, room: 1, rays: 0.95, spot: true, pillars: true, embers: 48,
      thrill: { push: 0.36, shake: 12, dark: 0.9, tease: ["purple", "blue"], crackGlow: "gold", beats: [0.3, 0.48, 1.1, 1.28, 1.9, 2.05, 2.55, 2.68, 7.2, 7.36, 7.9, 8.04, 8.45, 8.57, 8.85, 8.95, 9.15, 9.24],
        cuts: [[1.0, 0.3, "dutch"], [2.2, 0.3, "side"], [5.2, 0.28, "low"], [6.2, 0.26, "side"], [7.0, 0.24, "close"], [7.8, 0.24, "dutch"], [8.5, 0.22, "low"], [9.0, 0.2, "close"]],
        fake: [3.0, 4.2], cracks: [4.2, 4.9, 5.5, 6.0, 6.4, 6.75], freeze: [9.3, 0.7] } }
  };
  const LEGEND_MSG = "You found a better person.";   // shown under the gold card once it has landed
  // The other camera angles a cut jumps to (the "edits" of the thrill)
  const ANGLES = {
    dutch: { pre: "", s: 1.45, x: 0.035, y: -0.02, r: -9 },
    side: { pre: "perspective(900px) rotateY(24deg) ", s: 1.22, x: -0.05, y: 0, r: 2 },
    low: { pre: "perspective(900px) rotateX(-18deg) ", s: 1.3, x: 0, y: 0.05, r: 0 },
    close: { pre: "", s: 2.05, x: 0, y: 0.03, r: 5 }
  };
  let D = DRAWS.advanced;   // the card draw of the level now playing (set in open())
  // The draw as it happens: the tap times, the color steps [time, color], the third tap, the reveal, the
  // landing and the drop (when the beat starts).
  const freshDraw = () => ({ taps: [], ups: [], dir: 1, upAt: -9, T3: Infinity, reveal: Infinity, land: Infinity, drop: Infinity });
  let DS = freshDraw();
  let embers = [], emberAcc = 0, inAcc = 0, fxFrozen = false, pullHintTop = "", pullHintTxt = "";
  function pullW() { return Math.min(H * 0.42, 380, W * 0.72); }
  function pullGeom() { const w = pullW(); return { cx: W / 2, cy: H * 0.52, w, h: w * 1.4 }; }
  function setPal(cols, snap) { palTo = cols.map(hex); if (snap) palCur = palTo.map((c) => c.slice()); }
  const nz = (x) => Math.sin(x) * 0.6 + Math.sin(x * 2.3 + 1.7) * 0.3 + Math.sin(x * 5.1 + 0.4) * 0.1;   // a smooth wobble for the handheld camera
  const mixRGB = (a, b, k) => a.map((v, i) => Math.round(lerp(v, b[i], clamp(k))));
  const tapsAt = (t) => DS.taps.filter((x) => t >= x).length;
  function colorAt(t) { let k = "plain"; DS.ups.forEach(([at, c]) => { if (t >= at) k = c; }); return k; }
  // Where the thrill is at time t (null outside it): seconds since the third tap (k), how far along (p), and
  // whether it is in the fake-out, the freeze or a cut, and how many cracks there are.
  function thrillAt(t) {
    const th = D.thrill; if (!th || t < DS.T3 || t >= DS.reveal) return null;
    const k = t - DS.T3, fake = !!th.fake && k >= th.fake[0] && k < th.fake[1], freeze = k >= th.freeze[0];
    const cut = fake || freeze ? null : th.cuts.find((c) => k >= c[0] && k < c[0] + c[1]) || null;
    return { k, p: clamp(k / th.freeze[0]), fake, freeze, cut, cracks: th.cracks.filter((c) => k >= c).length };
  }
  function glowAt(t) {
    let c = RARITY.plain.glow;
    DS.ups.forEach(([at, k], i) => { if (t >= at) c = mixRGB(i ? RARITY[DS.ups[i - 1][1]].glow : RARITY.plain.glow, RARITY[k].glow, (t - at) / (at === DS.reveal ? 0.1 : 0.25)); });
    const q = thrillAt(t), th = D.thrill;
    if (q && q.cracks && th.crackGlow === "gold") c = mixRGB(RARITY.purple.glow, RARITY.gold.glow, 0.3 + 0.7 * q.cracks / th.cracks.length);   // gold leaks in through the cracks
    else if (q && !q.fake && !q.freeze) c = mixRGB(RARITY[th.tease[0]].glow, RARITY[th.tease[1]].glow, 0.5 + 0.5 * Math.sin(q.k * (6 + 14 * q.p)));   // the tease: it flickers between colors, faster and faster
    return c;
  }
  function emberColors(t) {
    const q = thrillAt(t), th = D.thrill;
    if (q && q.cracks && th.crackGlow === "gold") return RARITY.gold.ember;
    if (q) return RARITY[th.tease[Math.random() < 0.5 ? 0 : 1]].ember;
    return RARITY[colorAt(t)].ember;
  }
  // Embers: "rise" drifts up from below, "burst" flies out of the card, "in" is pulled into it, "shard" is a piece
  // of the card's back flying off when the gold card bursts out. avoid: rising embers keep clear of the card's face.
  function spawnEmbers(n, cols, mode, avoid) {
    if (reduce) return;
    const g = pullGeom();
    for (let i = 0; i < n; i++) {
      const c = cols[i % cols.length], a = Math.random() * Math.PI * 2;
      if (mode === "burst") { const sp = 260 + Math.random() * 980; embers.push({ x: g.cx + Math.cos(a) * g.w * 0.2, y: g.cy + Math.sin(a) * g.h * 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.2, grav: -40, life: 0, max: 1 + Math.random() * 1.4, sz: 1.4 + Math.random() * 2.6, c }); }
      else if (mode === "in") { const r = Math.max(W, H) * (0.4 + Math.random() * 0.35); embers.push({ in: true, x0: g.cx + Math.cos(a) * r, y0: g.cy + Math.sin(a) * r, life: -Math.random() * 0.3, max: 0.42 + Math.random() * 0.2, sz: 1.2 + Math.random() * 1.8, c }); }
      else if (mode === "shard") { const sp = 300 + Math.random() * 900, r = 0.3 + Math.random() * 0.7; embers.push({ shard: true, x: g.cx + Math.cos(a) * g.w * 0.3 * r, y: g.cy + Math.sin(a) * g.h * 0.3 * r, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, drag: 1.4, grav: 900, life: 0, max: 1.2 + Math.random() * 0.8, sz: 7 + Math.random() * 16, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 16, pts: [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28].sort((x, y) => x - y), c }); }
      else {
        let x = g.cx + (Math.random() - 0.5) * W * 0.9;
        if (avoid && Math.abs(x - g.cx) < g.w * 0.56) x = g.cx + (Math.random() < 0.5 ? -1 : 1) * (g.w * 0.56 + Math.random() * Math.max(10, W * 0.48 - g.w * 0.56));
        embers.push({ x, y: H * (0.62 + Math.random() * 0.45), vx: (Math.random() - 0.5) * 24, vy: -(40 + Math.random() * 110), drag: 0, grav: 0, life: 0, max: 2.2 + Math.random() * 2, sz: 0.9 + Math.random() * 2.2, c, ph: Math.random() * 6.28 });
      }
    }
  }
  function drawEmbers(dt) {
    if (!embers.length) return;
    embers = embers.filter((p) => p.life < p.max);
    const g = pullGeom();
    fxX.save(); fxX.globalCompositeOperation = ST.ember ? "source-over" : "lighter";
    for (const p of embers) {
      if (playing && !fxFrozen) {   // in the freeze, every ember hangs in the air
        p.life += dt;
        if (!p.in) { p.vx *= 1 - p.drag * dt; p.vy = p.vy * (1 - p.drag * dt) + p.grav * dt; p.x += p.vx * dt + (p.ph != null ? Math.sin(p.life * 3 + p.ph) * 0.3 : 0); p.y += p.vy * dt; }
        if (p.shard) p.rot += p.vr * dt;
        if (p.spin == null) p.spin = Math.random() * 6.28; p.spin += dt * 5;   // (a style's sparks turn)
      }
      if (p.life < 0) continue;
      if (ST.ember) { ST.ember(fxX, p, clamp(p.life / p.max), g); continue; }   // a style draws its own sparks
      const k = clamp(p.life / p.max), rgb = p.c.join(",");
      if (p.in) {
        // A streak of light pulled into the card
        const e = k * k, e2 = Math.pow(Math.max(0, k - 0.14), 2);
        fxX.strokeStyle = "rgba(" + rgb + "," + (0.9 * Math.sin(Math.PI * k)).toFixed(3) + ")"; fxX.lineWidth = p.sz;
        fxX.beginPath(); fxX.moveTo(lerp(p.x0, g.cx, e2), lerp(p.y0, g.cy, e2)); fxX.lineTo(lerp(p.x0, g.cx, e), lerp(p.y0, g.cy, e)); fxX.stroke();
        continue;
      }
      if (p.shard) {
        // A piece of the card's dark back with a gold edge, tumbling away
        const a = (1 - k * k).toFixed(3);
        fxX.save(); fxX.globalCompositeOperation = "source-over"; fxX.translate(p.x, p.y); fxX.rotate(p.rot); fxX.beginPath();
        p.pts.forEach((ang, j) => { const rr = p.sz * (j === 1 ? 1 : 0.7); if (j) fxX.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); else fxX.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); });
        fxX.closePath(); fxX.fillStyle = "rgba(24,30,48," + a + ")"; fxX.fill(); fxX.strokeStyle = "rgba(" + rgb + "," + a + ")"; fxX.lineWidth = 1.5; fxX.stroke(); fxX.restore();
        continue;
      }
      const a = k < 0.12 ? k / 0.12 : 1 - (k - 0.12) / 0.88;
      fxX.fillStyle = "rgba(" + rgb + "," + (a * 0.22).toFixed(3) + ")"; fxX.beginPath(); fxX.arc(p.x, p.y, p.sz * 3.2, 0, Math.PI * 2); fxX.fill();
      fxX.fillStyle = "rgba(" + rgb + "," + a.toFixed(3) + ")"; fxX.beginPath(); fxX.arc(p.x, p.y, p.sz, 0, Math.PI * 2); fxX.fill();
    }
    fxX.restore();
  }
  // Drawn on the effects canvas while the card draw plays: motes in the card's color (a steady rise once it is
  // open), streaks pulled into the card during the thrill, and rings of light: one per tap, one per crack and the
  // biggest at the reveal.
  function drawPull(t, dt) {
    const g = pullGeom(), R = Math.max(W, H), revealed = t >= DS.reveal, q = thrillAt(t);
    if (playing && !fxFrozen) {
      if (!(q && q.fake)) { emberAcc += dt * (revealed ? D.embers : 6 + 6 * tapsAt(t)); while (emberAcc >= 1) { emberAcc--; spawnEmbers(1, emberColors(t), "rise", revealed); } }
      if (q && !q.fake && !q.freeze) { inAcc += dt * (25 + 110 * q.p); while (inAcc >= 1) { inAcc--; spawnEmbers(1, emberColors(t), "in"); } }
    }
    const rings = DS.taps.slice(0, 2).map((at, i) => { const up = DS.ups.some((u) => u[0] === at); return [at, RARITY[D.colors[i]].glow, up ? 0.4 + i * 0.15 : 0.22, 0.75]; });
    if (D.thrill && isFinite(DS.T3)) D.thrill.cracks.forEach((c) => rings.push([DS.T3 + c, RARITY[D.thrill.crackGlow || "gold"].glow, 0.35, 0.6]));
    if (isFinite(DS.reveal)) {
      const k = D.colors[2], big = { beginner: 0.4, average: 0.65, intermediate: 0.9, advanced: 1 }[TIER.key];
      rings.push([DS.reveal, RARITY[k].glow, big, 1.1]);
      if (TIER.hype) rings.push([DS.reveal + 0.12, RARITY[k].glow, 0.7, 1.1], [DS.land, RARITY[k].glow, 0.5, 0.8]);
      if (TIER.gold) rings.push([DS.reveal + 0.24, [255, 255, 255], 0.55, 1.2]);
    }
    rings.forEach(([at, c, v, len]) => {
      const qq = (t - at) / len; if (qq <= 0 || qq >= 1) return;
      if (ST.ring) { ST.ring(fxX, g.cx, g.cy, g.w * 0.45 + eOut(qq) * R * 0.8 * v, c, (1 - qq) * 0.9 * v, 10 * (1 - qq) * v + 1, qq); return; }
      fxX.save(); fxX.globalCompositeOperation = "lighter"; fxX.globalAlpha = (1 - qq) * 0.9 * v; fxX.strokeStyle = "rgb(" + c.join(",") + ")"; fxX.lineWidth = 10 * (1 - qq) * v + 1;
      fxX.beginPath(); fxX.arc(g.cx, g.cy, g.w * 0.45 + eOut(qq) * R * 0.8 * v, 0, Math.PI * 2); fxX.stroke(); fxX.restore();
    });
  }

  // ---------- Scenes (each one is only added when the freelancer has something for it) ----------
  // No part runs on a timer: each plays its entrance and then waits for the viewer (a tap anywhere, Next, the
  // right arrow or a swipe). ready is when its entrance is done and "Tap to continue" shows.
  const sceneEl = (id) => root.querySelector('.scene[data-scene="' + id + '"]');
  const REEL_SEG = 1.8, REEL_OPEN = 1.0, DRIFT = 10;
  const reelSeg = (n) => (n > 4 ? 1.5 : REEL_SEG);
  let reelCur = -1;
  function resetOdos() { root.querySelectorAll(".odo").forEach((o) => { o.classList.remove("go"); o.querySelectorAll(".strip").forEach((s) => { s.style.transform = "translateY(0)"; }); }); }
  function spinOdos() { sceneEl("projects").classList.add("counting"); root.querySelectorAll(".odo").forEach((o) => { o.classList.add("go"); o.querySelectorAll(".strip").forEach((s) => { s.style.transform = "translateY(" + (-(20 + +s.dataset.to)) + "em)"; }); }); SFX.counter(1.6, 14); }

  // The older opening (not used by any level now): 3, 2, 1 on the beat, then "PhilFreela presents". It moves on by itself.
  function countScene() {
    const B = 60 / TIER.bpm, starts = [0.3, 0.3 + B, 0.3 + 2 * B], endN = 0.3 + 3 * B;
    const hit = () => { if (A.ctx) kick(now(), 0.95); SFX.impact(0.45); flash(0.22); speedLines(1); };
    return { id: "count", dur: endN + 0.9, auto: true, label: "Countdown", chord: null,
      cues: starts.map((s) => [s, hit]).concat([[endN, () => { SFX.impact(0.9); SFX.whoosh(0.7, true); flash(0.5); speedLines(1.3); shake(8); }]]),
      update(t) {
        film.style.setProperty("--bars", eOut(t / 0.6).toFixed(3)); film.style.setProperty("--hud", clamp((t - 0.4) / 0.5).toFixed(3));
        let k = -1; starts.forEach((s, i) => { if (t >= s) k = i; });
        const num = $("cdNum"), ring = $("cdRing");
        if (k >= 0 && t < endN) {
          const lt = t - starts[k], e = eOut(lt / 0.22);
          num.textContent = String(3 - k); num.style.opacity = (1 - clamp((lt - B * 0.72) / (B * 0.28))).toFixed(3);
          num.style.transform = "translate(-50%,-50%) scale(" + (2.2 - 1.2 * e).toFixed(3) + ")"; num.style.filter = e < 1 ? "blur(" + (10 * (1 - e)).toFixed(1) + "px)" : "none";
          ring.style.setProperty("--s", (lt * 150).toFixed(1)); ring.style.setProperty("--o", (1 - clamp(lt / 0.45)).toFixed(3));
        } else { num.style.opacity = 0; ring.style.setProperty("--o", 0); }
        const tt = t - endN, ct = $("cdText");
        ct.style.opacity = (clamp(tt / 0.12) * (1 - clamp((tt - 0.62) / 0.22))).toFixed(3);
        ct.style.letterSpacing = (0.95 - 0.45 * eOut(tt / 0.5)).toFixed(3) + "em";
      } };
  }

  // The card draw. The room and the card are page elements; embers, streaks and rings of light are drawn on the
  // effects canvas (drawPull). It waits for the viewer's taps (drawTap); after the third one the reveal plays by
  // itself, and only once the card has landed can the viewer move on.
  function pullScene() {
    const hype = TIER.hype, gold = TIER.gold, th = D.thrill;
    const base = [[0.2, () => SFX.whoosh(0.9, true)]];
    return { id: "pull", dur: Infinity, label: "Card draw", chord: null, cues: base.slice(),
      ready() { return DS.land + (gold ? 2.6 : 0.55); },   // the gold card waits for its message first
      enter() {
        DS = freshDraw(); this.cues = base.slice(); embers = []; emberAcc = 0; inAcc = 0; fxFrozen = false; pullHintTxt = "";
        this.pillars = Array.from($("pullPillars").children); this.rings = Array.from($("pullFloor").children); this.cracks = Array.from($("pcCracks").querySelectorAll("path"));
        this.cracks.forEach((c) => { c.style.strokeDashoffset = "1"; });
        const purple = !!th && th.crackGlow === "purple";   // purple cracks for Intermediate, gold for Advanced
        this.el.style.setProperty("--crk", purple ? "#f6eeff" : "#fff4c9"); this.el.style.setProperty("--crkg", purple ? "192,132,252" : "251,191,36");
        $("pullMsg").classList.remove("on"); $("pullMsg").style.opacity = "0";
        const h = $("pullHint"); h.textContent = ""; h.classList.remove("top");
        const b = $("drawTap"); b.hidden = false; b.setAttribute("aria-label", "Tap to open the card");
        $("tapFx").innerHTML = ""; this.el.classList.add("waiting");
        // The waiting music: a dark drone on the hype levels, a soft pad on the others
        if (A.ctx) { padTo(null); droneStop(0.2); if (ST.music) ST.music.waitStart(); else if (hype) droneStart(gold ? 0.07 : 0.055); else padTo("F", 0.016); }
      },
      // The third tap: everything after it is timed from now.
      open(T) {
        const top = RARITY[D.colors[2]], c = D.charge;
        DS.T3 = T; DS.reveal = T + c; DS.land = DS.reveal + D.flip; DS.drop = hype ? DS.reveal : DS.land;
        if (D.colors[2] !== D.colors[1]) DS.ups.push([DS.reveal, D.colors[2]]);
        const at = (s, fn) => this.cues.push([T + s, fn]);
        if (th) {
          // The thrill: darkness falls, a build plays (a snare roll that speeds up, a riser, the drone opening up),
          // the heartbeat pounds, the camera cuts; the fake-out goes silent; the cracks bring the build back.
          at(0, () => { SFX.impact(gold ? 0.75 : 0.55); const pre = th.fake ? th.fake[0] : th.freeze[0]; SFX.roll(pre, gold ? 0.07 : 0.06); SFX.riser(pre); droneTo(1400, gold ? 0.1 : 0.08, pre); });
          th.beats.forEach((b, i) => at(b, () => SFX.thump(i % 2 ? 0.55 : 0.8)));
          th.cuts.forEach((ct) => at(ct[0], () => { SFX.whip(); flash(0.22); }));
          if (th.fake) at(th.fake[0], () => { droneStop(0.05); setPal(["#14141c", "#05060a", "#0c0c14"]); });   // the fake-out: silence, and the room goes dark too
          const goldCr = th.crackGlow === "gold", crEm = RARITY[goldCr ? "gold" : "purple"].ember;
          th.cracks.forEach((ck, i) => at(ck, () => {
            SFX.crack(goldCr ? 0.7 + i * 0.1 : 0.55 + i * 0.12); flash(goldCr ? 0.14 + i * 0.04 : 0.12); shake(goldCr ? 5 + i * 1.5 : 4 + i); spawnEmbers(goldCr ? 14 + i * 6 : 16, crEm, "burst");
            if (ST.hit) { const g = pullGeom(); ST.hit("crack", g.cx + (i % 2 ? 1 : -1) * g.w * (0.35 + 0.1 * Math.random()), g.cy - g.h * (0.3 - 0.12 * i), i); }
            if (i === 0) {
              if (goldCr) { const left = th.freeze[0] - ck; SFX.roll(left, 0.085); SFX.sweep(left); SFX.shimmer(left); setPal(["#92400e", "#120c06", "#5c2a0a"]); }   // the second build
              else setPal(["#581c87", "#07050c", "#3b0764"]);
            }
          }));
          at(th.freeze[0], () => { droneStop(0.04); fxFrozen = true; SFX.thump(0.5); });   // the freeze: time stops for a moment
        } else if (TIER.key === "average") at(0, () => { SFX.riser(c); SFX.ping(1046.5, 0.07); });
        else at(0, () => SFX.ping(987.8, 0.05));
        // The reveal, as big as the level. On the hype levels this is the drop: the beat starts right here.
        this.cues.push([DS.reveal, () => {
          fxFrozen = false; droneStop(0.3);
          setPal(top.pal, hype);
          if (ST.music) ST.music.reveal(); else padTo(gold ? "Cmaj" : hype ? "Am" : "F");
          if (ST.hit) ST.hit("reveal", W / 2, H * 0.5);
          const arp = (fs, v) => fs.forEach((f, i) => setTimeout(() => SFX.ping(f, v), 60 + i * 75));
          if (gold) {
            SFX.impact(1.4); SFX.whoosh(1.0, true); SFX.shimmer(2.6); arp([1046.5, 1318.5, 1568, 2093, 2637], 0.08);
            if (A.ctx && !ST.music) { const n0 = now(); crash(n0, 0.12); brass(n0, [130.81, 196, 261.63, 329.63], 0.11); sub(n0, 55, 0.4, 1.2); }
            flash(1); shake(20); spawnEmbers(170, top.ember, "burst"); spawnEmbers(26, top.ember, "shard"); speedLines(1.5);
          } else if (hype) {
            SFX.impact(1.0); SFX.whoosh(0.8, true); SFX.shimmer(1.6); arp([880, 1046.5, 1318.5, 1760], 0.07);
            if (A.ctx && !ST.music) { const n0 = now(); crash(n0, 0.1); stab(n0, [220, 261.63, 329.63], 0.05, 0.5); sub(n0, 55, 0.3, 0.9); }
            flash(0.8); shake(14); spawnEmbers(110, top.ember, "burst"); speedLines(1.3);
          } else if (TIER.key === "average") { SFX.ping(1318.5, 0.07); setTimeout(() => SFX.ping(1760, 0.06), 120); SFX.whoosh(0.7, true); SFX.shimmer(1.1); flash(0.5); spawnEmbers(40, top.ember, "burst"); }
          else { SFX.ping(1318.5, 0.05); setTimeout(() => SFX.ping(1568, 0.04), 140); SFX.whoosh(0.6, true); flash(0.3); spawnEmbers(16, top.ember, "burst"); }
          if (A.ctx && hype) beatFrom(now() + 0.02);
        }],
        [DS.land, () => {
          SFX.impact(hype ? 0.7 : 0.2); flash(hype ? 0.3 : 0.15); shake(7); burst(W / 2, H * 0.5, gold ? 170 : hype ? 120 : 60, top.confetti);
          if (ST.hit) ST.hit("land", W / 2, H * 0.5);
          if (A.ctx && !hype) beatFrom(now() + 0.02);
        }]);
        // Legendary: once the card has landed, the message comes in under it with a warm chord and bells.
        if (gold) this.cues.push([DS.land + 0.25, () => {
          $("pullMsg").classList.add("on"); SFX.shimmer(1.8);
          if (ST.music) ST.music.legend(); else if (A.ctx) brass(now(), [261.63, 329.63, 392, 523.25], 0.05);
          [1318.5, 1568, 2093, 2637].forEach((f, i) => setTimeout(() => SFX.ping(f, 0.06), 120 + i * 110));
        }]);
      },
      update(t) {
        const revealed = t >= DS.reveal, landed = t >= DS.land, n = DS.taps.length, q = thrillAt(t);
        film.style.setProperty("--bars", eOut((t - 0.1) / 0.9).toFixed(3)); film.style.setProperty("--hud", clamp((t - 0.8) / 0.6).toFixed(3));
        const tf = q && q.freeze ? DS.T3 + th.freeze[0] : t;   // in the freeze, time stands still for the card
        this.el.style.setProperty("--glow", glowAt(tf).join(","));
        this.el.style.setProperty("--ang", ((tf * (revealed && hype ? 260 : 120 + n * 50 + (q ? 320 * q.p : 0))) % 360).toFixed(1) + "deg");
        const taps = tapsAt(t), lastTap = n ? DS.taps[n - 1] : -9, sinceTap = t - lastTap, sinceUp = t - DS.upAt;
        // The glow: stronger with every tap and a swell when the color steps up. In the thrill it flickers and
        // swells; in the fake-out it nearly dies; with the cracks it comes back gold.
        let ga = (revealed ? 1 : 0.4 + 0.18 * taps) * eOut(t / 0.9);
        let gs = (revealed ? 1.4 : 0.82 + 0.16 * taps) + 0.4 * Math.max(0, 1 - sinceUp / 0.5) + (revealed ? 0.4 * Math.max(0, 1 - (t - DS.reveal) / 0.5) : 0);
        if (!th && t >= DS.T3 && !revealed) { ga *= 0.7 + 0.3 * Math.abs(Math.sin(t * 30)); gs *= 1 - 0.2 * (t - DS.T3) / D.charge; }   // the short charge (Beginner, Average)
        if (q) {
          if (q.fake) { const e = clamp((q.k - th.fake[0]) / 0.25); ga *= 1 - 0.92 * e; gs *= 1 - 0.3 * e; }
          else if (q.cracks && th.crackGlow === "gold") { ga = 0.72 + 0.04 * q.cracks + 0.15 * Math.abs(Math.sin(tf * 40)); gs = 1 + 0.08 * q.cracks; }
          else if (!q.freeze) { ga *= 0.5 + 0.5 * Math.abs(Math.sin(tf * (20 + 30 * q.p))); gs *= 1 + 0.25 * q.p; }
        }
        const au = $("pcAura"); au.style.opacity = ga.toFixed(3); au.style.transform = "scale(" + gs.toFixed(3) + ")";
        $("pcBurst").style.opacity = Math.max(0, 1 - sinceUp / 0.35).toFixed(3);
        // The cracks of gold (Advanced): each draws itself across the back, and gold light leaks out
        if (th && th.cracks.length) {
          // (the moment it bursts open, the cracked shell is gone: its pieces fly off as shards)
          this.cracks.forEach((c, i) => { const at = th.cracks[i]; c.style.strokeDashoffset = revealed || at == null ? "1" : (1 - eOut((t - DS.T3 - at) / 0.14)).toFixed(3); });
          $("pcLeak").style.opacity = (q ? clamp(q.cracks / th.cracks.length) * (th.crackGlow === "gold" ? 1 : 0.7) * (q.freeze ? 1 : 0.75 + 0.25 * Math.sin(t * 30)) : 0).toFixed(3);
        }
        // The card: rises in face down and waits, jumping at every tap; then it opens as the level says.
        const inE = eOut(t / 0.9);
        let ry, rx, rz = 0, ty = (1 - inE) * H * 0.3, s = 0.55 + 0.45 * eBack(t / 0.9);
        if (!revealed) {
          ry = Math.sin(tf * 1.5) * 14; rx = 6 + Math.sin(tf * 1.1) * 3; ty += Math.sin(tf * 2.1) * 6;
          if (!reduce) {
            if (sinceTap < 0.6) { const j = -Math.exp(-sinceTap * 8) * Math.sin(sinceTap * 30); s *= 1 + 0.09 * j; rz += DS.dir * 7 * j; ty += 14 * j; }   // the tap: press, then a springy pop
            if (hype && taps && !q) { const j = 0.5 * taps; ry += Math.sin(t * 97) * j; ty += Math.sin(t * 83 + 2) * j; }   // more energy with every tap
            if (!th && t >= DS.T3) { const k = (t - DS.T3) / D.charge, j = 1.5 + 3 * k; ry += Math.sin(t * 97) * j; ty += Math.sin(t * 83 + 2) * j; s *= 1 - 0.05 * k; }
            if (q && q.fake) { const e = eOut((q.k - th.fake[0]) / 0.5); ty += 16 * e; ry *= 1 - e; rx *= 1 - e; }   // the fake-out: everything stops and the card sinks a little
            else if (q && !q.freeze) { const j = 2 + q.p * 9 + q.cracks * 2; ry += Math.sin(t * 97) * j; rz += Math.sin(t * 71 + 1) * j * 0.45; ty += Math.sin(t * 83 + 2) * j - 22 * q.p; s *= 1 + 0.04 * q.p; }
            if (n < 3) { const idle = t - Math.max(lastTap, 1.2); if (idle > 2.2) { const w = (idle - 2.2) % 2.6; if (w < 0.55) rz += Math.sin(w * 36) * 5 * (1 - w / 0.55); } }   // waiting: a little wiggle that says "tap me"
          }
        } else if (!landed) {
          const p = (t - DS.reveal) / (DS.land - DS.reveal);
          if (reduce || D.spin <= 180) { const e = eInOut(p); ry = 180 * e + Math.sin(t * 1.5) * 14 * (1 - e); rx = 6 * (1 - e); s *= 1 + 0.05 * Math.sin(Math.PI * p); ty -= 12 * Math.sin(Math.PI * p); }
          else {
            // It bursts into a fast spin that slows right down as the face comes round (slow motion on gold)
            const e = 1 - Math.pow(1 - p, gold ? 5 : 4);
            ry = D.spin * e; rx = 6 * (1 - e); s *= 1 + (gold ? 0.3 : 0.2) * Math.sin(Math.PI * Math.min(1, p * 1.15)); ty -= (gold ? 40 : 26) * Math.sin(Math.PI * p);
          }
        } else {
          const k = t - DS.land;
          ry = 180 + mx * 14; rx = -my * 10; s *= 1 + (hype ? 0.07 : 0.02) * Math.max(0, 1 - k / 0.3) + 0.01 * Math.sin(k * 2.4); ty += Math.sin(k * 1.8) * 4;
          if (gold) { const mE = eInOut((k - 0.05) / 0.8); ty -= mE * H * 0.065; s *= 1 - 0.11 * mE; }   // it rises a little to make room for the message
        }
        $("pcard").style.transform = "translateY(" + ty.toFixed(1) + "px) scale(" + s.toFixed(4) + ") rotateX(" + rx.toFixed(2) + "deg) rotateY(" + ry.toFixed(2) + "deg) rotateZ(" + rz.toFixed(2) + "deg)";
        const st = $("pullStage"); st.style.opacity = clamp(t / 0.3).toFixed(3);
        st.style.transform = shakeV > 0.3 ? "translate(" + ((Math.random() - 0.5) * shakeV).toFixed(1) + "px," + ((Math.random() - 0.5) * shakeV).toFixed(1) + "px)" : "";
        // A color split on the camera cuts and on the first moments of the reveal (hype levels)
        const split = reduce ? 0 : q && q.cut ? 5 : hype && revealed && t - DS.reveal < 0.35 ? 7 * (1 - (t - DS.reveal) / 0.35) : 0;
        st.style.filter = split > 0.4 ? "drop-shadow(" + split.toFixed(1) + "px 0 0 rgba(255,40,90,0.55)) drop-shadow(" + (-split).toFixed(1) + "px 0 0 rgba(40,220,255,0.55))" : "";
        if (landed) { const pf = $("pcFront"); pf.style.setProperty("--fx", (60 + mx * 45 + Math.sin(clock * 0.9) * 30).toFixed(1) + "%"); pf.style.setProperty("--ra", (t * 60).toFixed(1) + "deg"); }
        // The camera (hype levels): pushes in, shakes in the hand, cuts to other angles and freezes; after the
        // reveal it punches in and settles.
        let cs = 1, cx = 0, cy = 0, cr = 0, pre = "", cf = "";
        if (q && !reduce) {
          cs = 1 + th.push * eInOut(q.p);
          const amp = q.fake || q.freeze ? 0 : th.shake * (0.2 + 0.8 * q.p) * (q.cracks ? 1.25 : 1);
          cx = nz(t * 13) * amp; cy = nz(t * 11 + 5) * amp; cr = nz(t * 7 + 9) * amp * 0.12;
          if (q.cut) { const a = ANGLES[q.cut[2]]; pre = a.pre; cs *= a.s; cx += a.x * W; cy += a.y * H; cr += a.r; }
          if (q.freeze) cf = "saturate(0.2) contrast(1.25) brightness(0.9)";
        } else if (th && revealed && !reduce) { const k = t - DS.reveal; cs = 1 + 0.1 * Math.exp(-k * 3.5) * Math.cos(k * 9); }
        const cam = $("pullCam"); cam.style.transform = pre + "translate(" + cx.toFixed(1) + "px," + cy.toFixed(1) + "px) rotate(" + cr.toFixed(2) + "deg) scale(" + cs.toFixed(4) + ")";
        cam.style.filter = cf;
        // Darkness falls around the card and black bars close in (hype levels); both snap away at the reveal.
        const dk = !th ? 0 : revealed ? 1 - clamp((t - DS.reveal) / 0.3) : t >= DS.T3 ? eOut((t - DS.T3) / 0.5) : 0;
        $("pullDark").style.opacity = (dk * (!th ? 0 : q && q.fake ? 0.97 : th.dark)).toFixed(3);
        const sq = !th ? 0 : revealed ? 1 - eOut((t - DS.reveal) / 0.25) : t >= DS.T3 ? eOut((t - DS.T3) / 0.6) : 0;
        $("sqT").style.transform = "scaleY(" + sq.toFixed(3) + ")"; $("sqB").style.transform = "scaleY(" + sq.toFixed(3) + ")";
        // The room: a tint that follows the glow, then the room of the color it opened at. Gold gets everything
        // (light, rays, spotlight, pillars, floor); purple gets light, rays and floor; blue and plain a soft glow.
        const re = revealed ? eOut((t - DS.reveal) / (hype ? 0.3 : 0.9)) : 0;
        $("envTint").style.opacity = ([0.45, 0.7, 0.95][Math.min(taps, 2)] * (1 - re) * eOut(t) * (q && q.fake ? 0.15 : 1)).toFixed(3);
        $("envRoom").style.opacity = (re * D.room).toFixed(3);
        const rays = $("pullRays"); rays.style.opacity = (re * D.rays).toFixed(3); rays.style.transform = "rotate(" + (t * 16).toFixed(1) + "deg) scale(" + (0.4 + 0.6 * re).toFixed(3) + ")";
        $("pullSpot").style.opacity = D.spot ? (re * (0.8 + 0.2 * Math.sin(t * 2.2))).toFixed(3) : "0";
        this.pillars.forEach((p, i) => { const e = D.pillars && revealed ? eOut((t - DS.reveal - 0.05 - i * 0.08) / 0.45) : 0; p.style.transform = "scaleY(" + e.toFixed(3) + ")"; p.style.opacity = (e * (0.7 + 0.3 * Math.sin(t * 3 + i * 1.7))).toFixed(3); });
        // (Advanced: with every crack, gold light creeps up from the floor before it opens)
        const preGlow = th && th.crackGlow === "gold" && q && q.cracks ? 0.4 * clamp(q.cracks / th.cracks.length) * (q.freeze ? 1 : 0.8 + 0.2 * Math.sin(t * 9)) : 0;
        $("pullFloor").style.opacity = Math.max(re * D.room, preGlow).toFixed(3);
        this.rings.forEach((r, i) => { const qq = revealed ? ((t - DS.reveal) / (hype ? 1.5 : 2.2) + i / 3) % 1 : 0; r.style.opacity = revealed ? ((1 - qq) * 0.8 * D.room).toFixed(3) : "0"; r.style.transform = "scale(" + (0.5 + qq * 2.4).toFixed(3) + ")"; });
        // The word (RARE, EPIC or LEGENDARY; none for Beginner): it slams in on the hype levels, with a flare across.
        const w = $("pullWord"), wt = revealed ? t - DS.reveal - 0.12 : -1, narrow = W < 700;
        if (!RARITY[D.colors[2]].word) w.style.opacity = "0";
        else if (hype) {
          const e = clamp(wt / 0.32), ls = lerp(narrow ? 0.4 : 0.6, 0.3, eOut(wt / 0.9)).toFixed(3) + "em";
          w.style.opacity = clamp(e * 3).toFixed(3); w.style.letterSpacing = ls; w.style.paddingLeft = ls;
          w.style.transform = "translateX(-50%) scale(" + (wt < 0 ? 2.6 : lerp(2.6, 1, eBack(e))).toFixed(3) + ")";
          w.style.filter = wt >= 0 && e < 1 ? "blur(" + (10 * (1 - e)).toFixed(1) + "px) drop-shadow(0 3px 0 var(--wsh))" : "";
        } else {
          const ls = lerp(0.5, 0.3, eOut(wt / 1.2)).toFixed(3) + "em";
          w.style.opacity = eOut(wt / 0.7).toFixed(3); w.style.letterSpacing = ls; w.style.paddingLeft = ls; w.style.transform = "translateX(-50%)"; w.style.filter = "";
        }
        const sw = (wt - (hype ? 0.35 : 0.6)) / 1.1, swp = hype && sw >= 1 ? sw - 1.7 : sw;   // two shines on the hype levels
        w.style.setProperty("--wsx", (100 - clamp(swp) * 100).toFixed(1) + "%");
        const fl = $("pullFlare"), fq = wt - 0.25;
        fl.style.opacity = hype && RARITY[D.colors[2]].word && fq > 0 ? (clamp(fq / 0.1) * (1 - clamp((fq - 0.2) / 0.7))).toFixed(3) : "0";
        fl.style.transform = "scaleX(" + eOut(fq / 0.3).toFixed(3) + ")";
        // While it waits: "Tap to open". Once it lands: what they drew (not for Beginner).
        $("tapPrompt").style.opacity = (n < 3 ? clamp((t - 0.8) / 0.4) : 1 - clamp(sinceTap / 0.25)).toFixed(3);
        const h = $("pullHint");
        if (revealed && pullHintTxt !== pullHintTop) { pullHintTxt = pullHintTop; h.textContent = pullHintTop; h.classList.toggle("top", !!pullHintTop); }
        h.style.opacity = (revealed && pullHintTop ? clamp((t - DS.land - 0.25) / 0.4) : 0).toFixed(3);
        $("pullMsg").style.opacity = gold && t >= DS.land + 0.25 ? "1" : "0";
      } };
  }
  // A tap while the card waits: anywhere on the screen, or Space, Enter or the right arrow.
  const drawWaiting = () => { const s = SC[idx]; return !!s && s.id === "pull" && DS.taps.length < 3; };
  function drawTap(e) {
    if (!drawWaiting() || (e && suppressClick)) return;
    const s = SC[idx];
    if (!playing) setPlaying(true);
    const t = local, i = DS.taps.length, prev = i ? D.colors[i - 1] : "plain", k = D.colors[i];
    DS.taps.push(t); DS.dir = Math.random() < 0.5 ? -1 : 1;
    // "TAP!" pops where the finger or the mouse was (near the card for a key press)
    const r = film.getBoundingClientRect(), g = pullGeom(), byKey = !e || !e.detail;
    tapFx(byKey ? g.cx + (Math.random() - 0.5) * g.w : e.clientX - r.left, byKey ? g.cy - g.h * (0.2 + Math.random() * 0.25) : e.clientY - r.top, i, RARITY[k].glow);
    SFX.tap(i);
    if (ST.music) ST.music.tap(i);
    if (i < 2) {
      if (k !== prev) {   // the color steps up
        DS.ups.push([t, k]); DS.upAt = t; setPal(RARITY[k].pal);
        SFX.ping([1046.5, 1318.5][i], 0.09 + i * 0.02); SFX.whoosh(0.5, true); spawnEmbers(24 + i * 20, RARITY[k].ember, "burst"); flash(0.1); shake(3 + i * 2);
      } else { SFX.pop(); spawnEmbers(10, RARITY[k].ember, "burst"); }   // no step up this time
      if (A.drone) droneTo(200 + 180 * (i + 1), A.drone.vol * (1 + 0.25 * (i + 1)), 0.6);
      $("drawTap").setAttribute("aria-label", "Tap again to open the card");
    } else {
      // The third tap opens it
      SFX.thump(0.8); flash(0.1); shake(4);
      s.open(t);
      $("drawTap").hidden = true; s.el.classList.remove("waiting"); film.focus({ preventScroll: true });
    }
  }
  function tapFx(x, y, i, rgb) {
    const f = el("div", "tapfx", '<i class="tf-lines"></i><i class="tf-burst"></i><i class="tf-ring"></i><b class="tf-word">TAP!</b>');
    f.style.left = x.toFixed(0) + "px"; f.style.top = y.toFixed(0) + "px";
    f.style.setProperty("--c", rgb.join(",")); f.style.setProperty("--rot", ((Math.random() - 0.5) * 24).toFixed(1) + "deg"); f.style.setProperty("--sz", String([1, 1.2, 1.5][i] || 1));
    $("tapFx").appendChild(f); setTimeout(() => f.remove(), 950);
  }
  // Intermediate and Advanced: the big numbers slam in one every two beats, then come back together and wait.
  function statsScene() {
    const B = 60 / TIER.bpm, SLOT = 2 * B, n = statItems.length, allAt = 0.2 + n * SLOT;
    return { id: "stats", dur: Infinity, label: "Stats", chord: TIER.gold ? "Cmaj" : "Am", ready: allAt + 0.6,
      cues: [[allAt, () => { SFX.impact(0.6); flash(0.3); speedLines(1); shake(6); if (TIER.gold) burst(W / 2, H * 0.45, 150); }]],
      enter() { this.k = -1; $("stNum").style.opacity = 0; $("stLabel").style.opacity = 0; $("stAll").style.opacity = 0; },
      update(t) {
        const num = $("stNum"), lab = $("stLabel"), k = t < 0.2 ? -1 : Math.min(n, Math.floor((t - 0.2) / SLOT));
        if (k !== this.k) {
          this.k = k;
          if (k >= 0 && k < n) { num.textContent = statItems[k][0]; lab.textContent = statItems[k][1]; if (playing) { SFX.impact(0.55); flash(0.22); speedLines(1); shake(6); if (ST.hit) ST.hit("stat", W / 2, H * 0.42, k); } }
        }
        if (k >= 0 && k < n) {
          const lt = t - 0.2 - k * SLOT, e = eOut(lt / 0.2), out = clamp((lt - SLOT + 0.14) / 0.14);
          num.style.transform = "scale(" + (1.8 - 0.8 * e + out * 0.25).toFixed(3) + ")"; num.style.opacity = (1 - out).toFixed(3);
          num.style.filter = e < 1 ? "blur(" + (12 * (1 - e)).toFixed(1) + "px)" : "none";
          lab.style.opacity = (clamp((lt - 0.08) / 0.15) * (1 - out)).toFixed(3);
        } else { num.style.opacity = 0; lab.style.opacity = 0; }
        const all = $("stAll"), at = t - allAt; all.style.opacity = at > 0 ? "1" : "0";
        Array.from(all.children).forEach((c, i) => {
          const e = clamp((at - i * 0.1) / 0.35);
          c.style.opacity = clamp(e * 2).toFixed(3); c.style.transform = "scale(" + lerp(1.6, 1, eBack(e)).toFixed(3) + ")"; c.style.filter = e > 0 && e < 1 ? "blur(" + (8 * (1 - e)).toFixed(1) + "px)" : "";
        });
      } };
  }

  function makeScenes() {
    const list = [];
    if (TIER.opening === "count") list.push(countScene());
    else if (TIER.opening === "pull") list.push(pullScene());
    else list.push({ id: "open", dur: 2.6, auto: true, label: "Presents", chord: null,
      cues: [[0.3, () => SFX.whoosh(1.4, true)], [1.5, () => SFX.ping(659.25, 0.06)], [2.45, () => flash(0.55)]],
      update(t) {
        film.style.setProperty("--bars", eOut(t / 0.8).toFixed(3)); film.style.setProperty("--hud", clamp((t - 0.7) / 0.6).toFixed(3));
        const st = $("streak"); st.style.transform = "scaleX(" + eOut((t - 1.45) / 0.55).toFixed(3) + ")"; st.style.opacity = (clamp((t - 1.45) / 0.15) * (1 - clamp((t - 2.05) / 0.45))).toFixed(3);
      } });
    // With the card draw there is no separate introduction: the card that turns face up shows who they are.
    if (TIER.opening !== "pull") list.push({ id: "intro", dur: 5.4, auto: true, label: "Introduction", chord: TIER.gold ? "Cmaj" : "Am",
      cues: TIER.particles ? [[0.15, () => SFX.riser(1.5)], [1.7, () => SFX.impact(0.5)], [2.25, () => SFX.ping(1318.5, 0.08)], [4.45, () => SFX.whoosh(0.9, true)], [5.3, () => flash(0.3)]]
        : [[0.5, () => SFX.ping(987.8, 0.06)], [1.3, () => SFX.ping(1318.5, 0.05)], [4.6, () => SFX.whoosh(0.8, true)]],
      enter() { layoutIntro(); },
      update(t) {
        const exitAt = this.dur - 0.75, nm = $("introName");
        sceneEl("intro").querySelector(".layer").style.opacity = (1 - clamp((t - exitAt) / 0.3)).toFixed(3);
        if (TIER.particles) { nm.style.transform = ""; nm.style.opacity = (clamp((t - 1.75) / 0.5) * (1 - clamp((t - exitAt) / 0.15))).toFixed(3); }
        else { const e = eOut((t - 0.6) / 0.8); nm.style.opacity = (e * (1 - clamp((t - exitAt) / 0.3))).toFixed(3); nm.style.transform = "translate(-50%, " + (-50 + (1 - e) * 12).toFixed(2) + "%)"; }
      } });
    if (TIER.stats && statItems.length) list.push(statsScene());
    list.push({ id: "profile", dur: Infinity, label: "Profile", chord: "F", kicker: $("pKicker"), ready: 3.9,
      cues: [[0.5, () => SFX.pop()], [0.75, () => SFX.whoosh(0.7, true)], [3.0, () => SFX.counter(0.8, 6)]],
      enter() { this.cs = 1.18; },
      update(t) {
        // Their cover banner fades in and drifts slowly; the ring around the picture turns.
        const s = lerp(1.18, 1.06, eOut(t / 1.4)) - 0.04 * clamp(t / DRIFT); this.cs = s;
        const c = $("pCover"); c.style.opacity = eOut(t / 0.9).toFixed(3); c.style.transform = "translateX(" + (-1.5 * clamp(t / DRIFT)).toFixed(2) + "%) scale(" + s.toFixed(4) + ")";
        $("pAva").style.setProperty("--ra", (t * 50).toFixed(1) + "deg");
      },
      leave(e) { $("pCover").style.transform = "translateY(" + (e * 45).toFixed(2) + "%) scale(" + this.cs.toFixed(4) + ")"; } });
    if (U.services.length) {
      const n = cards.length, rolePills = Array.from($("svcRoles").children);
      list.push({ id: "services", dur: Infinity, label: "Services", chord: "Dm", kicker: $("svcKicker"), ready: 1.7 + n * 0.42 + 0.7,
        cues: [...cards.map((c, i) => [0.5 + i * 0.12, () => SFX.tick(0.09)]), ...cards.map((c, i) => [1.7 + i * 0.42, () => SFX.ping([880, 987.8, 1046.5, 1174.7, 1318.5, 1568][i % 6], 0.07)])],
        enter() { cards.forEach((c) => { c.h = 0; }); },
        // How far the fan opens (degrees). On a narrow screen just enough that each card's View offer button
        // shows past the card on top of it (the cards turn around a point far below them: transform-origin 360%).
        spread() {
          if (n < 2) return 0;
          if (W >= 640) return Math.min(48, (n - 1) * 12);
          const cw = cards[0].el.offsetWidth || 140, R = (cards[0].el.offsetHeight || 250) * 3.1;
          const step = Math.min(cw * 0.92, Math.max(0, W * 0.94 - cw) / (n - 1));
          return Math.min(48, 2 * Math.asin(Math.min(1, (step * (n - 1)) / 2 / R)) * 180 / Math.PI);
        },
        update(t, dt) {
          // Dealt from below into a fan; each card lifts in turn and lights up its job title. After that a card
          // lifts under the pointer (or with keyboard focus on its button).
          if (this.fanW !== W) { this.fanW = W; this.fanA = this.spread(); }
          const A2 = this.fanA, lit = new Set();
          cards.forEach((c, i) => {
            const ang = n > 1 ? -A2 / 2 + i * A2 / (n - 1) : 0, p = eOut((t - 0.45 - i * 0.12) / 0.85);
            const lt = t - (1.7 + i * 0.42), pass = lt > 0 && lt < 0.9 ? Math.sin(Math.PI * lt / 0.9) : 0;
            c.h = lerp(c.h, c.hov ? 1 : 0, clamp((dt || 0.016) * 10)); const lift = Math.max(pass, c.h);
            c.el.style.transform = "translateY(" + ((1 - p) * H * 0.9 - lift * 34).toFixed(1) + "px) rotate(" + (ang * p).toFixed(2) + "deg) scale(" + (1 + lift * 0.06).toFixed(3) + ")";
            c.el.style.opacity = clamp(p * 2).toFixed(3); c.el.style.zIndex = lift > 0.05 ? 50 : i; c.el.classList.toggle("lift", lift > 0.25);
            if (lift > 0.25) lit.add(c.cat);
          });
          rolePills.forEach((r) => r.classList.toggle("lit", lit.has(r.dataset.cat)));
        } });
    }
    if (U.portfolio.length) {
      const show = projLayout === "showcase";
      const s = { id: "projects", dur: Infinity, label: "Projects", chord: "C", kicker: $("projKicker") };
      // Each sample clip opens with a short fade from black, so playback starts just after it.
      // At most 4 videos play at once (the featured one first); the others show a still frame.
      const playAll = () => {
        const vs = Array.from(sceneEl("projects").querySelectorAll("video")), fv = tiles[focusIdx] && tiles[focusIdx].querySelector("video");
        vs.sort((a, b) => (b === fv) - (a === fv));
        vs.forEach((v, i) => { if (i < 4) startVideo(v, 0.45); else { try { v.currentTime = 0.45; } catch { /* shows the cover until it loads */ } } });
      };
      const touchy = () => lastPointer !== "mouse" || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
      if (show) {
        s.ready = 1.2 + 0.3 * (showPanels.length - 1) + 0.6;
        s.cues = [[0.9, spinOdos], [0.25, () => SFX.whoosh(0.9, true)]];
        s.enter = () => { sceneEl("projects").classList.remove("hide-hud", "counting", "exploring"); resetOdos(); playAll(); };
        s.update = function (t) {
          const narrow = W <= 700, one = showPanels.length === 1;
          showPanels.forEach((f, i) => {
            const p = eInOut((t - 0.3 - i * 0.3) / 0.9), r = ((1 - p) * 100).toFixed(1);
            const clip = one ? "circle(" + (p * 120).toFixed(1) + "vmax at 50% 50%)" : !narrow ? (i === 0 ? "inset(0 " + r + "% 0 0)" : "inset(0 0 0 " + r + "%)") : (i === 0 ? "inset(0 0 " + r + "% 0)" : "inset(" + r + "% 0 0 0)");
            f.style.clipPath = clip; f.style.webkitClipPath = clip;
            f.firstChild.style.transform = "scale(" + lerp(1.18, 1.02, eOut(t / 6)).toFixed(4) + ")";
            f.classList.toggle("cap", t > 1.1 + i * 0.3);
          });
        };
      } else {
        const EX = 7.4;   // when the camera tour ends and the viewer can look around
        s.ready = EX + 0.2;
        s.cues = [[0.05, () => SFX.whoosh(1.2, false)], [1.3, spinOdos],
          [3.7, () => { sceneEl("projects").classList.add("hide-hud"); SFX.whoosh(1.6, true); }], [5.3, () => { $("focusCap").classList.add("show"); SFX.impact(0.35); }],
          [6.4, () => { $("focusCap").classList.remove("show"); SFX.whoosh(0.8, false); }], [7.0, () => { sceneEl("projects").classList.add("exploring"); SFX.pop(); }]];
        s.enter = function () {
          sceneEl("projects").classList.remove("hide-hud", "counting", "exploring"); $("focusCap").classList.remove("show"); resetOdos(); playAll();
          // Where the featured project sits on the wall, so the camera can fly to it.
          const w = $("wall"), f = tiles[focusIdx], ww = w.offsetWidth, wh = w.offsetHeight;
          const offX = f.offsetLeft + f.offsetWidth / 2 - ww / 2, offY = f.offsetTop + f.offsetHeight / 2 - wh / 2;
          const sc = Math.min(((H - 2 * BAR) * 0.86) / f.offsetHeight, (W * 0.92) / f.offsetWidth), zf = P * (1 - 1 / sc);
          const strip = projLayout === "strip", mega = projLayout === "mega", big = tiles.length >= 12;
          // Tiles appear from the middle outward.
          const maxD = Math.hypot(ww / 2, wh / 2) || 1;
          tiles.forEach((tile) => { tile._d = 0.1 + Math.hypot(tile.offsetLeft + tile.offsetWidth / 2 - ww / 2, tile.offsetTop + tile.offsetHeight / 2 - wh / 2) / maxD * (mega ? 1.0 : 0.55); tile._h = 0; });
          // Where the camera rests after the tour: the whole wall if it fits with tiles big enough to see, else
          // as big as reads well, and the viewer looks around (the mouse moves the view; a finger drags it).
          const narrow = W <= 700, chip = narrow ? 48 : 56, aw = W * 0.94, ah = H - 2 * BAR - chip - 16;
          const fit = Math.min(aw / ww, ah / wh), readable = (narrow ? 92 : 150) / (tiles[0].offsetWidth || 100);
          const es = clamp(Math.max(fit, Math.min(readable, 1.15)), 0.15, 1.6);
          this.ex = { s: es, z: P * (1 - 1 / es), mx: Math.max(0, (ww * es - aw) / 2 / es), my: Math.max(0, (wh * es - ah) / 2 / es), yOff: (chip / 2 + 4) / es };
          this.px = 0; this.py = 0; wallDrag.x = 0; wallDrag.y = 0;
          const pan = this.ex.mx > 4 || this.ex.my > 4;
          $("peHint").textContent = touchy() ? (pan ? "Drag to look around, tap the eye to open one" : "Tap the eye on a project to open it") : (pan ? "Move the mouse to look around, then click View project" : "Point at a project, then click View project");
          if (mega) {
            // A long glide over the whole wall first, so the size of the portfolio shows, then down to the featured project.
            this.K = [
              [0, -2600, 52, 0, -20, ww * 0.05, wh * 0.1, 0, 0],
              [1.4, -1000, 42, 0, -12, ww * 0.26, wh * 0.3, 0, 1],
              [3.7, -800, 34, 0, -6, -ww * 0.24, -wh * 0.22, 0, 1],
              [5.3, zf, 0, 0, 0, -offX, -offY, 0, 1],
              [6.35, zf + 40, 0, 0, 0, -offX, -offY, 0, 1],
              [EX, this.ex.z, 0, 0, 0, 0, this.ex.yOff, 0, 1]
            ];
            return;
          }
          const panX = strip ? ww * 0.3 : big ? ww * 0.2 : W * 0.02, panY = big ? wh * 0.18 : 0;
          this.K = [
            [0, -1500, strip ? 16 : 38, strip ? -30 : 0, strip ? -4 : -12, panX, panY + H * 0.06, 0, 0],
            [1.3, -560, strip ? 10 : 22, strip ? -22 : -6, strip ? -2 : -6, panX * 0.6, panY * 0.6, 0, 1],
            [3.7, -420, strip ? 6 : 15, strip ? 16 : 7, strip ? 2 : -3, -panX * 0.6, -panY * 0.5, 0, 1],
            [5.3, zf, 0, 0, 0, -offX, -offY, 0, 1],
            [6.35, zf + 40, 0, 0, 0, -offX, -offY, 0, 1],
            [EX, this.ex.z, 0, 0, 0, 0, this.ex.yOff, 0, 1]
          ];
        };
        s.update = function (t, dt) {
          const K = this.K, E = this.ex, lastK = K[K.length - 1], k8 = clamp((dt || 0.016) * 8);
          let v;
          if (t >= EX) {
            // Looking around: the mouse moves the view (a finger drags it); the wall tilts a little toward the pointer.
            const touch = lastPointer !== "mouse";
            if (touch) { wallDrag.x = clamp(wallDrag.x, -E.mx, E.mx); wallDrag.y = clamp(wallDrag.y, -E.my, E.my); }
            const tx = touch ? wallDrag.x : -mx * E.mx, ty = touch ? wallDrag.y : -my * E.my;
            this.px = lerp(this.px, tx, k8); this.py = lerp(this.py, ty, k8);
            const tilt = touch ? 0 : 1;
            v = [0, lastK[1], -my * 3 * tilt, mx * 4 * tilt, 0, this.px, this.py + E.yOff, 0, 1];
          } else {
            let a = K[0], b = lastK;
            for (let i = 0; i < K.length - 1; i++) if (t >= K[i][0] && t <= K[i + 1][0]) { a = K[i]; b = K[i + 1]; break; }
            const e = eInOut((t - a[0]) / (b[0] - a[0])); v = a.map((x, i) => lerp(x, b[i], e));
          }
          // Beginner: the same camera path, with half the tilt and turn.
          const cam = TIER.camera;
          $("wall").style.transform = "translate(-50%,-50%) translate3d(" + v[5].toFixed(1) + "px," + v[6].toFixed(1) + "px," + v[1].toFixed(1) + "px) rotateX(" + (v[2] * cam).toFixed(2) + "deg) rotateY(" + (v[3] * cam).toFixed(2) + "deg) rotateZ(" + (v[4] * cam).toFixed(2) + "deg)";
          $("wallCam").style.filter = v[7] > 0.05 ? "blur(" + v[7].toFixed(1) + "px)" : "none";
          $("wallCam").style.opacity = v[8].toFixed(3);
          const flat = clamp((t - 3.7) / 1.6), dim = clamp((t - 5.0) / 0.4) * (1 - clamp((t - 6.4) / 0.5));
          tiles.forEach((tile, i) => {
            const p = eOut((t - (tile._d != null ? tile._d : 0.1)) / 0.7), off = ((i * 37) % 5 - 2) * 70 * (1 - flat);
            tile._h = lerp(tile._h || 0, tile._hov ? 1 : 0, clamp((dt || 0.016) * 12));
            tile.style.opacity = (i === focusIdx ? p : p * (1 - 0.65 * dim)).toFixed(3);
            tile.style.transform = "translateZ(" + (off - 500 * (1 - p) + 80 * tile._h).toFixed(1) + "px) scale(" + (1 + 0.05 * tile._h).toFixed(3) + ")";
          });
        };
      }
      list.push(s);
    }
    if (reelClips.length >= 2) {
      const n = reelClips.length, SEG = reelSeg(n), cyc = n * SEG + (reelMore > 0 ? 1.8 : 0);
      list.push({ id: "videos", dur: Infinity, label: "Video reel", chord: "Bb", kicker: $("reelKicker"), ready: REEL_OPEN + SEG * 2 + 0.2,
        cues: [[0.05, () => SFX.riser(0.95)]],
        enter() {
          stopMedia(sceneEl("videos")); this.k = -1; reelCur = -1; $("reelTitle").style.opacity = 1; $("reelLower").style.opacity = 0; $("reelMore").style.opacity = 0;
          reelClips.forEach((c) => { c.el.classList.remove("cur"); });
        },
        update(t) {
          // A title card, then each video full screen for 3 beats (hard cut, flash, punch-in), then how many more
          // there are, and round again until the viewer moves on.
          $("reelTitle").style.opacity = (1 - clamp((t - REEL_OPEN + 0.15) / 0.2)).toFixed(3);
          const q = t < REEL_OPEN ? -1 : (t - REEL_OPEN) % cyc, k = q < 0 ? -1 : q >= n * SEG ? -2 : Math.floor(q / SEG);
          if (k !== this.k) {
            if (this.k >= 0) { const o = reelClips[this.k]; o.el.classList.remove("cur"); o.v.pause(); o.v.classList.remove("live"); }
            this.k = k; reelCur = k;
            if (k === -2) { $("reelLower").style.opacity = 0; if (playing) { SFX.whoosh(0.8, true); SFX.impact(0.45); flash(0.35); } }
            if (k >= 0) {
              // a tall video on a wide screen (or a wide one on a tall screen) is shown whole
              const c = reelClips[k]; c.el.classList.add("cur"); c.el.classList.toggle("contain", (c.v.dataset.tall === "1") === (W > H)); startVideo(c.v, 0.45);
              flash(0.35); SFX.impact(0.32);
              $("rlCount").textContent = pad2(k + 1) + " / " + pad2(n); $("rlTitle").textContent = c.p.title;
              $("rlMeta").innerHTML = ICON.tri + "Video · "; $("rlMeta").appendChild(document.createTextNode(catOf(c.p.cat).label));
              const lo = $("reelLower"); lo.style.opacity = 1; lo.classList.remove("swap"); void lo.offsetWidth; lo.classList.add("swap");
            }
          }
          if (this.k >= 0) { const c = reelClips[this.k], lt = q - this.k * SEG; c.v.style.transform = "scale(" + (1 + 0.14 * (1 - eOut(lt / 0.35)) + 0.03 * clamp(lt / SEG)).toFixed(4) + ")"; }
          if (reelMore > 0) {
            const mo = $("reelMore"), mq = q - n * SEG;
            mo.style.opacity = k === -2 ? clamp(mq / 0.3).toFixed(3) : "0";
            if (k === -2) { $("rmWall").style.transform = "rotate(-12deg) translateX(" + (-mq * 46).toFixed(1) + "px)"; $("rmBig").style.transform = "scale(" + (1.5 - 0.5 * eBack(mq / 0.5)).toFixed(3) + ")"; }
          }
        } });
    }
    if (U.ratingCount) {
      list.push({ id: "ratings", dur: Infinity, label: "Ratings", chord: "G", kicker: $("rateKicker"), ready: 4.2,
        cues: [[0.1, () => SFX.whoosh(0.7, false)], ...[0, 1, 2, 3, 4].map((i) => [1.55 + i * 0.16, () => SFX.ping([1046.5, 1174.7, 1318.5, 1568, 1760][i], 0.09)]),
          [2.5, () => { SFX.impact(TIER.slam ? 1 : 0.25); flash(0.3); const r = $("scoreNum").getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, reduce ? 0 : 190); if (ST.hit) ST.hit("score", r.left + r.width * 0.9, r.top + r.height * 0.15); }]],
        update(t) {
          starEls.forEach((s, i) => {
            s.line.style.strokeDasharray = STAR_LEN; s.line.style.strokeDashoffset = (STAR_LEN * (1 - eInOut((t - 0.15 - i * 0.12) / 0.8))).toFixed(2);
            s.rect.setAttribute("y", (20.6 - 18.3 * starFill[i] * eInOut((t - 0.9 - i * 0.16) / 0.65)).toFixed(2));
          });
          const ts = t - 2.5, sn = $("scoreNum");
          $("scoreOf").style.opacity = clamp(ts / 0.45).toFixed(3);
          if (ts < 0) { sn.style.opacity = 0; }
          else if (TIER.slam) { const e = clamp(ts / 0.45); sn.style.opacity = clamp(e * 3).toFixed(3); sn.style.transform = "scale(" + (3 - 2 * eBack(e)).toFixed(3) + ")"; sn.style.filter = e < 1 ? "blur(" + (12 * (1 - e)).toFixed(1) + "px)" : "none"; }
          else { const e = eOut(ts / 0.7); sn.style.opacity = e.toFixed(3); sn.style.transform = "scale(" + (1.12 - 0.12 * e).toFixed(3) + ")"; sn.style.filter = "none"; }   // Beginner and Average: it simply fades in
          const sh = ts > 0 && ts < 0.5 && !reduce && TIER.shake ? (1 - ts / 0.5) * 14 : 0;
          $("rate").style.transform = "translate(" + ((Math.random() - 0.5) * sh).toFixed(1) + "px," + ((Math.random() - 0.5) * sh).toFixed(1) + "px)";
          $("rate").style.opacity = "1";
          $("rateLow").style.opacity = clamp((t - 2.9) / 0.5).toFixed(3);
          const q = eOut((t - 2.95) / 1.2); $("trustArc").style.strokeDashoffset = (339.29 * (1 - U.trust / 100 * q)).toFixed(2); $("trustNum").textContent = Math.round(U.trust * q) + "%";
          eqBars.forEach((b, k) => { b.bar.style.transform = "scaleX(" + (b.v * eOut((t - 3.05 - k * 0.08) / 0.9)).toFixed(3) + ")"; });
        } });
    }
    if (U.feedback.length) {
      const STEP = 1.8;
      list.push({ id: "feedback", dur: Infinity, label: "Feedback", chord: "Em", kicker: $("fbKicker"), ready: 1.6 + (msgEls.length - 1) * STEP + 0.6,
        cues: [[0.1, () => SFX.whoosh(0.8, true)],
          ...msgEls.flatMap((m, i) => [[0.9 + i * STEP, () => m.classList.add("typing")], [1.05 + i * STEP, () => SFX.tick(0.06)], [1.3 + i * STEP, () => SFX.tick(0.05)],
            [1.6 + i * STEP, () => { m.classList.remove("typing"); m.classList.add("show"); SFX.pop(); SFX.ping(1568, 0.05); }]])],
        enter() { msgEls.forEach((m) => m.classList.remove("typing", "show")); $("chat").classList.remove("leave"); },
        update(t) { Array.prototype.forEach.call($("kwLayer").children, (s, i) => { s.style.transform = "translateX(" + ((i % 2 ? -1 : 1) * t * 14).toFixed(1) + "px)"; }); } });
    }
    list.push({ id: "end", dur: Infinity, label: "Conclusion", chord: "Cmaj", ready: Infinity,
      cues: [[0.05, () => { SFX.impact(TIER.hype ? 0.7 : 0.3); burst(W / 2, H * 0.3, reduce ? 0 : 90); }]],
      update(t) {
        // Intermediate and Advanced (and Average): the card flips in. Beginner: it rises in gently.
        const card = $("endcard"), f = TIER.endFlip ? (1 - eBack(t / 1.4)) * -110 : 0, rise = TIER.endFlip ? 0 : (1 - eOut(t / 0.9)) * 40;
        card.style.opacity = TIER.endFlip ? "1" : eOut(t / 0.7).toFixed(3);
        card.style.transform = "translateY(" + rise.toFixed(1) + "px) rotateY(" + (f + mx * 10).toFixed(2) + "deg) rotateX(" + (-my * 8).toFixed(2) + "deg)";
        card.style.setProperty("--ang", ((clock * 70) % 360).toFixed(1) + "deg");
        card.style.setProperty("--sx", (50 + mx * 45).toFixed(1) + "%"); card.style.setProperty("--sy", (35 + my * 45).toFixed(1) + "%");
      } });
    list.forEach((s, i) => {
      s.el = sceneEl(s.id); s.layers = Array.from(s.el.querySelectorAll("[data-depth]")).map((e) => ({ el: e, d: +e.dataset.depth }));
      if (s.kicker) s.kicker.textContent = pad2(i) + " · " + s.label;
    });
    return list;
  }

  // ---------- Playback: the viewer moves through the parts at their own pace; nothing runs on a timer ----------
  // pendDt, lastFstep: a style with its own frame rate (Papercut's stop motion) draws only on its own frames.
  let SC = [], idx = 0, local = 0, playing = false, raf = 0, last = 0, clock = 0, fired = new Set(), trans = null, enteredAt = 0, pendDt = 0, lastFstep = -1;
  let mx = 0, my = 0, mxT = 0, myT = 0, lastPointer = "mouse", suppressClick = false;
  let wallDrag = { x: 0, y: 0 }, wallDragged = false, wallPtr = null, swipe = null;
  const readyAt = (s) => (typeof s.ready === "function" ? s.ready() : s.ready != null ? s.ready : 0);
  // Going back: a quick "scroll up the profile page" slide.
  function applyTrans(p) {
    const T = trans, e = eInOut(p);
    T.from.el.style.transform = "translate3d(0," + (-e * 100 * T.dir).toFixed(2) + "%,0)"; T.from.el.style.opacity = (1 - 0.6 * e).toFixed(3);
    T.to.el.style.transform = "translate3d(0," + ((1 - e) * 100 * T.dir).toFixed(2) + "%,0)";
    if (T.from.leave) T.from.leave(e * T.dir);
  }

  // ---------- Going forward: a chapter card between parts, about 5 seconds ----------
  // The old part leaves, a card for the next part comes in (its number, its name and a line about it), and it opens
  // onto the new part. Four looks take turns, so no two changes in a row look alike: a warp (streaks of light rush
  // past), a shutter (slats close, then open), an iris (a circle closes, then opens) and a card flip. The level sets
  // how hard it hits. The music goes muffled under the card and opens up with the new part. A tap hurries it along.
  const XT_KINDS = ["warp", "shutter", "iris", "flip"], XT_DUR = 5.0, XT_SWAP = 3.8;
  let xt = null, xtTurn = 0;
  function xtSub(s) {
    const pc = U.portfolio.length, ns = U.services.length;
    switch (s.id) {
      case "stats": return "By the numbers";
      case "profile": return "Meet " + U.first;
      case "services": return U.multi ? plural(ns, "service", "services") + " in " + U.roles.length + " kinds of work" : plural(ns, "service", "services") + (U.lowestPrice ? " · from " + U.lowestPrice : "");
      case "projects": return plural(pc, "project", "projects") + (U.videoCount ? ", " + plural(U.videoCount, "video", "videos") : "") + " · open any to see it big";
      case "videos": return reelMore > 0 ? "The top " + reelClips.length + " of " + U.videoCount + " videos" : plural(U.videoCount, "video", "videos");
      case "ratings": return U.rating.toFixed(1) + "★ from " + plural(U.ratingCount, "client", "clients");
      case "feedback": return "What clients say about " + U.first;
      case "end": return "Work with " + U.first;
      default: return "";
    }
  }
  function startX(i) {
    const to = SC[i]; if (!to) return;
    const kinds = ST.xtKinds || XT_KINDS;   // a style has its own changes (paper sheets, pixel wipes, page turns...)
    xt = { from: SC[idx], to, i, e: 0, kind: kinds[xtTurn++ % kinds.length], swapped: false, fast: false, titled: false };
    const ov = $("xt"), tc = hex(TIER.color).join(",");
    ov.className = "xt " + xt.kind + (TIER.hype ? "" : " calm"); ov.style.transform = ""; ov.style.opacity = "";
    ov.style.setProperty("--tc", tc); $("xtRing").style.setProperty("--tc", tc);
    $("xtNum").textContent = pad2(i) + " / " + pad2(SC.length - 1); $("xtTitle").textContent = to.label; $("xtSub").textContent = xtSub(to);
    film.classList.add("in-x");
    if (ST.xtStart) ST.xtStart(xt);
    SFX.whoosh(0.9, true); musicMuffle(true);
    if (TIER.hype) SFX.riser(XT_SWAP - 0.4);
    if (xt.kind === "flip") SFX.whoosh(0.45, false);
    applyX(0);
  }
  function stepX(dt) {
    const T = xt; T.e += dt * (T.fast ? 2.5 : 1); const x = T.e;
    if (!T.titled && x >= 1.2) { T.titled = true; if (TIER.hype) { SFX.impact(0.55); speedLines(1); shake(6); flash(0.16); } else SFX.ping(TIER.key === "average" ? 1318.5 : 1046.5, 0.06); if (ST.hit) ST.hit("chapter", W / 2, H * 0.36); }   // the title lands
    if (!T.swapped && x >= XT_SWAP) {
      // The card covers the screen: switch parts underneath, then open onto the new one.
      T.swapped = true; ["transform", "filter", "opacity", "clipPath"].forEach((k) => { T.from.el.style[k] = ""; });
      go(T.i, "x"); musicMuffle(false);
      if (TIER.hype) { flash(0.45); SFX.impact(0.45); shake(6); speedLines(1.2); if (A.ctx && beatOn(SC[idx]) && SC[idx].id !== "end") { beatFrom(now() + 0.03); if (ST.music) ST.music.part(); else crash(A.nextStep, GROOVE[TIER.key].crash); } }
      else { SFX.whoosh(0.7, false); SFX.ping(1568, 0.04); if (ST.music && A.ctx && beatOn(SC[idx]) && ST.music.restartOnPart) beatFrom(now() + 0.03); }
    }
    if (x >= XT_DUR) endX();   // (the picture is drawn in frame(), so a style can draw it at its own frame rate)
  }
  function applyX(x) {
    const T = xt, ov = $("xt"), body = $("xtBody"), from = T.from.el, to = T.to.el, hype = TIER.hype, P2 = "perspective(1400px) ";
    // The card's own motion: the line draws, the number and the title come in (a slam on the hype levels, a rise
    // otherwise), then the line about the part; it drifts closer while it holds.
    $("xtLine").style.transform = "scaleX(" + eOut((x - 1.0) / 0.6).toFixed(3) + ")";
    const ne = clamp((x - 1.05) / 0.3), nm = $("xtNum"); nm.style.opacity = ne.toFixed(3); nm.style.transform = "translateY(" + ((1 - ne) * 12).toFixed(1) + "px)";
    const tt = $("xtTitle"), te = clamp((x - 1.15) / (hype ? 0.4 : 0.7));
    if (hype) { tt.style.opacity = clamp(te * 4).toFixed(3); tt.style.transform = "scale(" + lerp(1.8, 1, eBack(te)).toFixed(3) + ")"; tt.style.filter = te > 0 && te < 1 ? "blur(" + (10 * (1 - te)).toFixed(1) + "px)" : ""; }
    else { tt.style.opacity = clamp(te * 2).toFixed(3); tt.style.transform = "translateY(" + ((1 - eOut(te)) * 105).toFixed(1) + "%)"; tt.style.filter = ""; }
    const se = clamp((x - 1.7) / 0.45), sb = $("xtSub"); sb.style.opacity = se.toFixed(3); sb.style.transform = "translateY(" + ((1 - eOut(se)) * 10).toFixed(1) + "px)";
    let bo = x < 0.9 ? 0 : 1, bs = 1 + 0.03 * clamp((x - 1.5) / 2.3);
    const sx = ST.xtApply ? ST.xtApply(T, x, from, to, ov) : null;   // a style's own change returns the card's opacity and scale
    if (sx) { bo = sx.bo; if (sx.bs != null) bs = sx.bs; }
    else if (T.kind === "warp") {
      // The old part rushes toward the camera into streaks of light; the card grows out of the middle; at the end
      // it flies past the camera and the new part settles in.
      const a = clamp(x / 0.9), out = clamp((x - XT_SWAP) / 0.6);
      if (!T.swapped) { from.style.transform = "scale(" + (1 + 0.6 * a * a).toFixed(4) + ")"; from.style.filter = "blur(" + (8 * a).toFixed(1) + "px)"; from.style.opacity = (1 - a).toFixed(3); }
      $("xtBg").style.opacity = (clamp((x - 0.5) / 0.5) * (1 - out)).toFixed(3);
      bs *= (x < 0.9 ? 0.4 : lerp(0.4, 1, eBack(clamp((x - 0.9) / 0.6)))) * (1 + 1.6 * out * out); bo = clamp((x - 0.9) / 0.2) * (1 - out);
      if (T.swapped) { const r = eOut(clamp((x - XT_SWAP) / 0.8)); to.style.transform = "scale(" + (0.86 + 0.14 * r).toFixed(4) + ")"; to.style.filter = r < 1 ? "blur(" + (8 * (1 - r)).toFixed(1) + "px)" : ""; to.style.opacity = clamp(r * 1.5).toFixed(3); }
    } else if (T.kind === "shutter") {
      // Dark slats close over the old part from alternating sides; the card is printed across them; they open again.
      $("xtBg").style.opacity = "0";
      Array.from($("xtSlats").children).forEach((s, k) => {
        const cl = eInOut(clamp((x - k * 0.05) / 0.6)), op = eInOut(clamp((x - XT_SWAP - k * 0.05) / 0.6));
        s.style.transformOrigin = ((k % 2 === 0) !== T.swapped ? "left" : "right") + " center";
        s.style.transform = "scaleX(" + (T.swapped ? 1 - op : cl).toFixed(3) + ")";
      });
      if (!T.swapped) from.style.filter = "brightness(" + (1 - 0.5 * clamp(x / 0.9)).toFixed(3) + ")";
      bo = clamp((x - 0.95) / 0.3) * (1 - clamp((x - XT_SWAP + 0.15) / 0.2));
    } else if (T.kind === "iris") {
      // A circle closes on the middle of the old part, with a ring of light at its edge; the card shows in the dark;
      // the circle opens again on the new part.
      const R = Math.hypot(W, H) / 2 + 24;
      const r = !T.swapped ? R * (1 - eInOut(clamp(x / 0.9))) : R * eInOut(clamp((x - XT_SWAP - 0.1) / 0.9));
      ov.style.setProperty("--r", r.toFixed(1) + "px"); $("xtBg").style.opacity = "1";
      const ring = $("xtRing"); ring.style.width = ring.style.height = (2 * r).toFixed(0) + "px"; ring.style.opacity = r > 3 && r < R - 3 ? "1" : "0";
      bo = clamp((x - 1.0) / 0.3) * (1 - clamp((x - XT_SWAP) / 0.2));
    } else {
      // The whole picture flips over like a card: the chapter card is on its back; it flips again onto the new part.
      $("xtBg").style.opacity = "1";
      if (!T.swapped) { const a = clamp(x / 0.7); from.style.transform = P2 + "rotateY(" + (90 * a * a).toFixed(2) + "deg)"; from.style.opacity = a >= 1 ? "0" : "1"; }
      const inn = eOut(clamp((x - 0.7) / 0.6)), outn = clamp((x - XT_SWAP) / 0.6);
      const rot = x < 0.7 ? -90 : T.swapped && outn > 0 ? 90 * outn * outn : -90 + 90 * inn;
      ov.style.transform = P2 + "rotateY(" + rot.toFixed(2) + "deg)";
      bo = x < 0.7 ? 0 : 1;
      if (T.swapped) { const b = eOut(clamp((x - XT_SWAP - 0.6) / 0.6)); to.style.transform = P2 + "rotateY(" + (-90 + 90 * b).toFixed(2) + "deg)"; to.style.opacity = x < XT_SWAP + 0.6 ? "0" : "1"; }
    }
    body.style.opacity = bo.toFixed(3); body.style.transform = "translateY(-50%) scale(" + bs.toFixed(4) + ")";
  }
  function endX() {
    if (!xt) return; const T = xt; xt = null;
    ["transform", "filter", "opacity", "clipPath"].forEach((k) => { T.to.el.style[k] = ""; T.from.el.style[k] = ""; });
    const ov = $("xt"); ov.style.transform = ""; ov.style.opacity = ""; ov.style.clipPath = ""; ov.style.removeProperty("--r");
    if (ST.xtEnd) ST.xtEnd(T);
    Array.from($("xtSlats").children).forEach((s) => { s.style.transform = ""; });
    film.classList.remove("in-x");
  }
  function skipX() { if (!xt) return; if (!xt.swapped) { xt.e = Math.max(xt.e, XT_SWAP); xt.fast = true; xt.titled = true; } else endX(); }
  function cancelX() { if (!xt) return; endX(); musicMuffle(false); }
  // The warp's streaks of light, rushing out from the middle (on the effects canvas, over the chapter card)
  const WARP = Array.from({ length: 90 }, () => ({ a: Math.random() * Math.PI * 2, o: Math.random(), w: 0.6 + Math.random() * 1.6 }));
  function drawWarp(x) {
    const k = clamp(x / 0.6) * (1 - clamp((x - XT_SWAP - 0.2) / 0.5)); if (k <= 0 || reduce) return;
    const sp = 0.25 + 1.4 * clamp(x / 1.2) * (x < XT_SWAP ? 1 : 1.8), cx = W / 2, cy = H / 2, R = Math.hypot(W, H) / 2, col = hex(TIER.color).join(",");
    fxX.save(); fxX.globalCompositeOperation = "lighter";
    for (const s of WARP) {
      const q = (s.o + x * sp) % 1, r = R * (0.04 + q * q * 1.15), len = r * (0.12 + 0.35 * q) * (TIER.hype ? 1 : 0.6);
      fxX.globalAlpha = k * q * (TIER.hype ? 0.85 : 0.5); fxX.strokeStyle = q > 0.7 ? "rgb(255,255,255)" : "rgb(" + col + ")"; fxX.lineWidth = s.w * (0.5 + q * 1.5);
      fxX.beginPath(); fxX.moveTo(cx + Math.cos(s.a) * r, cy + Math.sin(s.a) * r); fxX.lineTo(cx + Math.cos(s.a) * (r + len), cy + Math.sin(s.a) * (r + len)); fxX.stroke();
    }
    fxX.restore();
  }
  function finishTrans() {
    if (!trans) return;
    const T = trans; trans = null;
    T.from.el.classList.remove("on"); stopMedia(T.from.el);
    ["transform", "opacity", "filter"].forEach((k) => { T.from.el.style[k] = ""; T.to.el.style[k] = ""; });
  }
  function go(i, how) {
    i = clamp(i, 0, SC.length - 1);
    finishTrans();
    const prev = SC[idx], s = SC[i];
    // Back is a quick slide. Going forward comes from the chapter card (startX), which covers the screen while it
    // switches parts ("x"), so nothing else animates here.
    const animate = how === "back" && prev && prev !== s && prev.el.classList.contains("on") && !reduce;
    SC.forEach((x) => { if (x !== s && !(animate && x === prev)) { if (x.el.classList.contains("on")) stopMedia(x.el); x.el.classList.remove("on"); } });
    s.el.classList.remove("on"); idx = i; local = 0; fired = new Set(); enteredAt = clock;
    void s.el.offsetWidth; s.el.classList.add("on");
    if (s.enter) s.enter();
    if (animate) { trans = { from: prev, to: s, e: 0, dur: 0.75, dir: -1 }; applyTrans(0); SFX.whoosh(0.6, false); }
    if (how === "next") SFX.whoosh(0.6, true);   // reduced motion: a plain change, no chapter card
    if (i === 0) embers = [];
    if (s.id !== "pull") { fxFrozen = false; if (A.ctx) { droneStop(0.4); if (ST.music) ST.music.waitStop(); } }
    if (!["open", "count", "pull"].includes(s.id)) { film.style.setProperty("--bars", 1); film.style.setProperty("--hud", 1); }
    film.classList.toggle("is-end", s.id === "end"); film.classList.toggle("at-start", i === 0);
    film.dataset.part = s.id;   // the styles change their backgrounds per part
    const pal = PAL[s.id] || PAL.intro;
    palTo = (TIER.gold && s.id !== "pull" ? ["#f59e0b", pal[1], pal[2]] : pal).map(hex);   // the card draw starts dark and colors the room itself
    if (A.ctx && !ST.music && s.chord && s.chord !== A.chord) padTo(s.chord);
    if (ST.go) ST.go(s, i);
    if (s.id !== "ratings" && s.id !== "end") conf = [];
    const ch = $("chapter"); ch.innerHTML = "<span>" + (i ? pad2(i) + " / " + pad2(SC.length - 1) : "") + "</span><b></b>"; ch.querySelector("b").textContent = s.label;
    ch.classList.remove("swap"); void ch.offsetWidth; ch.classList.add("swap");
    const nx = SC[i + 1]; $("nextLabel").textContent = nx ? nx.label : "";
    if (s.id === "end") setTimeout(() => $("ctaMsg").focus({ preventScroll: true }), 400);
  }
  // Next part: a tap anywhere, Next, the right arrow, Space or Enter, or a swipe to the left.
  function advance() {
    if (xt) { skipX(); return; }   // a tap during the chapter card hurries it along
    const s = SC[idx]; if (!s || s.id === "end" || VW.open) return;
    if (s.id === "pull" && (drawWaiting() || local < readyAt(s))) return;   // the card opens all the way first
    if (clock - enteredAt < 0.35) return;   // a double tap doesn't skip a part
    if (reduce) go(idx + 1, "next"); else startX(idx + 1);
  }
  function back() { if (idx > 0 && !VW.open && !xt) go(idx - 1, "back"); }
  function frame(nowMs) {
    const dt = last ? Math.min((nowMs - last) / 1000, 0.1) : 0; last = nowMs; clock += dt;
    if (trans) { trans.e += dt; if (trans.e >= trans.dur) finishTrans(); }
    if (xt) stepX(dt);
    const s = SC[idx];
    if (playing && !VW.open && !(xt && !xt.swapped)) {   // the part waits while a project is open, and while the chapter card covers it
      local += dt;
      s.cues.forEach((c, k) => { if (!fired.has(k) && local >= c[0]) { fired.add(k); c[1](); } });
      if (s.auto && local >= s.dur) go(idx + 1, "auto");   // only the older openings move on by themselves
    }
    mx = lerp(mx, mxT, clamp(dt * 4)); my = lerp(my, myT, clamp(dt * 4));
    const cur = SC[idx];
    // The picture. Papercut draws it only 12 times a second, like stop motion (time and music still run smoothly);
    // every other style draws it on every frame.
    pendDt += dt;
    const fps = reduce ? 0 : ST.fps || 0, fstep = fps ? Math.floor(clock * fps) : -1;
    if (!fps || fstep !== lastFstep) {
      lastFstep = fstep; const fdt = pendDt; pendDt = 0;
      if (trans) applyTrans(trans.e / trans.dur);
      if (xt) applyX(xt.e);
      cur.update(local, fdt);
      if (!reduce) cur.layers.forEach((l) => { l.el.style.transform = "translate3d(" + (mx * l.d).toFixed(1) + "px," + (my * l.d).toFixed(1) + "px,0)"; });
      if (ST.bg) ST.bg(clock, fdt, cur.id); else drawBg(clock, fdt);
      fxX.clearRect(0, 0, W, H);
      if (ST.ambient) ST.ambient(fxX, clock, fdt, cur.id); else if (!ST.id) drawDust(clock, fdt);
      if (cur.id === "pull") drawPull(local, fdt);
      if (cur.id === "intro") drawParticles(local, cur.dur, clock);
      if (xt && xt.kind === "warp") drawWarp(xt.e);
      if (xt && ST.xtDraw) ST.xtDraw(fxX, xt, xt.e);
      drawEmbers(fdt); drawLines(); drawConfetti(fdt);
      if (ST.frame) ST.frame(cur, local, fdt);
    }
    // Hype levels: the screen edges pulse on the beat.
    let pulse = 0;
    if (TIER.hype && playing && !VW.open && !xt && beatOn(cur) && cur.id !== "end") {
      const ph = A.ctx && A.ctx.state === "running" ? ((((now() - A.gridT0) / A.BEAT) % 1) + 1) % 1 : (clock / A.BEAT) % 1;
      pulse = Math.pow(1 - clamp(ph), 4) * 0.5;
    }
    $("pulse").style.opacity = pulse.toFixed(3);
    shakeV = Math.max(0, shakeV - dt * 40);
    fxC.style.transform = shakeV > 0.3 ? "translate(" + ((Math.random() - 0.5) * shakeV).toFixed(1) + "px," + ((Math.random() - 0.5) * shakeV).toFixed(1) + "px)" : "";
    flashV = Math.max(0, flashV - dt * 2.4); $("flash").style.opacity = flashV.toFixed(3);
    film.classList.toggle("ready", !xt && cur.id !== "end" && local >= readyAt(cur));
    film.classList.toggle("in-draw", cur.id === "pull" && local < readyAt(cur));
    schedule();
    raf = requestAnimationFrame(frame);
  }
  function setPlaying(v) {
    playing = v; film.classList.toggle("paused", !v);
    if (A.ctx) { if (v) A.ctx.resume(); else A.ctx.suspend(); }
    film.querySelectorAll(v ? "video.live" : "video").forEach((x) => { if (v) { const pr = x.play(); if (pr && pr.catch) pr.catch(() => {}); } else x.pause(); });
  }
  function sceneVideos(pause) { const s = SC[idx]; if (!s) return; s.el.querySelectorAll("video.live").forEach((x) => { if (pause) x.pause(); else { const pr = x.play(); if (pr && pr.catch) pr.catch(() => {}); } }); }

  // ---------- Opening a project: the site's own project viewer (PortfolioViewer, shown by HighlightsPlayer) ----------
  // The film waits while it is open (the part stops, its videos pause, the music steps back) and carries on
  // when the viewer is closed (viewerClosed). The viewer has the usual protections and the Report button.
  const VW = { open: false, from: null };
  function openViewer(i, fromEl) {
    const p = U.portfolio[i]; if (!p || VW.open || stopped) return;
    VW.open = true; VW.from = fromEl || null; film.classList.add("viewing"); sceneVideos(true);
    if (A.ctx) A.music.gain.setTargetAtTime(0.25, now(), 0.15);
    SFX.whoosh(0.5, true);
    if (opts.onOpenProject) opts.onOpenProject(p.id);
  }
  function viewerClosed() {
    if (!VW.open || stopped) return; VW.open = false; film.classList.remove("viewing");
    sceneVideos(false);
    if (A.ctx) A.music.gain.setTargetAtTime(0.7, now(), 0.25);
    SFX.whoosh(0.4, false);
    const back = VW.from && VW.from.isConnected && VW.from.offsetParent ? VW.from : film; back.focus({ preventScroll: true });
  }

  // ---------- Start and stop ----------
  function start() {
    A.on = opts.sound !== false;
    if (audioInit()) { A.master.gain.value = A.on ? 0.55 : 0; A.ctx.resume(); } else { $("soundBtn").hidden = true; }
    setSoundIcon();
    // The level decides the style of this highlight (the owner can preview another level's style).
    TIER = TIERS[opts.levelPick] || TIERS[U.lvl.key] || TIERS.beginner; A.BEAT = 60 / TIER.bpm; A.STEP = A.BEAT / 4; D = DRAWS[TIER.key];
    film.classList.remove("tier-beginner", "tier-average", "tier-intermediate", "tier-advanced"); film.classList.add("tier-" + TIER.key);
    applyLook();   // the highlight style (after the level: a style's music speed depends on the level)
    PCOL = TIER.gold ? ["#fffbeb", "#fde68a", "#f59e0b"] : ["#ffffff", "#fdba74", "#f97316"];
    if (A.sfx) A.sfx.gain.value = TIER.hype ? 0.85 : 0.65;
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    lastPointer = coarse ? "touch" : "mouse"; film.classList.toggle("touchy", coarse); $("ghLong").textContent = coarse ? "Tap anywhere to continue" : "Click anywhere to continue";
    xtTurn = 0; embers = []; lines = null; shakeV = 0; wallDrag = { x: 0, y: 0 }; lastFstep = -1; pendDt = 0;
    playing = false; buildFilm(); resize();
    if (ST.build) ST.build();   // the style's decorations, its picture treatment and so on
    conf = []; flashV = 0; clock = 0; last = 0; idx = 0; trans = null;
    film.style.setProperty("--bars", 0); film.style.setProperty("--hud", 0);
    if (A.ctx) { padTo(null); beatFrom(now() + 0.05); }
    go(0); setPlaying(true);
    raf = requestAnimationFrame(frame);
    focusStart();
  }
  // The highlight style: a Premium style's hooks, or none for the Director's Cut. Each player is built fresh, so
  // this runs once. .hl-st marks the film while a style plays (its CSS sits under .hl-film.hl-st.st-<id>).
  function applyLook() {
    ST = {};
    if (opts.style) {
      try { ST = makeStyle(api, opts.style); } catch (e) { ST = {}; if (import.meta.env.DEV) console.error("highlight style:", e); }
    }
    if (ST.id) film.classList.add("hl-st", "st-" + ST.id);
    Object.assign(SFX, SFX0, ST.sfx || {});
    if (ST.music) { A.BEAT = 60 / ST.music.bpm(TIER.key); A.STEP = A.BEAT / 4; }
  }
  // Keyboard focus at the start: on the card while it waits for its taps (Space or Enter taps it), else on Next.
  function focusStart() { (drawWaiting() ? $("drawTap") : $("nextBtn")).focus({ preventScroll: true }); }
  // Close asks the page to close the player (HighlightsPlayer then calls stop()).
  function requestClose() { if (!stopped && opts.onClose) opts.onClose(); }
  function stop() {
    if (stopped) return; stopped = true;
    cancelAnimationFrame(raf); raf = 0; playing = false; xt = null; finishTrans(); stopMedia(film);
    if (A.ctx) { const c = A.ctx; A.ctx = null; A.drone = null; A.pads = []; c.close().catch(() => {}); }
    window.removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("keydown", onKey);
    if (opts.debug) delete window.__hl;
    root.remove();   // with every element and listener it had
  }

  $("closeBtn").addEventListener("click", requestClose);
  $("soundBtn").addEventListener("click", () => { A.on = !A.on; if (A.master) A.master.gain.setTargetAtTime(A.on ? 0.55 : 0, now(), 0.05); setSoundIcon(); });
  $("backBtn").addEventListener("click", back);
  $("nextBtn").addEventListener("click", advance);
  $("replayBtn").addEventListener("click", () => { cancelX(); if (A.ctx) padTo(null); go(0); setPlaying(true); focusStart(); });
  $("drawTap").addEventListener("click", drawTap);
  $("ctaMsg").addEventListener("click", () => { if (opts.onMessage) opts.onMessage(); });
  $("ctaSvc").addEventListener("click", () => { if (opts.onSeeServices) opts.onSeeServices(); });
  $("peAll").addEventListener("click", (e) => openViewer(0, e.currentTarget));
  $("rlView").addEventListener("click", () => { const c = reelClips[reelCur]; if (c) openViewer(U.portfolio.findIndex((p) => p.id === c.p.id), $("reelStage")); });
  // A tap or click anywhere that isn't a button or a project moves on (inside the black bars it does nothing).
  film.addEventListener("click", (e) => {
    if (VW.open || suppressClick || wallDragged) { wallDragged = false; return; }
    if (e.target.closest('button, a, [role="button"], .hud-top, .hud-bot, .proj-explore')) return;
    const r = film.getBoundingClientRect(), y = e.clientY - r.top;
    if (y < BAR || y > H - BAR) return;
    advance();
  });
  // (.touchy: the last pointer was a finger or a pen, so project tiles show their eye buttons all the time)
  function setPointer(type) { if (type && type !== lastPointer) { lastPointer = type; film.classList.toggle("touchy", type !== "mouse"); } }
  film.addEventListener("pointermove", (e) => { mxT = (e.clientX / W - 0.5) * 2; myT = (e.clientY / H - 0.5) * 2; setPointer(e.pointerType); });
  // A swipe on a touchscreen: left for the next part, right to go back.
  film.addEventListener("pointerdown", (e) => {
    setPointer(e.pointerType || "mouse"); swipe = e.pointerType === "mouse" ? null : { id: e.pointerId, x: e.clientX, y: e.clientY, t: clock };
    if (A.ctx && A.ctx.state === "suspended" && playing) A.ctx.resume();   // some phones only let sound start on a touch
  });
  film.addEventListener("pointerup", (e) => {
    const sw = swipe; swipe = null;
    if (!sw || e.pointerId !== sw.id || wallDragged || VW.open) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4 || clock - sw.t > 0.9) return;
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 120);
    if (dx < 0) advance(); else back();
  });
  // Dragging the project wall with a finger, when it is bigger than the screen
  $("wallCam").addEventListener("pointerdown", (e) => { wallDragged = false; if (e.pointerType === "mouse") return; wallPtr = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }; });
  $("wallCam").addEventListener("pointermove", (e) => {
    if (!wallPtr || e.pointerId !== wallPtr.id) return;
    const s = SC[idx], E = s && s.id === "projects" && s.ex; if (!E || local < 7.0 || (E.mx < 4 && E.my < 4)) return;
    wallDrag.x += (e.clientX - wallPtr.x) / E.s; wallDrag.y += (e.clientY - wallPtr.y) / E.s; wallPtr.x = e.clientX; wallPtr.y = e.clientY;
    if (Math.hypot(e.clientX - wallPtr.sx, e.clientY - wallPtr.sy) > 10) wallDragged = true;
  });
  ["pointerup", "pointercancel"].forEach((ev) => $("wallCam").addEventListener(ev, () => { wallPtr = null; setTimeout(() => { wallDragged = false; }, 150); }));
  function onResize() { if (!stopped) resize(); }
  // The music sleeps while the tab is hidden, so it stays in time with the picture
  function onVisibility() { if (stopped || !A.ctx) return; if (document.hidden) A.ctx.suspend(); else if (playing) A.ctx.resume(); }
  function trapTab(e) {
    const f = Array.from(film.querySelectorAll('button, [role="button"][tabindex="0"]')).filter((b) => b.offsetParent !== null && !b.hidden && !b.closest(".scene:not(.on)") && getComputedStyle(b).visibility !== "hidden");
    if (!f.length) return; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
  }
  // Keys: while the project viewer is open it handles them itself.
  function onKey(e) {
    if (stopped || e.defaultPrevented || VW.open) return;
    const onBtn = e.target && e.target.closest && e.target.closest('button, [role="button"]');
    if (e.key === "Escape") { e.preventDefault(); requestClose(); }
    else if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); if (drawWaiting()) drawTap(); else advance(); }   // while the card waits, "next" is a tap
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); back(); }
    else if ((e.key === " " || e.key === "Enter") && !onBtn) { e.preventDefault(); if (drawWaiting()) drawTap(); else advance(); }
    else if (e.key === "Tab") trapTab(e);
  }
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("keydown", onKey);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!stopped) resize(); });
  // What a highlight style may read and use from the film (styles/kit.js and styles/*.js)
  const api = {
    A, SFX, SFX0, RARITY, film, $, el, txt, clamp, lerp, eOut, eInOut, eBack, hex, mulberry, pad2, reduce, nz,
    fx: fxX, bg: bgX, bgCanvas: bgC, sceneEl, pullGeom, audioInit, setSoundIcon,
    env, send, noiseHit, kick, clap, snare, hat, tom, crash, sub, bass, pluck, stab, brass, beatFrom, musicMuffle, now: () => A.ctx.currentTime,
    get W() { return W; }, get H() { return H; }, get BAR() { return BAR; }, get TIER() { return TIER; }, get D() { return D; }, get DS() { return DS; },
    get U() { return U; }, get SC() { return SC; }, get idx() { return idx; }, get local() { return local; }, get clock() { return clock; },
    get playing() { return playing; }, get mx() { return mx; }, get my() { return my; }, get THEME() { return THEME; },
    get cur() { return SC[idx]; }, get reelClips() { return reelClips; }, get reelCur() { return reelCur; }, get tiles() { return tiles; }, get cards() { return cards; },
    get filmOpen() { return !stopped; },
    beatOn: (s) => beatOn(s), drawWaiting: () => drawWaiting(), thrillAt: (t) => thrillAt(t), tierFor: () => TIER, tiers: TIERS
  };
  // For the automatic screenshot checks only (opts.debug): read-only state.
  if (opts.debug) window.__hl = { t: () => local, part: () => (SC[idx] ? SC[idx].id : ""), tier: () => TIER.key, ready: () => !!SC[idx] && local >= readyAt(SC[idx]), viewer: () => VW.open, step: () => A.step, x: () => (xt ? xt.kind + ":" + xt.e.toFixed(2) : ""), style: () => ST.id || "cinema", aud: () => A };
  start();
  return { stop, viewerClosed };
}
