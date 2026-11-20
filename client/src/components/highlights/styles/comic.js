/* Comic book: comic pages. Thick black ink, panels with white gutters, halftone dots in the freelancer's color,
   yellow caption boxes, speech bubbles, and sound words (POW!, KRAK!, WHAM!) on the big moments. Pages turn
   between parts. Music: a superhero theme (strings, brass, timpani, snare), an original tune.
   By level: Beginner a light pizzicato-and-flute theme and a quiet first issue; Average adds the snare and the brass
   tune; Intermediate brings timpani, brass hits and KRAK! cracks; Advanced is the full splash page: choir, gong,
   KA-POW! and the heroic major chord. */
// Moved from the approved preview (previews/highlights-styles/st-comic.js) into the site's player
// (PLAN-highlight-styles.md, Step 2). The player loads this file only when a highlight in this style opens.
import "./comic.css";

export default {
  meta: {
    id: "comic", name: "Comic book", premium: true, look: "Comic panels, halftone dots, POW! sound words",
    music: "Superhero theme: strings, brass, timpani",
    levels: {
      beginner: "a first-issue cover that flips open, a light pizzicato-and-flute theme, calm panels",
      average: "a blue RARE cover with a ZING!, snare and a brass tune join, pages turn between parts",
      intermediate: "an EPIC cover that cracks with KRAK! and POW!, timpani and brass hits drive the story",
      advanced: "a full splash page: KA-POW!, a choir, a gong and a heroic brass chord, \"You found a better person.\" in a caption box"
    },
    art: '<i class="a1"></i><i class="a2"></i><i class="a3"></i>'
  },
  make(api, K) {
    const A = K.A, tone = K.tone, noise = K.noise;
    const LV = { beginner: 0, average: 1, intermediate: 2, advanced: 3 };
    // ---------- The orchestra ----------
    const str = (t, m, v) => { tone(t, K.mtof(m), v, { type: "sawtooth", a: 0.008, d: 0.12, lp: 2300, lpEnd: 900, det: -6 }); tone(t, K.mtof(m), v * 0.8, { type: "sawtooth", a: 0.008, d: 0.12, lp: 2300, lpEnd: 900, det: 7 }); };
    function spad(t, ch, dur, v, choir) {
      const c = A.ctx, g = c.createGain(), end = t + dur;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.35); g.gain.setValueAtTime(v, end - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, end + 0.3);
      const out = choir ? [700, 1150].map((fq) => { const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = fq; f.Q.value = 4; f.connect(g); return f; }) : [(() => { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 1400; f.connect(g); return f; })()];
      ch.tones.forEach((m) => [-8, 8].forEach((de) => { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = K.mtof(m + 12); o.detune.value = de; out.forEach((f) => o.connect(f)); o.start(t); o.stop(end + 0.35); }));
      g.connect(A.pump); api.send(g, 0.5);
    }
    const horn = (t, m, len, v) => tone(t, K.mtof(m), v, { type: "sawtooth", a: 0.04, hold: Math.max(0.05, len * A.STEP - 0.1), sus: 0.8, d: 0.14, lp: 700, lpEnd: 2200, lpT: 0.12, q: 1.2, vib: K.mtof(m) * 0.006, vibRate: 5, vibDelay: 0.25, rev: 0.4 });
    const flute = (t, m, len, v) => tone(t, K.mtof(m), v, { a: 0.05, hold: Math.max(0.05, len * A.STEP - 0.1), d: 0.12, vib: K.mtof(m) * 0.01, vibRate: 5.5, vibDelay: 0.2, rev: 0.45 });
    const pizz = (t, m, v) => tone(t, K.mtof(m), v, { type: "triangle", a: 0.003, d: 0.2, lp: 1600, lpEnd: 500, rev: 0.3 });
    function timp(t, m, v, dest) { tone(t, K.mtof(m) * 1.08, v, { a: 0.004, d: 0.7, glide: K.mtof(m), glideT: 0.08, dest: dest || A.drums }); noise(t, "lowpass", 260, v * 0.4, 0.15, dest || A.drums); }
    function gong(t, v) { [55, 82.4, 110, 146.8].forEach((f, i) => tone(t, f * (1 + i * 0.013), v / (i + 1), { a: 0.01, d: 2.6, dest: A.drums, rev: 0.6 })); noise(t, "lowpass", 900, v * 0.3, 1.2); }
    const MEL = K.line("D4 - - - A4 - - - D5 - - - F5 - E5 D5  D5 - - - C5 - Bb4 - F4 - - - - - - -  E4 - - - G4 - - - C5 - - - E5 - D5 C5  C#5 - - - - - - - E5 - - - A4 - - -");
    const musicDef = {
      bpm: { beginner: 100, average: 116, intermediate: 132, advanced: 140 },
      vol: { beginner: 1.35, average: 1.15, intermediate: 1.05, advanced: 1 },
      prog: ["Dm", "Bb", "C", "A"],
      step(t, st, bar, ch, L, info) {
        const lv = LV[L], r = ch.r, i = (info.barN % 4) * 16 + st, n = MEL[i];
        if (info.outro) { if (st === 0) spad(t, ch, A.BEAT * 4, 0.012); if (st % 4 === 0) pizz(t, ch.tones[(st / 4) % 3] + 12, 0.06); return; }
        if (st === 0) spad(t, ch, A.BEAT * 4, 0.009 + lv * 0.002, lv === 3);
        if (lv === 0) {
          if (st % 2 === 0) pizz(t, ch.tones[(st / 2) % 3] + 12, 0.07);
          if (n) flute(t, n.m + 12, n.len, 0.03);
          if (st === 0 || st === 8) pizz(t, r - 12, 0.1);
          return;
        }
        // the string ostinato: root and fifth in sixteenths
        str(t, (st % 2 === 0 ? r : r + 7) + 12, 0.012 + lv * 0.003);
        if (n) { horn(t, n.m, n.len, 0.035 + lv * 0.005); if (lv === 3) horn(t, n.m + 12, n.len, 0.02); }
        if (st === 4 || st === 12) api.snare(t, 0.05 + lv * 0.012);
        if (lv >= 2 && st === 10) api.snare(t, 0.03);
        if (st === 0 || (lv >= 2 && st === 8)) pizz(t, r - 12, 0.1);
        if (lv >= 2) {
          if (st === 0 || st === 8 || st === 14) timp(t, r - 12, 0.28 + (lv - 2) * 0.06);
          if (st === 0 && bar % 2 === 0) api.brass(t, ch.tones.map((x) => K.mtof(x + 12)), 0.05 + (lv - 2) * 0.015);
          if (bar === 7 && st >= 8) api.snare(t, 0.03 + (st - 8) * 0.012);
          if (bar === 0 && st === 0 && info.barN > 0) api.crash(t, 0.08);
        }
        if (lv === 3) { if (bar === 7 && st >= 12) timp(t, r - 12, 0.2); if (bar === 0 && st === 0 && info.barN > 0) gong(t, 0.25); }
      },
      // While the card waits: a string tremolo and a timpani heartbeat, both growing with every tap
      waitDiv: () => 4,
      wait(t, taps, k, L, q) {
        str(t, 50 + (q ? Math.min(7, Math.floor(q.p * 8)) : 0), 0.012 + taps * 0.004 + (q ? 0.01 : 0));
        if (k % 4 === 0) timp(t, 38, 0.15 + taps * 0.05, A.sfx);
      },
      reveal(L) {
        const t = A.ctx.currentTime + 0.01, lv = LV[L];
        if (lv === 0) { [62, 65, 69, 74, 77].forEach((m, i) => pizz(t + i * 0.05, m, 0.08)); return; }
        const D = [62, 66, 69, 74].map(K.mtof);   // a heroic D major
        api.brass(t, D, 0.06 + lv * 0.02); api.crash(t, 0.06 + lv * 0.02);
        if (lv >= 2) timp(t, 38, 0.45, A.sfx);
        if (lv === 3) { gong(t, 0.35); spad(t, K.chord("D"), 2.2, 0.03, true); api.brass(t + 0.36, D.map((f) => f * 1.5), 0.08); }
      },
      legend() { const t = A.ctx.currentTime + 0.1; [[69, 3], [74, 3], [78, 8]].forEach(([m, l], i) => horn(t + i * 0.24, m - 12, l, 0.05)); },
      tap(i) { timp(A.ctx.currentTime, [38, 41, 45][i] || 45, 0.3, A.sfx); },
      part() { api.crash(A.nextStep, 0.07); timp(A.nextStep, 38, 0.3); }
    };
    const S = () => A.sfx, on = () => !!A.ctx;
    const SF = {
      ping(f = 1318.5, v = 0.12) { if (!on()) return; const t = A.ctx.currentTime; tone(t, f, Math.min(0.07, v * 0.6), { a: 0.002, d: 0.8, dest: S(), rev: 0.4 }); tone(t, f * 2.4, Math.min(0.02, v * 0.2), { a: 0.002, d: 0.3, dest: S() }); },
      tap(i) { if (!on()) return; const t = A.ctx.currentTime; noise(t, "bandpass", 900 + i * 300, 0.3, 0.07, S(), 1.2); tone(t, 140, 0.25, { a: 0.003, d: 0.12, glide: 60, glideT: 0.1, dest: S() }); },
      crack(v = 1) { if (!on()) return; const t = A.ctx.currentTime; noise(t, "highpass", 1800, 0.35 * v, 0.1, S()); noise(t, "lowpass", 400, 0.3 * v, 0.2, S()); },
      pop() { if (!on()) return; tone(A.ctx.currentTime, 420, 0.14, { a: 0.003, d: 0.09, glide: 1000, glideT: 0.05, dest: S() }); }
    };
    // ---------- Pictures ----------
    const INK = "#111111";
    const BURST = (x, cx, cy, r, n, rot) => { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r * 0.62 : r; if (i) x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); };
    return {
      fps: 0, sfx: SF, musicDef,
      xtKinds: ["page", "panels"],
      build() { K.deco("bg", "cm-page"); K.deco("bg", "cm-lines"); },
      ember(x, p, k) {
        const a = k < 0.1 ? 1 : 1 - Math.max(0, (k - 0.55) / 0.45); if (a <= 0) return;
        x.save(); x.globalAlpha = a;
        if (p.in) { const g = api.pullGeom(), e = k * k, e2 = Math.max(0, k - 0.2) ** 2; x.strokeStyle = INK; x.lineWidth = 2.5; x.beginPath(); x.moveTo(p.x0 + (g.cx - p.x0) * e2, p.y0 + (g.cy - p.y0) * e2); x.lineTo(p.x0 + (g.cx - p.x0) * e, p.y0 + (g.cy - p.y0) * e); x.stroke(); x.restore(); return; }
        if (p.shard) { x.translate(p.x, p.y); x.rotate(p.rot); x.fillStyle = "#ffffff"; x.strokeStyle = INK; x.lineWidth = 3; x.fillRect(-p.sz / 2, -p.sz * 0.35, p.sz, p.sz * 0.7); x.strokeRect(-p.sz / 2, -p.sz * 0.35, p.sz, p.sz * 0.7); x.restore(); return; }
        const r = 2.5 + p.sz * 1.8; x.beginPath(); x.arc(p.x, p.y, r, 0, 6.3); x.fillStyle = K.rgb(p.c); x.fill(); x.lineWidth = 2; x.strokeStyle = INK; x.stroke(); x.restore();
      },
      confetti(x, p) {
        const a = Math.max(0, Math.min(1, 1.2 - p.life / 4)); if (a <= 0) return;
        x.save(); x.globalAlpha = a;
        if (p.k === 0) { BURST(x, p.x, p.y, p.w, 6, p.r); x.fillStyle = "#ffe14d"; x.fill(); x.lineWidth = 2; x.strokeStyle = INK; x.stroke(); }
        else { x.beginPath(); x.arc(p.x, p.y, p.w * 0.45, 0, 6.3); x.fillStyle = p.c; x.fill(); x.lineWidth = 2; x.strokeStyle = INK; x.stroke(); }
        x.restore();
      },
      ring(x, cx, cy, r, c, alpha, w) { x.save(); x.globalAlpha = Math.min(1, alpha); x.lineWidth = Math.max(3, w * 0.6); x.strokeStyle = INK; x.beginPath(); x.arc(cx, cy, r, 0, 6.3); x.stroke(); x.restore(); },
      lines(x, q, rnd, cx, cy, R, s) {   // black action lines rushing in from the edges
        x.save(); x.fillStyle = INK;
        for (let i = 0; i < 44; i++) { const a = rnd() * Math.PI * 2, r1 = R * (1.05 - q * 0.15), r0 = R * (0.45 + rnd() * 0.35) + q * R * 0.2, wd = 0.006 + rnd() * 0.014; x.globalAlpha = (1 - q) * 0.85 * s; x.beginPath(); x.moveTo(cx + Math.cos(a - wd) * r1, cy + Math.sin(a - wd) * r1); x.lineTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a + wd) * r1, cy + Math.sin(a + wd) * r1); x.closePath(); x.fill(); }
        x.restore();
      },
      hit(kind, x, y, k) {
        const T = api.TIER, rot = (Math.random() * 24 - 12).toFixed(0) + "deg";
        if (kind === "crack") K.pop("cm-sfx", "<i></i><b>KRAK!</b>", x, y, 900, { "--rot": rot, "--c": "#ffe14d" });
        if (kind === "reveal") K.pop("cm-sfx big", "<i></i><b>" + (T.gold ? "KA-POW!" : T.hype ? "POW!" : T.key === "average" ? "ZING!" : "TA-DA!") + "</b>", api.W * 0.74, api.H * 0.32, 1700, { "--rot": "-10deg", "--c": T.gold ? "#ffd23f" : "#ff4d4d" });
        if (kind === "score") K.pop("cm-sfx", "<i></i><b>WHAM!</b>", x, y, 1500, { "--rot": "10deg", "--c": "#ffe14d" });
        if (kind === "stat") K.pop("cm-sfx", "<i></i><b>BAM!</b>", x + api.W * 0.2, y - 30, 900, { "--rot": rot, "--c": "#ffe14d" });
      },
      // ---------- Changes between parts: a page turns, or panels close in like a comic page ----------
      xtStart(T) {
        const ov = api.$("xt"), cap = api.el("div", "cm-cap st-added"); cap.textContent = ["MEANWHILE...", "LATER...", "AND THEN...", "NEXT UP..."][T.i % 4]; ov.insertBefore(cap, api.$("xtBody")); T.cap = cap;
        if (T.kind === "panels") { const box = api.el("div", "cm-panels st-added"); for (let i = 0; i < 3; i++) box.appendChild(api.el("i")); ov.insertBefore(box, ov.firstChild); T.box = box; T.rows = Array.from(box.children); }
      },
      xtApply(T, x, from, to, ov) {
        const SW = 3.8, cl = api.clamp;
        if (T.kind === "page") {   // the chapter page swings in like a page being turned, then turns away onto the new part
          const inn = api.eOut(cl(x / 0.85)), out = api.eInOut(cl((x - SW) / 0.75));
          ov.style.transformOrigin = "0% 50%";
          ov.style.transform = "perspective(1600px) rotateY(" + (T.swapped ? -100 * out : 100 * (1 - inn)).toFixed(1) + "deg)";
          return { bo: x < 0.5 ? 0 : 1, bs: 1 };
        }
        T.rows.forEach((r, i) => { const d = i % 2 ? 1 : -1, a = api.eOut(cl((x - i * 0.1) / 0.6)), b = api.eInOut(cl((x - SW - i * 0.08) / 0.6)); r.style.transform = "translateY(" + (T.swapped ? -d * 110 * b : d * 110 * (1 - a)).toFixed(1) + "%)"; });
        return { bo: cl((x - 0.85) / 0.2) * (1 - cl((x - SW) / 0.15)), bs: 1 };
      },
      xtEnd(T) { if (T.box) T.box.remove(); if (T.cap) T.cap.remove(); const ov = api.$("xt"); ov.style.transformOrigin = ""; }
    };
  }
};
