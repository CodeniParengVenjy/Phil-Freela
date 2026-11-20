/* Papercut: everything is cut paper and card, moving in stop motion (the picture changes 12 times a second, with a
   tiny "boil" like a handmade film). Music: handmade folk (ukulele, glockenspiel, hand claps, a whistled tune).
   By level: Beginner a soft ukulele and a plain kraft card; Average adds claps and a bass; Intermediate adds stomps,
   a tambourine and a whistle, and the card tears open; Advanced is the full folk band, and the card opens like a
   pop-up book with gold paper rays. */
// Moved from the approved preview (previews/highlights-styles/st-paper.js) into the site's player
// (PLAN-highlight-styles.md, Step 2). The player loads this file only when a highlight in this style opens.
import "./paper.css";

export default {
  meta: {
    id: "paper", name: "Papercut", premium: true, look: "Cut-paper layers that move in stop motion",
    music: "Handmade folk: ukulele, glockenspiel, claps",
    levels: {
      beginner: "a plain kraft card that flips over, soft ukulele and glockenspiel, calm paper hills",
      average: "a blue paper card, claps and a plucked bass join in, paper confetti",
      intermediate: "a purple card that tears open after a few tense seconds, stomps, a tambourine and a whistled tune",
      advanced: "a gold card that opens like a pop-up book with paper rays, then the full folk band and \"You found a better person.\" on a paper ribbon"
    },
    art: '<i class="a1"></i><i class="a2"></i><i class="a3"></i><i class="a4"></i>'
  },
  make(api, K) {
    const A = K.A, tone = K.tone, noise = K.noise;
    const sfx = () => A.sfx;
    // ---------- Instruments ----------
    function uke(t, ch, v, up) {   // a ukulele strum: four strings, 14 ms apart (down = low to high)
      const notes = ch.iv.slice(0, 3).map((x) => ch.r + 12 + x).concat([ch.r + 24]);
      if (up) notes.reverse();
      notes.forEach((m, i) => tone(t + i * 0.014, K.mtof(m), v * (up ? 0.7 : 1), { type: "triangle", a: 0.003, d: 0.42, lp: 2600, lpEnd: 700, lpT: 0.3, rev: 0.25 }));
    }
    function glock(t, m, v, dest) {   // a glockenspiel bar: a pure tone with two bright overtones
      const f = K.mtof(m);
      tone(t, f, v, { a: 0.002, d: 1.1, dest: dest || A.pump, rev: 0.45 });
      tone(t, f * 2.76, v * 0.22, { a: 0.002, d: 0.32, dest: dest || A.pump });
      tone(t, f * 5.4, v * 0.07, { a: 0.001, d: 0.12, dest: dest || A.pump });
    }
    const pizz = (t, m, v) => tone(t, K.mtof(m), v, { type: "triangle", a: 0.004, d: 0.24, lp: 900, lpEnd: 300 });
    const snap = (t, v) => noise(t, "bandpass", 2600, v, 0.03, A.drums, 3);
    const shaker = (t, v) => noise(t, "highpass", 7200, v, 0.045);
    function stomp(t, v) { tone(t, 120, v, { a: 0.004, d: 0.26, glide: 48, glideT: 0.12, dest: A.drums }); noise(t, "lowpass", 380, v * 0.5, 0.08); }
    function tamb(t, v) { [0, 0.012, 0.026].forEach((d, i) => noise(t + d, "highpass", 8500, v * (i ? 0.5 : 1), 0.05)); }
    function whistle(t, m, len, v) { tone(t, K.mtof(m), v, { a: 0.05, hold: Math.max(0.05, len * A.STEP - 0.12), d: 0.12, vib: K.mtof(m) * 0.012, vibRate: 5.4, vibDelay: 0.15, rev: 0.4 }); noise(t, "bandpass", K.mtof(m) * 2, v * 0.12, len * A.STEP, A.pump, 6); }
    function toyPiano(t, m, v) { const f = K.mtof(m); tone(t, f, v * 0.5, { type: "square", a: 0.002, d: 0.5, lp: 3200, lpEnd: 900 }); tone(t, f * 4.07, v * 0.12, { a: 0.001, d: 0.2 }); }
    // ---------- The tune (C major: C, G, Am, F) ----------
    const MEL = K.line("E5 . G5 . C6 . G5 . A5 . G5 . E5 . . .  D5 . G5 . B5 . G5 . A5 . B5 . D6 . . .  C6 . B5 . A5 . E5 . C5 . E5 . A5 . . .  A5 . G5 . F5 . C5 . F5 . A5 . G5 . E5 .");
    const WHI = K.line("G5 - - - E5 - C5 - D5 - E5 - G5 - - -  B5 - - - G5 - D5 - E5 - D5 - B4 - - -  C6 - - - B5 - A5 - E5 - A5 - C6 - - -  A5 - - - G5 - F5 - E5 - D5 - C5 - - -");
    const TOY = K.line("C6 . . . . . E6 . . . G5 . . . . .  B5 . . . . . D6 . . . G5 . . . . .  C6 . . . . . E6 . . . A5 . . . . .  A5 . . . . . C6 . . . F5 . . . . .");
    const musicDef = {
      bpm: { beginner: 92, average: 100, intermediate: 108, advanced: 116 },
      vol: { beginner: 2.4, average: 1.9, intermediate: 1.6, advanced: 1.4 },
      prog: ["C", "G", "Am", "F"],
      step(t, st, bar, ch, L, info) {
        const lv = { beginner: 0, average: 1, intermediate: 2, advanced: 3 }[L], i = (info.barN % 4) * 16 + st, mel = MEL[i];
        if (info.outro) { if (st === 0 || st === 8) uke(t, ch, 0.05, false); if (mel && st % 4 === 0) glock(t, mel.m, 0.05); return; }
        // the ukulele: more strums with every level
        const DOWN = [[0, 8], [0, 4, 12], [0, 4, 8, 12], [0, 2, 4, 8, 10, 12]][lv], UP = [[14], [6, 10, 14], [6, 10, 14], [6, 14]][lv];
        if (DOWN.includes(st)) uke(t, ch, 0.06 + lv * 0.006, false);
        if (UP.includes(st)) uke(t, ch, 0.045 + lv * 0.005, true);
        // the plucked bass: root and fifth
        const BASS = [[0, 8], [0, 6, 8], [0, 6, 8, 14], [0, 4, 8, 12]][lv];
        if (BASS.includes(st)) pizz(t, ch.r - 12 + (st === 8 || st === 12 ? 7 : 0), 0.13);
        // the glockenspiel tune (Beginner: on the beats only); Intermediate and up: a whistled tune in the second half of the phrase
        const whistleBar = lv >= 2 && bar >= 4;
        if (mel && !whistleBar && (lv > 0 || st % 4 === 0)) glock(t, mel.m, 0.045 + lv * 0.004);
        if (whistleBar) { const w = WHI[i]; if (w) whistle(t, w.m, w.len, 0.035 + (lv - 2) * 0.008); }
        if (lv === 3) { const y = TOY[i]; if (y && bar < 4) toyPiano(t, y.m, 0.06); if (st === 0 && bar === 0) glock(t, ch.r + 36, 0.05); }
        // the rhythm section
        if (lv >= 1 && (st === 4 || st === 12)) api.clap(t, 0.08 + lv * 0.02);
        if (lv === 3 && st === 14) api.clap(t, 0.06);
        if (lv === 0 && st % 4 === 2) shaker(t, 0.012);
        if (lv >= 1 && st % 2 === 1) shaker(t, 0.012 + lv * 0.003);
        if (lv === 1 && (st === 6 || st === 14)) snap(t, 0.07);
        if (lv >= 2) { const S = lv === 3 ? [0, 4, 8, 12] : [0, 8, 10]; if (S.includes(st)) stomp(t, 0.32 + lv * 0.05); }
        if (lv >= 2 && st % 4 === 2) tamb(t, 0.04 + (lv - 2) * 0.015);
        if (lv === 3 && bar === 7 && st >= 12) { stomp(t, 0.28); api.clap(t, 0.06); }   // a stomp-clap fill into the next phrase
      },
      // While the card waits: a music box and a ticking clock that speeds up with every tap
      waitDiv: (taps) => [1, 2, 2, 4][Math.min(taps, 3)],
      wait(t, taps, k, L, q) {
        noise(t, "bandpass", k % 2 ? 1800 : 2400, 0.09 + taps * 0.02, 0.02, A.sfx, 5);   // tick, tock
        const box = [72, 76, 79, 84, 79, 76], every = Math.max(1, [1, 2, 2, 4][Math.min(taps, 3)]);
        if (k % every === 0) glock(t, box[(k / every) % box.length] + (q ? 2 : 0), 0.05 + taps * 0.008, A.sfx);
      },
      reveal(L) {
        const t = A.ctx.currentTime + 0.01, lv = { beginner: 0, average: 1, intermediate: 2, advanced: 3 }[L];
        uke(t, K.chord("C"), 0.09, false);
        const run = [[84, 88], [72, 76, 79, 84], [72, 76, 79, 84, 88], [72, 76, 79, 84, 88, 91, 96]][lv];
        run.forEach((m, i) => glock(t + 0.05 + i * 0.07, m, 0.06, A.sfx));
        if (lv >= 2) { stomp(t, 0.5); tamb(t, 0.08); api.clap(t + 0.02, 0.12); }
        if (lv === 3) { [60, 64, 67, 72].forEach((m) => toyPiano(t, m + 12, 0.09)); whistle(t + 0.4, 91, 6, 0.04); }
      },
      legend() { const t = A.ctx.currentTime; [84, 88, 91, 96].forEach((m, i) => glock(t + 0.12 + i * 0.11, m, 0.05, A.sfx)); uke(t, K.chord("F"), 0.07, false); uke(t + 0.5, K.chord("C"), 0.07, false); },
      tap(i) { glock(A.ctx.currentTime, [76, 79, 84][i] || 84, 0.05, A.sfx); },
      part() { const t = A.nextStep; stomp(t, 0.42); tamb(t, 0.06); }
    };
    // ---------- Sound effects: paper, card and wood instead of film whooshes ----------
    const SF = {
      whoosh(dur = 0.8) { if (!A.ctx) return; const t = A.ctx.currentTime, n = Math.max(4, Math.round(dur * 14)); for (let k = 0; k < n; k++) noise(t + k * dur / n, "bandpass", 1600 + Math.random() * 2600, 0.05 * Math.sin(Math.PI * (k + 0.5) / n), 0.05, sfx(), 1.4); },
      impact(v = 1) { if (!A.ctx) return; const t = A.ctx.currentTime; tone(t, 95, 0.5 * v, { a: 0.004, d: 0.32, glide: 45, glideT: 0.2, dest: sfx() }); noise(t, "lowpass", 900, 0.22 * v, 0.1, sfx()); },
      ping(f = 1318.5, v = 0.12) { if (!A.ctx) return; glock(A.ctx.currentTime, Math.round(69 + 12 * Math.log2(f / 440)), Math.min(0.08, v * 0.7), sfx()); },
      tick(v = 0.1) { if (!A.ctx) return; const t = A.ctx.currentTime; noise(t, "bandpass", 3000, v * 0.8, 0.015, sfx(), 4); },
      pop() { if (!A.ctx) return; const t = A.ctx.currentTime; tone(t, 320, 0.12, { a: 0.003, d: 0.08, glide: 900, glideT: 0.05, dest: sfx() }); },
      riser(dur = 1.6) { if (!A.ctx) return; const t = A.ctx.currentTime; tone(t, 620, 0.035, { a: 0.1, hold: dur * 0.8, d: 0.2, glide: 1500, glideT: dur, vib: 12, vibRate: 6, dest: sfx() }); },
      thump(v = 0.6) { if (!A.ctx) return; stomp(A.ctx.currentTime, 0.5 * v); },
      shimmer(dur = 2.2) { if (!A.ctx) return; const t = A.ctx.currentTime, pent = [84, 86, 88, 91, 93, 96]; for (let k = 0; k < 9; k++) glock(t + 0.04 + Math.random() * dur * 0.7, pent[k % 6], 0.025, sfx()); },
      counter(dur = 1.6, n = 12) { if (!A.ctx) return; const t = A.ctx.currentTime; for (let k = 0; k < n; k++) { const p = 1 - Math.pow(1 - k / n, 2); noise(t + p * dur, "bandpass", 2200, 0.07, 0.02, sfx(), 5); } },
      tap(i) { if (!A.ctx) return; const t = A.ctx.currentTime; noise(t, "highpass", 2600, 0.22, 0.03, sfx()); tone(t, 700 + i * 220, 0.07, { type: "triangle", a: 0.002, d: 0.07, dest: sfx() }); },
      whip() { if (!A.ctx) return; const t = A.ctx.currentTime; for (let k = 0; k < 4; k++) noise(t + k * 0.02, "bandpass", 4200 - k * 700, 0.08, 0.03, sfx(), 2); },
      crack(v = 1) { if (!A.ctx) return; const t = A.ctx.currentTime; for (let k = 0; k < 10; k++) noise(t + k * 0.022 + Math.random() * 0.01, "bandpass", 1800 + Math.random() * 2600, (0.1 + Math.random() * 0.12) * v, 0.025, sfx(), 2.5); },
      sweep(dur = 2) { if (!A.ctx) return; const t = A.ctx.currentTime; tone(t, 480, 0.05, { a: 0.08, hold: dur * 0.85, d: 0.15, glide: 1440, glideT: dur, vib: 9, vibRate: 5, dest: sfx() }); },
      roll(dur, v) { if (!A.ctx) return; const t0 = A.ctx.currentTime; for (let t = t0; t < t0 + dur;) { const p = (t - t0) / dur; snap(t, (0.06 + 0.1 * p) * (v / 0.07)); t += 1 / (3 + 14 * p * p); } }
    };
    // ---------- Pictures and effects ----------
    const CREAM = [255, 248, 234], INK = "rgba(43,33,24,";
    function piece(x, p, s, k, col) {   // a little piece of paper with a shadow under it
      x.save(); x.translate(Math.round(p.x), Math.round(p.y)); x.rotate(Math.round((p.shard ? p.rot : p.spin) * 4) / 4);
      const w = s, h = s * (p.kind === 1 ? 1 : 0.62);
      x.fillStyle = INK + (0.16 * k).toFixed(3) + ")"; x.fillRect(-w / 2 + 2.5, -h / 2 + 2.5, w, h);
      x.fillStyle = K.rgb(col, k); x.fillRect(-w / 2, -h / 2, w, h);
      x.restore();
    }
    return {
      fps: 12, sfx: SF, musicDef,
      xtKinds: ["sheet", "popup"],
      build() {
        // A paper stage: a sun, two clouds and three hills, each cut from paper in shades of their color
        K.deco("bg", "pp-stage", '<i class="pp-sun"></i><i class="pp-cloud c1"></i><i class="pp-cloud c2"></i>' +
          '<svg class="pp-hills" viewBox="0 0 1200 400" preserveAspectRatio="none" aria-hidden="true">' +
          '<path class="h3" d="M0 210 C 140 130 260 150 380 190 S 640 120 780 170 S 1060 110 1200 160 V400 H0 Z"/>' +
          '<path class="h2" d="M0 270 C 160 210 300 230 430 262 S 700 200 860 248 S 1080 216 1200 236 V400 H0 Z"/>' +
          '<path class="h1" d="M0 330 C 180 290 330 300 480 322 S 760 286 920 312 S 1110 296 1200 304 V400 H0 Z"/></svg>');
        K.deco("fg", "pp-frame");
        api.$("pullStage").classList.remove("pp-popped");
      },
      bg() { /* the paper stage is made of page elements (no canvas) */ },
      ember(x, p, k) {
        if (p.in) return;   // no streaks of light: paper doesn't glow
        const a = k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.55) / 0.45);
        if (p.kind == null) p.kind = Math.random() < 0.4 ? 1 : 0;
        if (p.shard) { piece(x, p, p.sz * 1.4, a, CREAM); return; }
        piece(x, p, 4 + p.sz * 2.6, a, p.c);
      },
      confetti(x, p) { if (p.kind == null) p.kind = Math.random() < 0.4 ? 1 : 0; piece(x, { x: p.x, y: p.y, spin: p.r, kind: p.kind }, p.w + 3, Math.max(0, Math.min(1, 1.2 - p.life / 4)), hexRGB(p.c)); },
      ring(x, cx, cy, r, c, alpha, w) {   // a dashed "cut here" circle instead of a ring of light
        x.save(); x.setLineDash([12, 9]); x.lineDashOffset = -r * 0.3; x.strokeStyle = INK + (alpha * 0.55).toFixed(3) + ")"; x.lineWidth = Math.max(1.5, w * 0.35);
        x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke(); x.restore();
      },
      lines() { /* no speed lines in paper */ },
      hit(kind, x, y) {
        if (kind === "reveal" && api.TIER.gold) api.$("pullStage").classList.add("pp-popped");   // the pop-up book: gold paper rays unfold
        if (kind === "score") K.pop("pp-sticker", "<b>★</b>", x, y, 2600);
        if (kind === "stat") K.pop("pp-tag", "<b>✓</b>", x + api.W * 0.18, y - 30, 1400);
      },
      xtStart(T) { T.el = api.$("xt"); },
      xtApply(T, x, from, to, ov) {
        const SW = 3.8, cl = api.clamp;
        if (T.kind === "sheet") {   // a big sheet of paper slides down over the part, then up and away
          const inn = api.eOut(cl(x / 0.9)), out = api.eInOut(cl((x - SW) / 0.8));
          ov.style.transform = "translateY(" + (T.swapped ? -112 * out : -112 * (1 - inn)).toFixed(1) + "%)";
          return { bo: x < 0.55 ? 0 : 1, bs: 1 };
        }
        // popup: the card stands up like a pop-up book page, then folds down onto the new part
        const up = api.eBack(cl(x / 0.9)), down = api.eInOut(cl((x - SW) / 0.8));
        ov.style.transformOrigin = "50% 100%";
        ov.style.transform = "perspective(1200px) rotateX(" + (T.swapped ? 92 * down : 92 * (1 - up)).toFixed(1) + "deg)";
        return { bo: x < 0.4 ? 0 : 1, bs: 1 };
      },
      xtEnd() { const ov = api.$("xt"); ov.style.transformOrigin = ""; }
    };
    function hexRGB(h) { return h && h[0] === "#" ? api.hex(h) : [255, 255, 255]; }
  }
};
