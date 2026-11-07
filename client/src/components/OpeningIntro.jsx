// The opening: the first time someone opens the homepage in a visit, the
// PhilFreela logo writes itself letter by letter like a pen signature, fills
// with gold and white, a light glides over it, the tagline appears word by
// word, then the logo flies into its place in the top bar while the homepage
// comes in. The user picked this "Signature" opening (choice A of
// PLAN-opening-transitions.md); styles/opening.css has the looks.
//
// A tap, a click, the Skip button or any key ends it at once. Phones and
// computers set to reduce motion get a short fade instead. It plays once per
// visit (the browser tab remembers it), so coming back to the homepage doesn't
// replay it. The homepage loads underneath the whole time, so nobody waits.
import { useEffect, useRef, useState } from "react";
import "../styles/opening.css";

const PLAYED_KEY = "philfreela-opening-played";
const FONT = "Brush Script MT, Segoe Script, Lucida Handwriting, cursive";
const TAGLINE = ["Where", "Filipino", "talent", "meets", "global", "opportunity"];

// When each part starts, in milliseconds from the start (about 3.1 s until the
// homepage is usable, then it finishes settling).
const T = {
  philStart: 120, // the four letters of "Phil", one after another
  philStep: 115,
  freelaStart: 560, // then the six letters of "Freela"
  freelaStep: 95,
  letter: 720, // how long writing one letter takes
  fill: 1420, // the letters fill with color
  outlineOff: 1650, // the pen lines fade
  shine: 1820, // a light glides over the letters
  tagline: 1850, // the tagline, one word every 60 ms
  taglineStep: 60,
  leave: 2450, // the cover fades, the logo flies, the homepage comes in
  fly: 760, // how long the flight takes
  rise: 380, // the homepage's words rise once the logo is on its way
  end: 3900 // the homepage has settled: the opening is taken away
};

// Once per visit, and never when the page has something to say at once (skip).
function shouldPlay(skip) {
  if (skip) return false;
  try {
    return !window.sessionStorage.getItem(PLAYED_KEY);
  } catch {
    return false; // storage blocked: better no opening than one on every visit
  }
}

// "Phil" as four separate letters, so each can be written in turn. They stay
// inside one <text>, so the letters keep exactly the places the word gives them.
const lettersOf = (word) => word.split("").map((letter, index) => <tspan key={index}>{letter}</tspan>);

