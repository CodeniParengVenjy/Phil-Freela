/* Highlight styles for the PhilFreela highlight preview.
   The film (index.html) is the Director's Cut. Each other style changes how the same parts look, move and sound:
   Papercut, Retro, Cartoony, Kinetic type and Comic book. A style is a set of "hooks" the film calls:
     fps        draw the picture this many times a second (Papercut: 12, like stop motion); 0 = smooth
     build()    add the style's decorations when the film starts
     bg / ambient / ember / confetti / ring / lines   draw the backgrounds and the effects
     xtKinds / xtStart / xtApply / xtEnd / xtDraw     the style's own changes between parts
     hit(kind, x, y, k)   a moment worth a visual pop (a tap, the reveal, a crack, a score...)
     sfx        the style's own sound effects (replace the Director's Cut ones)
     music      the style's own music: a 16-step sequencer per bar, louder and fuller with every level
   The level still decides how big everything goes: the card draw, the effects and the music. */
(function () {
  "use strict";
  const DEFS = (window.HL_STYLE_DEFS = window.HL_STYLE_DEFS || {});
  const dbg = (e) => { if (window.__hlDebug) console.error("style:", (e && e.stack) || e); };
  const ORDER = ["cinema", "paper", "retro", "toon", "kinetic", "comic"];
  DEFS.cinema = DEFS.cinema || {
    meta: { id: "cinema", name: "Director's Cut", look: "Movie trailer: light, camera moves, gold for legends", music: "Lo-fi up to festival beats, by level", noHear: true },
    make: () => ({})
  };

  window.HL_STYLES = function (api) {
    const A = api.A;

    // ---------- Music helpers ----------
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    // "C#5" -> a MIDI note number
    function nm(s) {
      const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); if (!m) return null;
      return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
    }
    // A line of music, 16 steps per bar: a note name, "." for a rest, "-" to hold the note before it.
    function line(str) {
      const tk = str.trim().split(/\s+/), out = [];
      for (let i = 0; i < tk.length; i++) {
        const t = tk[i]; if (t === "." || t === "-") { out.push(null); continue; }
        let len = 1; while (tk[i + len] === "-") len++;
        out.push({ m: nm(t), len });
      }
      return out;
    }
    // A chord by name ("Am", "G7", "Bb", "D"): its root (around the third octave) and its notes
    const CH_CACHE = {};
    function chord(name) {
      if (CH_CACHE[name]) return CH_CACHE[name];
      const m = /^([A-G][#b]?)(maj7|m7|m|7|sus4)?$/.exec(name);
      let r = nm(m[1] + "3"); if (r > 55) r -= 12;   // roots from G#2 to G3
      const q = m[2] || "";
      const iv = q === "m" ? [0, 3, 7] : q === "7" ? [0, 4, 7, 10] : q === "maj7" ? [0, 4, 7, 11] : q === "m7" ? [0, 3, 7, 10] : q === "sus4" ? [0, 5, 7] : [0, 4, 7];
      return (CH_CACHE[name] = { name, r, iv, tones: iv.map((x) => r + x) });
    }
    // One note: an oscillator with an envelope, an optional filter, vibrato and pitch glide.
    function tone(t, f, v, o) {
      o = o || {};
      const c = A.ctx, g = c.createGain(), src = c.createOscillator();
      if (o.wave) src.setPeriodicWave(o.wave); else src.type = o.type || "sine";
      src.frequency.setValueAtTime(f, t);
      if (o.glide) src.frequency.exponentialRampToValueAtTime(o.glide, t + (o.glideT || 0.1));
      if (o.det) src.detune.value = o.det;
      const a = o.a || 0.005, hold = o.hold || 0, d = o.d || 0.3, end = t + a + hold + d;
      let node = src;
      if (o.lp) {
        const fl = c.createBiquadFilter(); fl.type = o.bp ? "bandpass" : "lowpass"; fl.frequency.setValueAtTime(o.lp, t); fl.Q.value = o.q || 0.7;
        if (o.lpEnd) fl.frequency.exponentialRampToValueAtTime(o.lpEnd, t + (o.lpT || a + hold + d));
        node.connect(fl); node = fl;
      }
      if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vibRate || 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(o.vib, t + (o.vibDelay || 0.12)); l.connect(lg); lg.connect(src.frequency); l.start(t); l.stop(end + 0.06); }
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), t + a);
      if (hold) g.gain.setValueAtTime(Math.max(v * (o.sus || 1), 0.0002), t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      node.connect(g); g.connect(o.dest || A.pump); if (o.rev) api.send(g, o.rev);
      src.start(t); src.stop(end + 0.05);
      return g;
    }
    // Pulse waves for chiptune (duty 0.125, 0.25, 0.5)
    const WAVES = {};
    function pulse(duty) {
      if (WAVES[duty]) return WAVES[duty];
      const n = 48, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      return (WAVES[duty] = A.ctx.createPeriodicWave(re, im));
    }
    const noise = (t, type, f, v, d, dest, q) => api.noiseHit(t, type, f, v, d, dest || A.drums, q);

    // ---------- The sequencer every style's music runs on ----------
    // M: { bpm: {level: n}, prog: [chord names, one per bar], swing, step(t, st, bar, ch, L, info), wait(t, n, k, L),
    //      waitDiv, reveal(L), legend(), tap(i, L), part(L), restartOnPart }
    function makeMusic(M) {
      let waiting = false, wk = 0;
      const lvl = () => api.TIER.key;
      const setVol = (L) => { const v = (M.vol && M.vol[L]) || 1; if (A.drums && A.drums.gain.value !== v) { A.drums.gain.value = v; A.pump.gain.value = v; } };
      function run(L, outro, part, untilT) {
        setVol(L);
        while (A.nextStep < untilT) {
          const st = A.step % 16, barN = Math.floor(A.step / 16), ch = chord(M.prog[barN % M.prog.length]);
          let t = A.nextStep; if (M.swing && st % 4 === 2) t += A.STEP * M.swing;
          try { M.step(t, st, barN % 8, ch, L, { outro, barN, part }); } catch (e) { dbg(e); }
          A.nextStep += A.STEP; A.step++;
        }
      }
      return {
        bpm: (L) => M.bpm[L] || 110,
        restartOnPart: !!M.restartOnPart,
        schedule() {
          const s = api.cur; if (!s) return;
          const n = A.ctx.currentTime;
          if (s.id === "pull" && !api.beatOn(s)) {
            if (!waiting || !M.wait) return;
            const q = api.thrillAt(api.local);
            if (q && (q.fake || q.freeze)) { A.nextWait = Math.max(A.nextWait, n + 0.05); return; }   // the fake-out and the freeze: silence
            if (A.nextWait < n) A.nextWait = n + 0.05;
            const taps = api.DS.taps.length, per = A.BEAT / (M.waitDiv ? M.waitDiv(taps, lvl()) : 1);
            while (A.nextWait < n + 0.12) { try { M.wait(A.nextWait, taps, wk++, lvl(), q); } catch (e) { dbg(e); } A.nextWait += per; }
            return;
          }
          if (!api.beatOn(s)) return;
          if (A.nextStep < n - 0.2) { A.nextStep = n + 0.04; A.gridT0 = A.nextStep - A.step * A.STEP; }
          run(lvl(), s.id === "end", s.id, n + 0.12);
        },
        waitStart() { waiting = true; wk = 0; A.nextWait = A.ctx.currentTime + 0.15; },
        waitStop() { waiting = false; },
        reveal() { if (M.reveal) try { M.reveal(lvl()); } catch (e) { dbg(e); } },
        legend() { if (M.legend) try { M.legend(lvl()); } catch (e) { dbg(e); } },
        tap(i) { if (M.tap) try { M.tap(i, lvl()); } catch (e) { dbg(e); } },
        part() { if (M.part) try { M.part(lvl()); } catch (e) { dbg(e); } },
        // "Hear it" on the launch page: 8 bars at the chosen freelancer's level, without opening the film
        preview(L, onEnd) {
          A.BEAT = 60 / (M.bpm[L] || 110); A.STEP = A.BEAT / 4; A.step = 0; A.nextStep = A.ctx.currentTime + 0.08; A.gridT0 = A.nextStep;
          if (A.lp) { A.lp.frequency.cancelScheduledValues(A.ctx.currentTime); A.lp.frequency.setValueAtTime(18000, A.ctx.currentTime); }
          if (A.music) A.music.gain.value = 0.7;
          if (M.reveal) try { M.reveal(L); } catch (e) { dbg(e); }
          const total = 16 * 8, id = setInterval(() => {
            if (api.filmOpen || A.step >= total) { clearInterval(id); onEnd(); return; }
            run(L, false, "preview", Math.min(A.ctx.currentTime + 0.15, A.gridT0 + total * A.STEP - 0.001));
          }, 40);
          return () => clearInterval(id);
        }
      };
    }

    // ---------- Drawing helpers for the effects canvas ----------
    function starPath(x, cx, cy, r, ri, n, rot) {
      x.beginPath();
      for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? ri : r; if (i) x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
      x.closePath();
    }
    const rgb = (c, a) => "rgba(" + c.join(",") + "," + (a == null ? 1 : a).toFixed(3) + ")";
    // A short-lived element on top of the film (in the TAP! layer): comic words, pixel scores, puffs...
    function pop(cls, html, x, y, life, vars) {
      const layer = api.$("tapFx"); if (!layer) return null;
      const e = api.el("div", "spop " + cls, html); e.style.left = Math.round(x) + "px"; e.style.top = Math.round(y) + "px";
      if (vars) Object.keys(vars).forEach((k) => e.style.setProperty(k, vars[k]));
      layer.appendChild(e); setTimeout(() => e.remove(), life || 1000); return e;
    }
    // A layer of decorations in the background (deco-bg) or on top (deco-fg)
    function deco(where, cls, html) { const e = api.el("div", cls, html || ""); api.$(where === "fg" ? "decoFg" : "decoBg").appendChild(e); return e; }

    const K = { mtof, nm, line, chord, tone, pulse, noise, makeMusic, starPath, rgb, pop, deco, A };
    const made = {};
    function use(id) {
      if (!DEFS[id] || id === "cinema") return {};
      if (!made[id]) {
        const h = DEFS[id].make(api, K) || {};
        h.id = id;
        if (h.musicDef) h.music = makeMusic(h.musicDef);
        made[id] = h;
      }
      return made[id];
    }
    let stopPrev = null;
    return {
      list: ORDER.filter((id) => DEFS[id]).map((id) => DEFS[id].meta),
      use,
      preview(id, onEnd) {
        if (stopPrev) { stopPrev(); stopPrev = null; }
        if (!id) return;
        const h = use(id); if (!h.music || !api.audioInit()) { onEnd(); return; }
        A.on = true; A.master.gain.setTargetAtTime(0.55, A.ctx.currentTime, 0.02); A.ctx.resume();
        const prevSfx = Object.assign({}, api.SFX); Object.assign(api.SFX, api.SFX0, h.sfx || {});
        const stop = h.music.preview(api.tierFor().key, () => { stopPrev = null; Object.assign(api.SFX, prevSfx); onEnd(); });
        stopPrev = () => { stop(); Object.assign(api.SFX, prevSfx); };
      }
    };
  };
})();
