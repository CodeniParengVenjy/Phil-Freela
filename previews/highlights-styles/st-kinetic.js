/* Kinetic type: the words are the show. Huge condensed capitals on black, the freelancer's color as the only
   accent, rows of giant words sliding past, photos in black and white. Every part starts on the beat, so the words
   land on the music. Music: a punchy electro beat (kick, claps, a bouncing bass, short "vocal" chops, stutters).
   By level: Beginner a minimal beat and words that slide in; Average adds claps and chops; Intermediate is a full
   electro groove with stutter fills, and the card cracks; Advanced adds a sub bass, a hook and a drop, and the level
   word fills the screen in rows. */
(function () {
  "use strict";
  const DEFS = (window.HL_STYLE_DEFS = window.HL_STYLE_DEFS || {});
  DEFS.kinetic = {
    meta: {
      id: "kinetic", name: "Kinetic type", premium: true, look: "Big bold words that move on the beat",
      music: "Electro beat: kick, claps, vocal chops",
      levels: {
        beginner: "a black card and words that slide in on a minimal beat",
        average: "a blue RARE card, claps and short vocal chops, words that land on the beat",
        intermediate: "an EPIC card that cracks, then a full electro groove with stutter fills and slamming words",
        advanced: "LEGENDARY in giant rows across the screen, a sub-bass drop and a hook, every word hitting on the beat"
      },
      art: '<i class="a1"></i>'
    },
    make(api, K) {
      const A = K.A, tone = K.tone, noise = K.noise;
      const LV = { beginner: 0, average: 1, intermediate: 2, advanced: 3 };
      // A short "vocal" chop: a chord through two vowel-like filters
      function chop(t, notes, v, dur) {
        const c = A.ctx, g = c.createGain(), f1 = c.createBiquadFilter(), f2 = c.createBiquadFilter();
        f1.type = f2.type = "bandpass"; f1.frequency.value = 820; f2.frequency.value = 1250; f1.Q.value = f2.Q.value = 3.5;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.14));
        notes.forEach((m) => [-6, 6].forEach((de) => { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = K.mtof(m); o.detune.value = de; o.connect(f1); o.connect(f2); o.start(t); o.stop(t + (dur || 0.14) + 0.05); }));
        f1.connect(g); f2.connect(g); g.connect(A.pump); api.send(g, 0.35);
      }
      const lead = (t, m, len, v) => tone(t, K.mtof(m), v, { type: "sawtooth", a: 0.004, hold: Math.max(0.03, len * A.STEP * 0.6), d: 0.1, lp: 3200, lpEnd: 900, lpT: 0.2, det: 7, rev: 0.3 });
      const HOOK = K.line("D5 . F5 . A5 . . . G5 . F5 . E5 . D5 .  D5 . F5 . Bb5 . . . A5 . F5 . D5 . C5 .  C5 . F5 . A5 . . . G5 . F5 . C5 . A4 .  E5 . G5 . C6 . . . Bb5 . G5 . E5 . C5 .");
      const voice = (ch) => ch.tones.map((m) => m + 24);
      const musicDef = {
        bpm: { beginner: 100, average: 112, intermediate: 124, advanced: 128 },
        vol: { beginner: 2.4, average: 1.6, intermediate: 1.2, advanced: 1 },
        prog: ["Dm", "Bb", "F", "C"], restartOnPart: true,
        step(t, st, bar, ch, L, info) {
          const lv = LV[L], r = ch.r, root = r - 12, i = (info.barN % 4) * 16 + st;
          if (info.outro) { if (st % 4 === 2) api.pluck(t, K.mtof(voice(ch)[(st / 4 | 0) % 3]), 0.03, "triangle"); if (st === 0) api.bass(t, K.mtof(root), 0.05, A.BEAT * 2, 300); return; }
          const build = lv === 3 && bar === 7 && st >= 8;   // Advanced: the kick drops out for a snare build into the next phrase
          const KK = lv === 0 ? [0, 8] : [0, 4, 8, 12];
          if (KK.includes(st) && !build) { api.kick(t, lv === 0 ? 0.3 : 0.5 + lv * 0.06, lv >= 2); if (lv === 3) api.sub(t, K.mtof(root), 0.18, A.BEAT * 0.7); }
          if (lv >= 1 && (st === 4 || st === 12)) api.clap(t, 0.12 + lv * 0.03);
          if (lv === 0 ? st % 4 === 2 : lv === 1 ? st % 4 === 2 : true) api.hat(t, lv === 0 ? 0.015 : 0.025 * (st % 4 === 2 ? 1.4 : 0.8));
          if (lv >= 2 && st % 4 === 2) api.hat(t, 0.04, true);
          const BS = lv === 0 ? [0, 10] : [0, 3, 6, 10, 14];
          if (BS.includes(st) && !build) api.bass(t, K.mtof(root + (st === 6 || st === 14 ? 12 : 0)), 0.06 + lv * 0.006, A.STEP * 1.6, 380 + lv * 260);
          if (lv === 0 && [0, 6, 12].includes(st)) api.pluck(t, K.mtof(voice(ch)[(st / 6) % 3]), 0.035, "triangle");
          const CH = lv === 1 ? [6, 14] : lv >= 2 ? [2, 6, 10, 14] : [];
          if (CH.includes(st)) chop(t, voice(ch), 0.04 + lv * 0.006);
          if (lv >= 2 && bar === 7 && st >= 12) chop(t, voice(ch), 0.03 + (st - 12) * 0.012, 0.08);   // stutter fill
          if (lv === 3) { const h = HOOK[i]; if (h && bar >= 4) lead(t, h.m, h.len, 0.035); if (build) api.snare(t, 0.035 + (st - 8) * 0.014); if (bar === 0 && st === 0 && info.barN > 0) api.crash(t, 0.08); }
        },
        // While the card waits: a muffled kick on the beat that opens up with every tap
        waitDiv: (taps) => [1, 1, 2, 4][Math.min(taps, 3)],
        wait(t, taps, k, L, q) {
          const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25 + taps * 0.08, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
          o.connect(g); g.connect(A.sfx); o.start(t); o.stop(t + 0.32);
          if (q) noise(t, "highpass", 7000, 0.02 + 0.04 * q.p, 0.03, A.sfx);
        },
        reveal(L) {
          const t = A.ctx.currentTime + 0.01, lv = LV[L];
          if (lv === 0) { [62, 65, 69, 74].forEach((m) => api.pluck(t, K.mtof(m), 0.05, "triangle")); return; }
          chop(t, [62, 65, 69, 74], 0.08, 0.4); api.clap(t, 0.2);
          if (lv >= 2) { api.crash(t, 0.1); api.sub(t, K.mtof(38), 0.35, 1.1); }
        },
        legend() { const t = A.ctx.currentTime + 0.05; [0, 0.16, 0.32].forEach((d, i) => chop(t + d, [62, 65, 69].map((m) => m + (i === 2 ? 5 : 0)), 0.06, i === 2 ? 0.5 : 0.12)); },
        tap(i) { const t = A.ctx.currentTime; api.kick(t, 0.5, true); api.hat(t + 0.002, 0.05); },
        part() { api.crash(A.nextStep, 0.07); }
      };
      const S = () => A.sfx, on = () => !!A.ctx;
      const SF = {
        ping(f = 1318.5, v = 0.12) { if (!on()) return; tone(A.ctx.currentTime, f, Math.min(0.06, v * 0.6), { a: 0.002, d: 0.12, dest: S() }); },
        pop() { if (!on()) return; noise(A.ctx.currentTime, "highpass", 5000, 0.12, 0.02, S()); },
        tick(v = 0.1) { if (!on()) return; noise(A.ctx.currentTime, "highpass", 6000, v, 0.01, S()); },
        tap(i) { if (!on()) return; noise(A.ctx.currentTime, "bandpass", 1800 + i * 600, 0.25, 0.04, S(), 1.5); },
        crack(v = 1) { if (!on()) return; const t = A.ctx.currentTime; [0, 0.03, 0.06, 0.09].forEach((d, i) => noise(t + d, "bandpass", 1200 + i * 900, 0.18 * v, 0.02, S(), 2)); tone(t, 220, 0.05 * v, { type: "square", a: 0.001, d: 0.12, glide: 110, glideT: 0.1, dest: S() }); }
      };
      // ---------- Pictures ----------
      return {
        fps: 0, sfx: SF, musicDef,
        xtKinds: ["type", "stripes"],
        build() {
          const U = api.U, rows = [U.name.toUpperCase(), (U.title || "").toUpperCase(), "PHILFREELA HIGHLIGHTS"];
          const box = K.deco("bg", "kt-marquee");
          rows.forEach((w, i) => { const r = api.el("div", "kt-row r" + i), s = api.txt("span", "", (w + "   ").repeat(6)); r.appendChild(s); box.appendChild(r); });
          api.film.style.setProperty("--beat", (A.BEAT || 0.5).toFixed(3) + "s");
        },
        go() { api.film.style.setProperty("--beat", (A.BEAT || 0.5).toFixed(3) + "s"); api.$("decoBg").querySelectorAll(".kt-wall").forEach((e) => e.remove()); },
        ember(x, p, k) {
          const a = k < 0.1 ? 1 : 1 - Math.max(0, (k - 0.5) / 0.5); if (a <= 0 || p.in) return;
          x.save(); x.translate(p.x, p.y); x.rotate(p.spin); x.globalAlpha = a; x.fillStyle = p.shard ? "#ffffff" : K.rgb(p.c);
          if (p.shard) x.fillRect(-p.sz, -1.5, p.sz * 2, 3); else x.fillRect(-p.sz * 2, -1, p.sz * 4, 2);
          x.restore();
        },
        confetti(x, p) { const a = Math.max(0, Math.min(1, 1.2 - p.life / 4)); x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.globalAlpha = a; x.fillStyle = p.k % 2 ? "#ffffff" : api.THEME; x.fillRect(-p.w, -1.5, p.w * 2, 3); x.restore(); },
        ring(x, cx, cy, r, c, alpha) { x.save(); x.globalAlpha = Math.min(1, alpha); x.strokeStyle = "#ffffff"; x.lineWidth = 1.5; x.beginPath(); x.arc(cx, cy, r, 0, 6.3); x.stroke(); x.strokeStyle = api.THEME; x.beginPath(); x.arc(cx, cy, r * 0.82, 0, 6.3); x.stroke(); x.restore(); },
        lines(x, q, rnd, cx, cy, R, s) { x.save(); x.strokeStyle = "#ffffff"; for (let i = 0; i < 36; i++) { const a = rnd() * Math.PI * 2, r0 = R * (0.25 + rnd() * 0.3) + q * R * 0.5, len = R * (0.15 + rnd() * 0.3) * (1 - q); x.globalAlpha = (1 - q) * 0.7 * s; x.lineWidth = 1 + rnd() * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len)); x.stroke(); } x.restore(); },
        hit(kind, x, y, k) {
          const T = api.TIER;
          if (kind === "reveal") {
            // The level word (or their first name for Beginner) fills the screen in rows that slide past
            const w = (T.key === "beginner" ? api.U.first : { average: "RARE", intermediate: "EPIC", advanced: "LEGENDARY" }[T.key]).toUpperCase();
            const wall = K.deco("bg", "kt-wall" + (T.hype ? " hype" : ""));
            for (let i = 0; i < 6; i++) { const r = api.el("div", "kt-wrow"), s = api.txt("span", "", (w + " ").repeat(8)); r.appendChild(s); wall.appendChild(r); }
          }
          if (kind === "crack") K.pop("kt-flash", "<b>" + ["CRACK", "BREAK", "OPEN", "NOW", "GO", "YES"][k % 6] + "</b>", x, y, 500);
          if (kind === "score") K.pop("kt-tag", "<b>TOP RATED</b>", x, y + 40, 1800);
        },
        // ---------- Changes between parts ----------
        xtStart(T) {
          const ov = api.$("xt");
          if (T.kind === "type") {
            const box = api.el("div", "kt-type st-added"), word = T.to.label.toUpperCase();
            for (let i = 0; i < 3; i++) { const r = api.el("div", "kt-trow"), s = api.txt("span", "", (word + " ").repeat(6)); r.appendChild(s); box.appendChild(r); }
            ov.insertBefore(box, api.$("xtBody")); T.box = box; T.rows = Array.from(box.children);
          } else {
            const box = api.el("div", "kt-stripes st-added");
            for (let i = 0; i < 5; i++) box.appendChild(api.el("i"));
            ov.insertBefore(box, api.$("xtBody")); T.box = box; T.rows = Array.from(box.children);
          }
        },
        xtApply(T, x, from, to, ov) {
          const SW = 3.8, cl = api.clamp, inn = api.eInOut(cl(x / 0.7)), out = api.eInOut(cl((x - SW) / 0.7));
          if (T.kind === "type") {
            ov.style.clipPath = T.swapped ? "inset(0 " + (100 * out).toFixed(1) + "% 0 0)" : "inset(0 0 0 " + (100 * (1 - inn)).toFixed(1) + "%)";
            T.rows.forEach((r, i) => { const dir = i % 2 ? 1 : -1, sp = 6 + i * 3; r.firstChild.style.transform = "translateX(" + (dir * (x * sp) - 20).toFixed(2) + "%)"; });
            return { bo: cl((x - 0.7) / 0.2) * (1 - cl((x - SW) / 0.2)), bs: 1 };
          }
          // full-width bands (the box is turned a little) slide in from the left, one after another, and out to the right
          T.rows.forEach((r, i) => { const a = api.eInOut(cl((x - i * 0.08) / 0.6)), b = api.eInOut(cl((x - SW - i * 0.08) / 0.6)); r.style.transform = "translateX(" + (T.swapped ? 112 * b : -112 + 112 * a).toFixed(1) + "%)"; });
          ov.style.clipPath = "";
          return { bo: cl((x - 0.9) / 0.2) * (1 - cl((x - SW) / 0.15)), bs: 1 };
        },
        xtEnd(T) { if (T.box) T.box.remove(); }
      };
    }
  };
})();