// pageRef: the homepage (its parts come in at the end). logoRef: the top bar's
// logo, where the flying logo lands.
export default function OpeningIntro({ pageRef, logoRef, skip = false }) {
  const [playing, setPlaying] = useState(() => shouldPlay(skip));
  const rootRef = useRef(null);
  const coverRef = useRef(null);
  const flyRef = useRef(null);
  const logoArtRef = useRef(null);
  const outlineRef = useRef(null);
  const fillRef = useRef(null);
  const shineRef = useRef(null);
  const taglineRef = useRef(null);
  const skipRef = useRef(null);

  useEffect(() => {
    if (!playing) return undefined;
    try {
      window.sessionStorage.setItem(PLAYED_KEY, "1");
    } catch {
      // Storage blocked: nothing to remember.
    }

    // Every movement and timer is kept, so Skip (or leaving the page) stops
    // them all at once; stopping a movement puts the element back as it was.
    const movements = [];
    const timers = [];
    const move = (element, keyframes, options) => {
      if (element) movements.push(element.animate(keyframes, { fill: "both", ...options }));
    };
    const at = (time, run) => timers.push(window.setTimeout(run, time));
    const finish = () => setPlaying(false);

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // Less motion: the finished logo shows for a moment, then fades away.
      move(fillRef.current, [{ opacity: 1 }, { opacity: 1 }], { duration: 1 });
      move(rootRef.current, [{ opacity: 1 }, { opacity: 0 }], { delay: 350, duration: 400 });
      at(800, finish);
    } else {
      // 1. Each letter is drawn like a pen stroke: its outline is a dashed line
      //    whose one long dash slides in (stroke-dashoffset 1500 to 0).
      const letters = outlineRef.current ? [...outlineRef.current.querySelectorAll("tspan")] : [];
      letters.forEach((letter, index) => {
        const start = index < 4 ? T.philStart + index * T.philStep : T.freelaStart + (index - 4) * T.freelaStep;
        move(letter, [{ strokeDashoffset: 1500 }, { strokeDashoffset: 0 }], { delay: start, duration: T.letter, easing: "cubic-bezier(.45,0,.25,1)" });
      });

      // 2. The letters fill with color, the pen lines fade, and a glow pulses.
      move(fillRef.current, [{ opacity: 0 }, { opacity: 1 }], { delay: T.fill, duration: 480, easing: "ease-out" });
      move(outlineRef.current, [{ opacity: 1 }, { opacity: 0 }], { delay: T.outlineOff, duration: 420 });
      move(flyRef.current, [
        { filter: "drop-shadow(0 0 0 rgba(255,150,60,0))" },
        { filter: "drop-shadow(0 0 22px rgba(255,150,60,.75))" },
        { filter: "drop-shadow(0 0 6px rgba(255,150,60,.25))" }
      ], { delay: T.fill, duration: 900 });

      // 3. The light that glides over the letters (an SVG animation in the drawing).
      at(T.shine, () => {
        try {
          shineRef.current?.beginElement();
        } catch {
          // This browser can't run it: no light, the rest still plays.
        }
      });

      // 4. The tagline, word by word, then it fades as the logo leaves.
      const words = taglineRef.current ? [...taglineRef.current.children] : [];
      words.forEach((word, index) => move(word, [
        { opacity: 0, transform: "translateY(.6em)", filter: "blur(6px)" },
        { opacity: 1, transform: "none", filter: "blur(0px)" }
      ], { delay: T.tagline + index * T.taglineStep, duration: 480, easing: "cubic-bezier(.16,1,.3,1)" }));
      move(taglineRef.current, [{ opacity: 1 }, { opacity: 0 }], { delay: T.leave, duration: 260 });

      // 5. The cover fades and the homepage comes in under it: the top bar, the
      //    picture behind the headline settling, then the words and the two
      //    cards rising one after another.
      move(coverRef.current, [{ opacity: 1 }, { opacity: 0 }], { delay: T.leave, duration: 620, easing: "ease-in-out" });
      move(skipRef.current, [{ opacity: 1 }, { opacity: 0 }], { delay: T.leave, duration: 300 });
      // Once the cover is gone, clicks reach the homepage (while it settles).
      at(T.leave + 620, () => {
        if (rootRef.current) rootRef.current.style.pointerEvents = "none";
      });
      const page = pageRef.current;
      if (page) {
        move(page.querySelector("#mainNavbar"), [{ opacity: 0 }, { opacity: 1 }], { delay: T.leave, duration: 500, easing: "ease-out" });
        move(page.querySelector(".hero-bg"), [
          { opacity: 0, transform: "scale(1.12)" },
          { opacity: 1, transform: "scale(1)" }
        ], { delay: T.leave - 120, duration: 1300, easing: "cubic-bezier(.2,.7,.2,1)" });
        const rising = [...page.querySelectorAll(".hero-overlay-content > *"), page.querySelector(".cards-container")];
        rising.forEach((element, index) => move(element, [
          { opacity: 0, transform: "translateY(26px)" },
          { opacity: 1, transform: "none" }
        ], { delay: T.leave + T.rise + index * 90, duration: 760, easing: "cubic-bezier(.16,1,.3,1)" }));
      }

      // 6. The logo flies to the top bar's logo and hands over to it. The top
      //    bar's logo stays hidden until the flying one lands on it.
      move(logoRef.current, [{ opacity: 0 }, { opacity: 1 }], { delay: T.leave + T.fly - 60, duration: 140 });
      at(T.leave, () => {
        const art = logoArtRef.current;
        const target = logoRef.current;
        if (!art || !target) return;
        const from = art.getBoundingClientRect();
        const to = target.getBoundingClientRect();
        if (!from.width || !to.width) return;
        // Same letters in the same places: this drawing is 640 wide starting at
        // x = -56; the top bar's picture file is 800 wide starting at 0.
        const fromScale = from.width / 640;
        const toScale = to.width / 800;
        const dx = to.left - from.left - 56 * toScale;
        const dy = to.top - from.top;
        move(flyRef.current, [
          { transform: "translate(0px, 0px) scale(1)" },
          { transform: `translate(${dx}px, ${dy}px) scale(${toScale / fromScale})` }
        ], { duration: T.fly, easing: "cubic-bezier(.65,0,.25,1)" });
        move(flyRef.current, [{ opacity: 1 }, { opacity: 1, offset: 0.88 }, { opacity: 0 }], { duration: T.fly + 90 });
      });

      at(T.end, finish);
    }

    // Any key skips it.
    window.addEventListener("keydown", finish);
    return () => {
      window.removeEventListener("keydown", finish);
      timers.forEach((timer) => window.clearTimeout(timer));
      movements.forEach((movement) => movement.cancel());
    };
  }, [playing, pageRef, logoRef]);

  if (!playing) return null;

  const skipNow = () => setPlaying(false);
  return (
    // A tap or click anywhere skips it.
    <div className="pf-opening" ref={rootRef} onClick={skipNow}>
      <div className="pf-opening-cover" ref={coverRef}></div>
      <div className="pf-opening-stage" aria-hidden="true">
        <div className="pf-opening-box">
          <div className="pf-opening-fly" ref={flyRef}>
            {/* The same drawing as the logo everywhere else (font, size, slant). */}
            <svg className="pf-opening-logo" ref={logoArtRef} viewBox="-56 0 640 470" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="pfOpeningGold" gradientUnits="userSpaceOnUse" x1="60" y1="40" x2="460" y2="210">
                  <stop offset="0" stopColor="#ffbf45" />
                  <stop offset="0.55" stopColor="#ffa228" />
                  <stop offset="1" stopColor="#f58600" />
                </linearGradient>
                {/* A see-through band with a white middle that slides across once. */}
                <linearGradient id="pfOpeningShine" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="800" y2="220" gradientTransform="translate(-900 0)">
                  <stop offset="0" stopColor="#fff" stopOpacity="0" />
                  <stop offset="0.44" stopColor="#fff" stopOpacity="0" />
                  <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
                  <stop offset="0.56" stopColor="#fff" stopOpacity="0" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                  <animateTransform ref={shineRef} attributeName="gradientTransform" type="translate" from="-900 0" to="900 0" dur="0.95s" begin="indefinite" fill="freeze" />
                </linearGradient>
                {/* The soft glow around the pen lines. */}
                <filter id="pfOpeningGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g transform="skewX(-7)" fontFamily={FONT} fontSize="220" fontWeight="700">
                {/* The pen lines: each letter's outline, drawn in turn. */}
                <g ref={outlineRef} filter="url(#pfOpeningGlow)" fill="none" strokeWidth="2.6" strokeLinejoin="round" strokeDasharray="1500 1500" strokeDashoffset="1500">
                  <text x="95" y="190" stroke="url(#pfOpeningGold)">{lettersOf("Phil")}</text>
                  <text x="78" y="395" stroke="#fff4e6">{lettersOf("Freela")}</text>
                </g>
                {/* The filled letters. */}
                <g ref={fillRef} opacity="0">
                  <text x="95" y="190" fill="url(#pfOpeningGold)">Phil</text>
                  <text x="78" y="395" fill="#f5f5f5">Freela</text>
                </g>
                {/* The same letters painted with the gliding light. */}
                <g>
                  <text x="95" y="190" fill="url(#pfOpeningShine)">Phil</text>
                  <text x="78" y="395" fill="url(#pfOpeningShine)">Freela</text>
                </g>
              </g>
            </svg>
          </div>
          <p className="pf-opening-tagline" ref={taglineRef}>
            {TAGLINE.map((word, index) => (
              <span key={word} className={index >= 4 ? "pf-opening-highlight" : undefined}>
                {index < TAGLINE.length - 1 ? `${word} ` : word}
              </span>
            ))}
          </p>
        </div>
      </div>
      <button type="button" className="pf-opening-skip" ref={skipRef}>Skip</button>
    </div>
  );
}
