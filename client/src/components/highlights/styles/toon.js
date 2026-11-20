/* Cartoony: a Saturday-morning cartoon. Thick black outlines, flat bright colors, a turning sunburst and puffy
   clouds, everything bounces (squash and stretch). Music: a cartoon band (tuba, banjo chords, xylophone, clarinet,
   woodblock, slide whistle), with a swing.
   By level: Beginner a gentle bounce and a plain card; Average adds the woodblock and clarinet and the card pops
   open with confetti; Intermediate is a chase tune (snare, brass, slide whistles) and the card shakes and cracks;
   Advanced is the big finale (timpani, cymbals, a brass fanfare) and the card bursts out of a puff of smoke. */
// Moved from the approved preview (previews/highlights-styles/st-toon.js) into the site's player
// (PLAN-highlight-styles.md, Step 2). The player loads this file only when a highlight in this style opens.
import "./toon.css";

export default {
  meta: {
    id: "toon", name: "Cartoony", premium: true, look: "A cartoon: thick outlines, bright colors, bouncy",
    music: "Cartoon band: tuba, xylophone, slide whistle",
    levels: {
      beginner: "a plain card that bounces open, a gentle tuba-and-xylophone tune under a turning sunburst",
      average: "a blue RARE card that pops open with confetti, a woodblock and a clarinet join the band",
      intermediate: "an EPIC card that shakes and cracks, then a chase tune with snare, brass and slide whistles",
      advanced: "the LEGENDARY card bursting out of a puff of smoke with stars, a brass fanfare and cymbals, then the big finale"
    },
    art: '<i class="a1"></i><i class="a2"></i>'
  },
  make(api, K) {
    const A = K.A, tone = K.tone, noise = K.noise;
    const LV = { beginner: 0, average: 1, intermediate: 2, advanced: 3 };
    // ---------- The band ----------
    const tuba = (t, m, v) => tone(t, K.mtof(m), v, { type: "sawtooth", a: 0.012, d: 0.24, lp: 520, lpEnd: 220, q: 1.5 });
    function pah(t, ch, v) { ch.tones.slice(1).concat([ch.r + 12]).forEach((m, i) => tone(t + i * 0.006, K.mtof(m + 12), v, { type: "square", a: 0.003, d: 0.12, lp: 1900, lpEnd: 700 })); }
    function xylo(t, m, v, dest) { const f = K.mtof(m); tone(t, f, v, { a: 0.002, d: 0.3, dest: dest || A.pump, rev: 0.2 }); tone(t, f * 4, v * 0.28, { a: 0.001, d: 0.08, dest: dest || A.pump }); tone(t, f * 2, v * 0.3, { type: "triangle", a: 0.002, d: 0.14, dest: dest || A.pump }); }
    const clar = (t, m, len, v) => tone(t, K.mtof(m), v, { type: "square", a: 0.035, hold: Math.max(0.05, len * A.STEP - 0.08), sus: 0.85, d: 0.08, lp: 1350, q: 0.9, vib: K.mtof(m) * 0.01, vibRate: 5.2, vibDelay: 0.2 });
    function wood(t, v, hi, dest) { noise(t, "bandpass", hi ? 1900 : 1250, v, 0.04, dest || A.drums, 9); tone(t, hi ? 1700 : 1100, v * 0.5, { a: 0.001, d: 0.05, dest: dest || A.drums }); }
    function timp(t, m, v) { tone(t, K.mtof(m) * 1.1, v, { a: 0.004, d: 0.55, glide: K.mtof(m), glideT: 0.08, dest: A.drums }); noise(t, "lowpass", 300, v * 0.35, 0.12); }
    function slideW(t, a, b, dur, v, dest) { tone(t, a, v, { a: 0.03, hold: dur * 0.8, d: 0.08, glide: b, glideT: dur, vib: 9, vibRate: 6, vibDelay: 0.05, dest: dest || A.pump }); }
    // ---------- The tune (C, A7, D7, G7: a little ragtime) ----------
    const MEL = K.line("E5 . G5 . C6 . G5 . E5 . C5 . D5 . E5 .  C#5 . E5 . A5 . G5 . E5 . C#5 . D5 . E5 .  F#5 . A5 . D6 . C6 . A5 . F#5 . G5 . A5 .  B5 . D6 . F5 . G5 . B4 . D5 . F5 . G5 .");
    const CLA = K.line("G4 - - - - - - - E4 - - - - - - -  G4 - - - - - - - E4 - - - - - - -  F#4 - - - - - - - A4 - - - - - - -  F4 - - - - - - - D4 - - - B3 - - -");
    const musicDef = {
      bpm: { beginner: 104, average: 116, intermediate: 132, advanced: 144 },
      vol: { beginner: 3, average: 2.2, intermediate: 1.8, advanced: 1.5 },
      prog: ["C", "A7", "D7", "G7"], swing: 0.24,
      step(t, st, bar, ch, L, info) {
        const lv = LV[L], i = (info.barN % 4) * 16 + st, r = ch.r, fifth = r + 7 > 55 ? r - 5 : r + 7;
        if (info.outro) { if (st === 0) tuba(t, r - 12, 0.12); if (st === 8) pah(t, ch, 0.025); const m = MEL[i]; if (m && st % 4 === 0) xylo(t, m.m, 0.04); return; }
        // oom-pah: the tuba on the beats, the banjo chords in between
        if (lv < 2) { if (st === 0) tuba(t, r - 12, 0.16); if (st === 8) tuba(t, fifth - 12, 0.14); }
        else if (st % 4 === 0) tuba(t, (st % 8 === 0 ? r : fifth) - 12, 0.17);
        const PAH = lv < 2 ? [4, 12] : [2, 6, 10, 14];
        if (PAH.includes(st)) pah(t, ch, 0.03 + lv * 0.004);
        const m = MEL[i];
        if (m) { xylo(t, m.m, 0.05 + lv * 0.004); if (lv === 3) xylo(t, m.m - 12, 0.03); }
        if (lv >= 1) { const c = CLA[i]; if (c) clar(t, c.m, c.len, 0.022 + (lv - 1) * 0.004); }
        if (lv === 1 && st % 4 === 2) wood(t, 0.12, st % 8 === 2);
        if (lv >= 2) {
          if (st === 4 || st === 12) api.snare(t, 0.06 + (lv - 2) * 0.02);
          if (st % 4 === 2) wood(t, 0.08, true);
          if (bar === 7 && st === 8) slideW(t, 500, 1300, A.STEP * 7, 0.035);
          if (st === 0 && bar % 4 === 0) api.brass(t, ch.tones.map((x) => K.mtof(x + 12)), 0.045);
        }
        if (lv === 3) {
          if (st === 0) timp(t, r - 12, 0.3);
          if (st === 6) api.brass(t, ch.tones.map((x) => K.mtof(x + 12)), 0.035);
          if (bar === 0 && st === 0 && info.barN > 0) api.crash(t, 0.08);
          if (bar === 7 && st >= 8) api.snare(t, 0.03 + (st - 8) * 0.01);
        }
      },
      // While the card waits: tick, tock on the woodblock (faster with every tap); in the thrill, a drum roll
      waitDiv: (taps, L) => [1, 2, 2, 4][Math.min(taps, 3)],
      wait(t, taps, k, L, q) {
        if (q) { for (let j = 0; j < 4; j++) api.snare(t + j * A.BEAT / 16, 0.02 + 0.05 * q.p, A.sfx); return; }
        wood(t, 0.2 + taps * 0.05, k % 2 === 0, A.sfx);
      },
      reveal(L) {
        const t = A.ctx.currentTime + 0.01, lv = LV[L], up = [72, 76, 79, 84, 88, 91, 96];
        (lv === 0 ? [72, 76, 79, 84] : up).forEach((m, i) => xylo(t + i * 0.045, m, 0.05, A.sfx));
        if (lv >= 1) api.crash(t, 0.06 + lv * 0.02);
        if (lv >= 2) { const C = [60, 64, 67, 72].map(K.mtof); api.brass(t + 0.02, C, 0.08); if (lv === 3) { api.brass(t + 0.32, C.map((f) => f * 1.5), 0.09); timp(t, 36, 0.4); timp(t + 0.16, 43, 0.35); } }
      },
      legend() { const t = A.ctx.currentTime + 0.1; [67, 72, 76].forEach((m, i) => clar(t + i * 0.22, m, 3, 0.04)); [84, 88, 91, 96].forEach((m, i) => xylo(t + 0.7 + i * 0.08, m, 0.04, A.sfx)); },
      tap(i) { xylo(A.ctx.currentTime + 0.05, [76, 79, 84][i] || 84, 0.05, A.sfx); },
      part() { api.crash(A.nextStep, 0.06); }
    };
    // ---------- Sound effects: slide whistles, boings and bonks ----------
    const S = () => A.sfx, on = () => !!A.ctx, now = () => A.ctx.currentTime;
    const SF = {
      whoosh(dur = 0.8, up = true) { if (!on()) return; slideW(now(), up ? 600 : 1500, up ? 1500 : 600, Math.min(0.45, dur * 0.6), 0.05, S()); },
      impact(v = 1) { if (!on()) return; const t = now(); wood(t, 0.25 * v, false, S()); tone(t, 110, 0.35 * v, { a: 0.004, d: 0.3, glide: 55, glideT: 0.2, dest: S() }); },
      ping(f = 1318.5, v = 0.12) { if (!on()) return; xylo(now(), Math.round(69 + 12 * Math.log2(f / 440)), Math.min(0.07, v * 0.6), S()); },
      tick(v = 0.1) { if (!on()) return; wood(now(), v, true, S()); },
      pop() { if (!on()) return; tone(now(), 380, 0.14, { a: 0.003, d: 0.1, glide: 1100, glideT: 0.06, dest: S() }); },
      riser(dur = 1.6) { if (!on()) return; slideW(now(), 400, 1400, dur, 0.04, S()); },
      thump(v = 0.6) { if (!on()) return; tuba(now(), 36, 0.3 * v); },
      shimmer(dur = 2.2) { if (!on()) return; const t = now(), sc = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96]; sc.forEach((m, i) => xylo(t + i * Math.min(0.06, dur / 20), m, 0.035, S())); },
      counter(dur = 1.6, n = 12) { if (!on()) return; const t = now(); for (let k = 0; k < n; k++) { const p = 1 - Math.pow(1 - k / n, 2); wood(t + p * dur, 0.08, k % 2 === 0, S()); } },
      tap(i) { if (!on()) return; tone(now(), 300 + i * 120, 0.12, { a: 0.003, d: 0.28, glide: 700 + i * 200, glideT: 0.12, vib: 40, vibRate: 22, vibDelay: 0.01, dest: S() }); },   // boing
      whip() { if (!on()) return; tone(now(), 500, 0.05, { a: 0.003, d: 0.12, glide: 2400, glideT: 0.1, dest: S() }); },
      crack(v = 1) { if (!on()) return; const t = now(); noise(t, "highpass", 2500, 0.25 * v, 0.08, S()); tone(t, 1600, 0.05 * v, { a: 0.002, d: 0.2, glide: 300, glideT: 0.18, dest: S() }); },
      sweep(dur = 2) { if (!on()) return; slideW(now(), 350, 1500, dur, 0.04, S()); },
      roll(dur, v) { if (!on()) return; const t0 = now(); for (let t = t0; t < t0 + dur;) { const p = (t - t0) / dur; api.snare(t, v * (0.3 + 0.7 * p), S()); t += 1 / (5 + 20 * p * p); } }
    };
    // ---------- Pictures ----------
    const INK = "#1b1b1b";
    function star(x, cx, cy, r, fill, a, rot) { K.starPath(x, cx, cy, r, r * 0.48, 5, rot); x.globalAlpha = a; x.fillStyle = fill; x.fill(); x.lineWidth = Math.max(1.5, r * 0.22); x.strokeStyle = INK; x.stroke(); x.globalAlpha = 1; }
    const sparks = Array.from({ length: 9 }, () => ({ x: Math.random(), y: 0.12 + Math.random() * 0.6, p: Math.random() * 6.3, s: 0.6 + Math.random() * 0.8 }));
    return {
      fps: 0, sfx: SF, musicDef,
      xtKinds: ["star", "bounce"],
      build() {
        K.deco("bg", "tn-burst");
        K.deco("bg", "tn-clouds", '<svg viewBox="0 0 200 80" class="tn-cloud c1" aria-hidden="true"><path d="M30 70 C 8 70 6 44 28 42 C 26 20 56 14 66 30 C 74 8 112 8 118 32 C 136 18 166 26 162 48 C 186 50 188 70 166 70 Z"/></svg>' +
          '<svg viewBox="0 0 200 80" class="tn-cloud c2" aria-hidden="true"><path d="M30 70 C 8 70 6 44 28 42 C 26 20 56 14 66 30 C 74 8 112 8 118 32 C 136 18 166 26 162 48 C 186 50 188 70 166 70 Z"/></svg>');
      },
      ambient(x, time) {   // a few twinkling sparkles
        const W = api.W, H = api.H;
        for (const s of sparks) { const k = (Math.sin(time * 2.2 + s.p) + 1) / 2; if (k < 0.3) continue; const r = 7 * s.s * k; K.starPath(x, s.x * W, s.y * H, r, r * 0.3, 4, time * 0.6 + s.p); x.fillStyle = "#ffffff"; x.fill(); x.lineWidth = 2; x.strokeStyle = INK; x.stroke(); }
      },
      ember(x, p, k) {
        const a = k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.6) / 0.4); if (a <= 0) return;
        if (p.in) { const g = api.pullGeom(), e = k * k; x.beginPath(); x.arc(p.x0 + (g.cx - p.x0) * e, p.y0 + (g.cy - p.y0) * e, 3, 0, 6.3); x.fillStyle = K.rgb(p.c, a); x.fill(); return; }
        if (p.shard) { x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.beginPath(); p.pts.forEach((ang, j) => { const rr = p.sz * (j === 1 ? 1 : 0.7); if (j) x.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); else x.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }); x.closePath(); x.globalAlpha = a; x.fillStyle = "#ffffff"; x.fill(); x.lineWidth = 2.5; x.strokeStyle = INK; x.stroke(); x.restore(); return; }
        star(x, p.x, p.y, 3 + p.sz * 2.4, K.rgb(p.c), a, p.spin);
      },
      confetti(x, p) {
        const a = Math.max(0, Math.min(1, 1.2 - p.life / 4)); if (a <= 0) return;
        if (p.k === 0) star(x, p.x, p.y, p.w * 0.9, p.c, a, p.r);
        else { x.save(); x.globalAlpha = a; x.translate(p.x, p.y); x.rotate(p.r); x.beginPath(); x.ellipse(0, 0, p.w * 0.6, p.h * 0.8 * Math.abs(Math.cos(p.r * 1.7)) + 1, 0, 0, 6.3); x.fillStyle = p.c; x.fill(); x.lineWidth = 2; x.strokeStyle = INK; x.stroke(); x.restore(); }
      },
      ring(x, cx, cy, r, c, alpha, w) { x.save(); x.globalAlpha = Math.min(1, alpha); x.lineWidth = w + 5; x.strokeStyle = INK; x.beginPath(); x.arc(cx, cy, r, 0, 6.3); x.stroke(); x.lineWidth = w; x.strokeStyle = K.rgb(c); x.stroke(); x.restore(); },
      lines(x, q, rnd, cx, cy, R, s) {
        x.save(); x.lineCap = "round";
        for (let i = 0; i < 24; i++) { const a = rnd() * Math.PI * 2, r0 = R * (0.3 + rnd() * 0.25) + q * R * 0.4, len = R * (0.1 + rnd() * 0.2) * (1 - q); const x1 = cx + Math.cos(a) * r0, y1 = cy + Math.sin(a) * r0, x2 = cx + Math.cos(a) * (r0 + len), y2 = cy + Math.sin(a) * (r0 + len); x.globalAlpha = (1 - q) * s; x.lineWidth = 8; x.strokeStyle = INK; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.stroke(); x.lineWidth = 4; x.strokeStyle = "#ffffff"; x.stroke(); }
        x.restore();
      },
      hit(kind, x, y) {
        const T = api.TIER;
        if (kind === "crack") K.pop("tn-word", "<b>CRACK!</b>", x, y, 900, { "--rot": (Math.random() * 30 - 15).toFixed(0) + "deg" });
        if (kind === "reveal") {
          if (T.hype) K.pop("tn-puff" + (T.gold ? " big" : ""), "<i></i><i></i><i></i><i></i><i></i><i></i>", x, y, 1300);
          K.pop("tn-word big", "<b>" + (T.gold ? "WOW!!" : T.hype ? "WOW!" : T.key === "average" ? "TA-DA!" : "HELLO!") + "</b>", api.W * (T.gold ? 0.76 : 0.72), api.H * 0.3, 1500, { "--rot": "-12deg" });
        }
        if (kind === "score") K.pop("tn-word", "<b>WOW!</b>", x, y, 1300, { "--rot": "12deg" });
        if (kind === "stat") K.pop("tn-word", "<b>YAY!</b>", x + api.W * 0.2, y - 30, 900, { "--rot": "-10deg" });
      },
      // ---------- Changes between parts: a star-shaped iris, or a title card that bounces in ----------
      xtApply(T, x, from, to, ov) {
        const SW = 3.8, cl = api.clamp, W = api.W, H = api.H;
        if (T.kind === "star") {
          const R = Math.hypot(W, H) * 0.95, r = !T.swapped ? R * (1 - api.eInOut(cl(x / 0.9))) : R * api.eInOut(cl((x - SW - 0.05) / 0.9));
          const cx = W / 2, cy = H / 2, rot = -Math.PI / 2 + x * 0.6; let d = "M0 0H" + W + "V" + H + "H0Z";
          if (r > 1) { d += "M"; for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5, rr = i % 2 ? r * 0.5 : r; d += (i ? "L" : "") + (cx + Math.cos(a) * rr).toFixed(1) + " " + (cy + Math.sin(a) * rr).toFixed(1); } d += "Z"; }
          ov.style.clipPath = 'path(evenodd, "' + d + '")';
          return { bo: cl((x - 0.95) / 0.25) * (1 - cl((x - SW) / 0.2)), bs: 1 };
        }
        // bounce: the title card drops in from the top and bounces; after the switch it hops up and away
        const drop = cl(x / 1.0), bounce = drop < 1 ? 1 - Math.abs(Math.cos(drop * Math.PI * 2.5)) * (1 - drop) : 1, e = drop >= 1 ? 1 : Math.min(1, api.eOut(drop) * 0.9 + bounce * 0.1);
        const out = cl((x - SW) / 0.7), hop = out < 0.25 ? -out * 0.2 : (out - 0.25) / 0.75;
        const y = T.swapped ? -112 * Math.max(0, hop) + (out < 0.25 ? 4 * out : 0) : -112 * (1 - e);
        const sq = drop < 1 && drop > 0.55 ? 1 + 0.06 * Math.sin((drop - 0.55) / 0.45 * Math.PI * 3) * (1 - drop) * 3 : 1;
        ov.style.transformOrigin = "50% 100%"; ov.style.transform = "translateY(" + y.toFixed(1) + "%) scale(" + (2 - sq).toFixed(3) + "," + sq.toFixed(3) + ")";
        return { bo: x < 0.5 ? 0 : 1, bs: 1 };
      },
      xtEnd() { const ov = api.$("xt"); ov.style.transformOrigin = ""; ov.style.clipPath = ""; }
    };
  }
};
