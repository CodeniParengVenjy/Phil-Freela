/* Retro: an 8-bit video game. Pixel font, pixel pictures (the photos are redrawn with fewer, chunkier pixels),
   an old TV screen with scan lines, a pixel sky with stars. Music: chiptune (two square-wave voices, a triangle bass
   and noise drums), original tunes.
   By level: Beginner a calm "new player" tune and a plain item card; Average adds drums and arpeggios and the card
   spins open; Intermediate is a faster "boss" tune, the card cracks and the screen shakes; Advanced is the final-
   stage theme with an echo voice, a fanfare, LEVEL UP! and "You found a better person." typed in a dialog box. */
// Moved from the approved preview (previews/highlights-styles/st-retro.js) into the site's player
// (PLAN-highlight-styles.md, Step 2). The player loads this file only when a highlight in this style opens.
import "./retro.css";

export default {
  meta: {
    id: "retro", name: "Retro", premium: true, look: "An 8-bit video game: pixel art, pixel font, an old TV",
    music: "Chiptune: square waves and noise drums",
    levels: {
      beginner: "a plain \"?\" item card, a calm 8-bit tune, a starry pixel sky",
      average: "a blue RARE item that spins open, drums and fast arpeggios join the tune",
      intermediate: "an EPIC purple card that cracks and shakes the screen, then a faster boss-level tune",
      advanced: "the LEGENDARY gold card with a fanfare and LEVEL UP!, the message typed in a dialog box, then the final-stage theme"
    },
    art: '<i class="a1"></i><i class="a2"></i>'
  },
  make(api, K) {
    const A = K.A, tone = K.tone, noise = K.noise, P = (d) => K.pulse(d);
    const LV = { beginner: 0, average: 1, intermediate: 2, advanced: 3 };
    // ---------- Chip voices ----------
    const sq = (t, m, v, len, duty, dest) => tone(t, K.mtof(m), v, { wave: P(duty || 0.25), a: 0.003, hold: Math.max(0.02, len * A.STEP * 0.72), sus: 0.7, d: 0.05, dest: dest || A.pump });
    const tri = (t, m, v, len) => tone(t, K.mtof(m), v, { type: "triangle", a: 0.003, hold: Math.max(0.02, len * A.STEP * 0.8), d: 0.03, dest: A.pump });
    const ckick = (t, v) => { tone(t, 150, v, { type: "triangle", a: 0.002, d: 0.12, glide: 40, glideT: 0.1, dest: A.drums }); noise(t, "lowpass", 600, v * 0.4, 0.05); };
    const csnare = (t, v) => noise(t, "highpass", 1400, v, 0.11);
    const chat = (t, v) => noise(t, "highpass", 7500, v, 0.02);
    const ccrash = (t, v) => noise(t, "highpass", 3000, v, 0.9);
    // ---------- The tunes (A minor: Am, F, C, G) ----------
    const MAIN = K.line("A4 . C5 E5 . A5 . E5 G5 . E5 . D5 . C5 .  C5 . F5 A5 . C6 . A5 G5 . F5 . A5 . C6 .  E5 . G5 C6 . E6 . C6 D6 . C6 . G5 . E5 .  D5 . G5 B5 . D6 . B5 C6 . B5 . A5 . G5 .");
    const CALM = K.line("A4 - - - C5 - - - E5 - - - D5 - C5 -  C5 - - - F5 - - - A5 - - - G5 - F5 -  E5 - - - G5 - - - C6 - - - B5 - G5 -  D5 - - - G5 - - - B5 - - - A5 - G5 -");
    const musicDef = {
      bpm: { beginner: 116, average: 128, intermediate: 140, advanced: 152 },
      vol: { beginner: 0.5, average: 0.65, intermediate: 0.85, advanced: 1 },
      prog: ["Am", "F", "C", "G"],
      step(t, st, bar, ch, L, info) {
        const lv = LV[L], i = (info.barN % 4) * 16 + st, r = ch.r;
        if (info.outro) { if (st % 4 === 0) sq(t, r + 24 + [0, ch.iv[1], ch.iv[2], 12][(st / 4) % 4], 0.035, 2, 0.125); if (st === 0) tri(t, r, 0.12, 8); return; }
        // lead (Beginner: the calm tune); Intermediate and up: an echo voice three steps behind
        const n = (lv === 0 ? CALM : MAIN)[i];
        if (n) sq(t, n.m, 0.05 + lv * 0.004, n.len, 0.25);
        if (lv >= 2) { const e = MAIN[(i + 64 - 3) % 64]; if (e) sq(t, e.m - 12, 0.022, e.len, 0.125); }
        // arpeggios: 8ths for Beginner, 16ths after
        if (lv === 0 ? st % 2 === 0 : true) { const k = [0, 1, 2, 3, 2, 1][st % 6], m = r + 24 + [0, ch.iv[1], ch.iv[2], 12][k]; sq(t, m, 0.016 + lv * 0.003, 1, 0.125); }
        // triangle bass
        if (lv === 0) { if (st === 0 || st === 8) tri(t, r, 0.14, 7); }
        else if (lv === 1) { if (st % 2 === 0) tri(t, r + (st % 4 === 2 ? 12 : 0), 0.13, 1.5); }
        else if (lv === 2) { if (st % 2 === 0) tri(t, r + (st === 6 || st === 14 ? 7 : 0), 0.14, 1.5); }
        else if (st % 4 !== 1) tri(t, r + (st % 8 === 6 ? 12 : 0), 0.15, 1);
        // noise drums
        if (lv >= 1) {
          const KK = [[], [0, 8], [0, 6, 8], [0, 4, 8, 12, 14]][lv];
          if (KK.includes(st)) ckick(t, 0.32 + lv * 0.04);
          if (st === 4 || st === 12) csnare(t, 0.07 + lv * 0.012);
          if (lv === 1 ? st % 2 === 0 : true) chat(t, lv === 1 ? 0.02 : 0.018);
          if (lv >= 2 && bar === 7 && st >= 12) csnare(t, 0.06 + (st - 12) * 0.012);   // a fill into the next phrase
          if (lv === 3 && bar === 0 && st === 0 && info.barN > 0) ccrash(t, 0.05);
        } else if (st === 8) chat(t, 0.012);
      },
      // While the card waits: a low blip on every beat (faster with every tap); in the thrill, a nervous trill
      waitDiv: (taps) => [1, 2, 2, 4][Math.min(taps, 3)],
      wait(t, taps, k, L, q) {
        if (q) { tone(t, K.mtof(k % 2 ? 46 : 45), 0.06, { wave: P(0.5), a: 0.002, d: A.BEAT / 4 * 0.8, dest: A.sfx }); return; }
        tone(t, K.mtof(k % 2 ? 52 : 45), 0.08 + taps * 0.02, { wave: P(0.5), a: 0.002, d: 0.07, dest: A.sfx });
      },
      reveal(L) {
        const t = A.ctx.currentTime + 0.02, lv = LV[L];
        const notes = [[72, 76, 79], [72, 76, 79, 84], [72, 76, 79, 84, 88, 91, 96], [67, 72, 76, 79, 76, 79, 84]][lv];
        notes.forEach((m, i) => sq(t + i * 0.07, m, 0.06, i === notes.length - 1 ? 6 : 1, 0.25, A.sfx));
        if (lv === 3) { sq(t + 0.56, 84, 0.05, 8, 0.5, A.sfx); sq(t + 0.56, 79, 0.03, 8, 0.25, A.sfx); sq(t + 0.56, 76, 0.03, 8, 0.125, A.sfx); }
        if (lv >= 2) ccrash(t, 0.08);
      },
      legend() {   // the message is typed in a dialog box: one blip per letter
        const t = A.ctx.currentTime + 0.05, msg = "You found a better person.";
        for (let i = 0, k = 0; i < msg.length; i++) { if (msg[i] !== " ") tone(t + i * 0.042, 880 + (k++ % 3) * 110, 0.025, { wave: P(0.5), a: 0.001, d: 0.025, dest: A.sfx }); }
      },
      tap(i) { const t = A.ctx.currentTime; sq(t, 83 + i * 2, 0.05, 0.5, 0.5, A.sfx); sq(t + 0.07, 88 + i * 2, 0.05, 2, 0.5, A.sfx); },   // a coin
      part() { ccrash(A.nextStep, 0.05); }
    };
    // ---------- Sound effects: chip blips instead of film whooshes ----------
    const S = () => A.sfx, on = () => !!A.ctx;
    const SF = {
      whoosh(dur = 0.8, up = true) { if (!on()) return; const t = A.ctx.currentTime; tone(t, up ? 220 : 880, 0.045, { wave: P(0.5), a: 0.005, d: Math.min(dur, 0.5), glide: up ? 880 : 220, glideT: Math.min(dur, 0.5), dest: S() }); },
      impact(v = 1) { if (!on()) return; const t = A.ctx.currentTime; noise(t, "lowpass", 1200, 0.3 * v, 0.35, S()); tone(t, 110, 0.25 * v, { type: "triangle", a: 0.002, d: 0.3, glide: 35, glideT: 0.25, dest: S() }); },
      ping(f = 1318.5, v = 0.12) { if (!on()) return; tone(A.ctx.currentTime, f, Math.min(0.06, v * 0.6), { wave: P(0.25), a: 0.002, d: 0.18, dest: S() }); },
      tick(v = 0.1) { if (!on()) return; noise(A.ctx.currentTime, "highpass", 6000, v * 0.6, 0.015, S()); },
      pop() { if (!on()) return; tone(A.ctx.currentTime, 600, 0.05, { wave: P(0.5), a: 0.002, d: 0.06, glide: 1200, glideT: 0.05, dest: S() }); },
      riser(dur = 1.6) { if (!on()) return; const t = A.ctx.currentTime, n = Math.max(8, Math.round(dur * 10)); for (let k = 0; k < n; k++) tone(t + k * dur / n, K.mtof(57 + k * 2), 0.02 + 0.02 * k / n, { wave: P(0.125), a: 0.002, d: dur / n * 0.8, dest: S() }); },
      thump(v = 0.6) { if (!on()) return; ckickS(A.ctx.currentTime, 0.4 * v); },
      shimmer(dur = 2.2) { if (!on()) return; const t = A.ctx.currentTime; for (let k = 0; k < 10; k++) tone(t + Math.random() * dur * 0.7, K.mtof(84 + Math.floor(Math.random() * 12)), 0.02, { wave: P(0.125), a: 0.002, d: 0.06, dest: S() }); },
      counter(dur = 1.6, n = 12) { if (!on()) return; const t = A.ctx.currentTime; for (let k = 0; k < n; k++) { const p = 1 - Math.pow(1 - k / n, 2); tone(t + p * dur, 1760, 0.02, { wave: P(0.5), a: 0.001, d: 0.02, dest: S() }); } },
      tap(i) { if (!on()) return; tone(A.ctx.currentTime, 400 + i * 150, 0.05, { wave: P(0.5), a: 0.002, d: 0.09, glide: 800 + i * 200, glideT: 0.08, dest: S() }); },
      whip() { if (!on()) return; noise(A.ctx.currentTime, "bandpass", 3000, 0.15, 0.08, S(), 1); },
      crack(v = 1) { if (!on()) return; const t = A.ctx.currentTime; noise(t, "highpass", 2000, 0.3 * v, 0.12, S()); tone(t, 90, 0.05 * v, { wave: P(0.5), a: 0.001, d: 0.1, glide: 45, glideT: 0.1, dest: S() }); },
      sweep(dur = 2) { if (!on()) return; tone(A.ctx.currentTime, 200, 0.035, { wave: P(0.25), a: 0.01, hold: dur * 0.9, d: 0.05, glide: 800, glideT: dur, vib: 12, vibRate: 9, dest: S() }); },
      roll(dur, v) { if (!on()) return; const t0 = A.ctx.currentTime; for (let t = t0; t < t0 + dur;) { const p = (t - t0) / dur; noise(t, "highpass", 1400, (0.03 + 0.08 * p) * (v / 0.07), 0.05, S()); t += 1 / (4 + 18 * p * p); } }
    };
    function ckickS(t, v) { tone(t, 150, v, { type: "triangle", a: 0.002, d: 0.12, glide: 40, glideT: 0.1, dest: A.sfx }); }

    // ---------- Pixel pictures: photos are redrawn small, with fewer colors and a dither, then shown big ----------
    // On the site the pictures come from storage, another address: they are asked for with permission
    // (crossOrigin), so the page may read them back. A picture that can't be redrawn stays as it is, under the
    // scan lines. Document pages are never redrawn, so their words stay readable (the user asked, 2026-11-20).
    const cache = new Map();
    function pix(src, w) {
      const key = src + "|" + w; if (cache.has(key)) return cache.get(key);
      const pr = new Promise((res) => {
        const im = new Image();
        if (!src.startsWith("data:")) im.crossOrigin = "anonymous";
        im.onload = () => {
          try {
            const nw = im.naturalWidth || w, nh = im.naturalHeight || w, h = Math.max(1, Math.round(w * nh / nw));
            const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
            x.drawImage(im, 0, 0, w, h);
            const d = x.getImageData(0, 0, w, h), a = d.data, B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
            for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
              const i = (y * w + xx) * 4, th = (B[(y & 3) * 4 + (xx & 3)] / 16 - 0.5) * 36;
              for (let k = 0; k < 3; k++) a[i + k] = Math.max(0, Math.min(255, Math.round((a[i + k] + th) / 51) * 51));
            }
            x.putImageData(d, 0, 0); res(c.toDataURL());
          } catch { res(src); }   // (a picture the page may not read back stays as it is)
        };
        im.onerror = () => res(src); im.src = src;
      });
      cache.set(key, pr); return pr;
    }
    const urlOf = (bg) => { const m = /url\("?([^")]+)"?\)/.exec(bg || ""); return m ? m[1] : ""; };
    function pixelate() {
      const f = api.film;
      f.querySelectorAll(".scene img").forEach((img) => {
        if (!img.src || img.closest(".vw-media, .tile.doc, .sc-p.doc, .scard.doc")) return;
        const w = img.closest(".p-ava, .pcf-ava, .ec-ava, .intro-ava") ? 26 : img.closest(".pc-back") ? 40 : img.closest(".scard") ? 88 : 72;
        const src = img.getAttribute("src"); img.dataset.orig = img.dataset.orig || src;
        pix(img.dataset.orig, w).then((u) => { if (api.film.classList.contains("st-retro")) img.src = u; });
      });
      f.querySelectorAll("#pCover, .pcf-art, #ecBanner, .rbg, .rm-wall span").forEach((e) => {
        const src = urlOf(e.style.backgroundImage); if (!src || src.startsWith("data:")) return;
        pix(src, e.classList.contains("pcf-art") ? 80 : e.matches(".rm-wall span") ? 48 : 120).then((u) => { if (api.film.classList.contains("st-retro")) e.style.backgroundImage = 'url("' + u + '")'; });
      });
    }
    // The video reel is drawn through a small canvas, so the videos play as pixels too
    function reelCanvases() { api.reelClips.forEach((c) => { const cv = document.createElement("canvas"); cv.className = "rt-pxv st-added"; c.el.appendChild(cv); c.cv = cv; }); }
    function drawReel() {
      const c = api.reelClips[api.reelCur]; if (!c || !c.cv || c.v.readyState < 2) return;
      const cw = 132, ch = Math.max(40, Math.round(cw * api.H / api.W)), cv = c.cv; if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; }
      const x = cv.getContext("2d"), vw = c.v.videoWidth || 16, vh = c.v.videoHeight || 9, contain = c.el.classList.contains("contain");
      const s = contain ? Math.min(cw / vw, ch / vh) : Math.max(cw / vw, ch / vh), dw = vw * s, dh = vh * s;
      x.fillStyle = "#0b0820"; x.fillRect(0, 0, cw, ch);
      try { x.drawImage(c.v, (cw - dw) / 2, (ch - dh) / 2, dw, dh); } catch { /* not ready yet */ }
    }

    // ---------- The pixel sky (on the background canvas, which is 1/8 of the screen size: each dot is 8 pixels) ----------
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.7, p: Math.random() * 6.3, s: Math.random() < 0.15 ? 2 : 1 }));
    function sky(time, dt, part) {
      const x = api.bg, c = api.bgCanvas, w = c.width, h = c.height, th = api.hex(api.THEME);
      const deep = th.map((v) => Math.round(v * 0.16)), mid = th.map((v) => Math.round(v * 0.38));
      const bands = 7; for (let b = 0; b < bands; b++) { const k = b / (bands - 1); x.fillStyle = K.rgb([0, 1, 2].map((j) => Math.round(lerp(6 + j * 4, mid[j], k * k)))); x.fillRect(0, Math.floor(b * h * 0.72 / bands), w, Math.ceil(h * 0.72 / bands) + 1); }
      for (const s of stars) { const on = Math.sin(time * 2 + s.p) > -0.3; if (!on) continue; x.fillStyle = s.s > 1 ? "#ffe66d" : "#ffffff"; x.fillRect(Math.floor(s.x * w), Math.floor(s.y * h), s.s, s.s); }
      // mountains, then a ground with a moving grid
      x.fillStyle = K.rgb(deep.map((v) => v + 10));
      for (let i = 0; i < w; i++) { const mh = Math.floor(h * (0.12 + 0.06 * Math.sin(i * 0.21) + 0.04 * Math.sin(i * 0.07 + 1.3))); x.fillRect(i, Math.floor(h * 0.72) - mh, 1, mh); }
      x.fillStyle = K.rgb(deep); x.fillRect(0, Math.floor(h * 0.72), w, h);
      x.fillStyle = K.rgb(th, 0.55); x.fillRect(0, Math.floor(h * 0.72), w, 1);
      const off = (time * 6) % 6; x.fillStyle = K.rgb(th, 0.28);
      for (let gx = -6; gx < w + 6; gx += 6) x.fillRect(Math.floor(gx + off), Math.floor(h * 0.72) + 1, 1, h);
      for (let gy = 0; gy < 6; gy++) x.fillRect(0, Math.floor(h * 0.72) + 2 + gy * gy, w, 1);
    }
    const lerp = (a, b, t) => a + (b - a) * t;
    const snap = (v) => Math.round(v / 4) * 4;
    return {
      fps: 0, sfx: SF, musicDef,
      xtKinds: ["pixels", "scan"],
      build() {
        K.deco("fg", "rt-crt");
        pixelate(); reelCanvases();
      },
      bg: sky,
      ember(x, p, k) {
        const a = k < 0.1 ? 1 : 1 - Math.max(0, (k - 0.6) / 0.4); if (a <= 0) return;
        x.globalAlpha = 1;
        if (p.in) {   // dotted pixel trails into the card
          const g = api.pullGeom(), e = k * k; x.fillStyle = K.rgb(p.c);
          for (let j = 0; j < 4; j++) { const q = Math.max(0, e - j * 0.06); x.fillRect(snap(lerp(p.x0, g.cx, q)), snap(lerp(p.y0, g.cy, q)), 4, 4); }
          return;
        }
        const s = p.shard ? Math.max(8, snap(p.sz)) : (p.sz > 2 ? 8 : 4);
        if (p.shard) { x.fillStyle = "#1b1440"; x.fillRect(snap(p.x) - s / 2, snap(p.y) - s / 2, s, s); x.fillStyle = K.rgb(p.c); x.fillRect(snap(p.x) - s / 2, snap(p.y) - s / 2, s, 4); return; }
        x.fillStyle = K.rgb(p.c, a); x.fillRect(snap(p.x), snap(p.y), s, s);
      },
      confetti(x, p) {
        const a = Math.max(0, Math.min(1, 1.2 - p.life / 4)), s = p.w > 8 ? 8 : 4, c = /^#/.test(p.c) ? api.hex(p.c) : [255, 255, 255];
        x.fillStyle = K.rgb(c, a); x.fillRect(snap(p.x), snap(p.y), s, s);
      },
      ring(x, cx, cy, r, c, alpha) { const s = snap(r * 1.6); x.save(); x.globalAlpha = Math.min(1, alpha); x.strokeStyle = K.rgb(c); x.lineWidth = 4; x.strokeRect(snap(cx - s / 2), snap(cy - s * 0.7), s, snap(s * 1.4)); x.restore(); },
      lines(x, q, rnd, cx, cy, R, s) {
        x.save(); x.fillStyle = "#ffffff";
        for (let i = 0; i < 30; i++) { const a = rnd() * Math.PI * 2, r0 = R * (0.25 + rnd() * 0.3) + q * R * 0.5; x.globalAlpha = (1 - q) * 0.7 * s; for (let j = 0; j < 4; j++) x.fillRect(snap(cx + Math.cos(a) * (r0 + j * 14)), snap(cy + Math.sin(a) * (r0 + j * 14)), 4, 4); }
        x.restore();
      },
      hit(kind, x, y, k) {
        const tier = api.TIER;
        if (kind === "crack") K.pop("rt-pop", "<b>CRACK!</b>", x, y, 900);
        if (kind === "land") K.pop("rt-banner", "<b>" + (tier.gold ? "LEVEL UP!" : tier.hype ? "EPIC LOOT!" : tier.key === "average" ? "RARE ITEM!" : "NEW PLAYER!") + "</b>", api.W / 2, api.H * 0.2, 1900);
        if (kind === "score") K.pop("rt-pop", "<b>HI-SCORE!</b>", x, y, 1500);
        if (kind === "stat") K.pop("rt-pop", "<b>+" + (100 * (k + 1)) + "</b>", x + api.W * 0.16, y - 40, 900);
      },
      frame(cur) { if (cur.id === "videos") drawReel(); },
      // ---------- Changes between parts: a pixel dissolve, or rows that close like an old TV ----------
      xtStart(T) {
        const ov = api.$("xt"), box = api.el("div", "rt-cells st-added"), cols = T.kind === "pixels" ? 16 : 1, rows = T.kind === "pixels" ? 9 : 12;
        box.style.gridTemplateColumns = "repeat(" + cols + ", 1fr)"; box.style.gridTemplateRows = "repeat(" + rows + ", 1fr)";
        T.cells = [];
        for (let i = 0; i < cols * rows; i++) { const c = api.el("i"); box.appendChild(c); T.cells.push({ el: c, r: T.kind === "pixels" ? Math.random() : i / (cols * rows), row: Math.floor(i / cols) }); }
        ov.insertBefore(box, ov.firstChild); T.box = box;
      },
      xtApply(T, x) {
        const SW = 3.8, cover = api.clamp(x / 0.9), open = api.clamp((x - SW) / 0.8);
        // covering: cells appear (random order, or rows top to bottom); opening: they go (random, or rows bottom to top)
        T.cells.forEach((c) => { const on = T.swapped ? (T.kind === "scan" ? c.r < 1 - open : c.r >= open) : c.r < cover; c.el.style.visibility = on ? "visible" : "hidden"; });
        return { bo: cover >= 1 && (!T.swapped || open < 0.15) ? 1 : 0, bs: 1 };
      },
      xtEnd(T) { if (T.box) T.box.remove(); }
    };
  }
};
