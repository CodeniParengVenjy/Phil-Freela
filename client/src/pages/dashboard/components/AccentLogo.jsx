// The PhilFreela logo in the dashboard's top bar. It is drawn here instead of
// loaded as a picture file, because a picture file can't read the page's
// colors: this way the gold "Phil" follows the accent color the user picked
// in Settings > Appearance. Its three shades come from --logo-light,
// --logo-mid and --logo-dark (top of dashboard.css; lib/appearance.js changes
// them). "Freela" stays white, since the top bar is dark in both modes.
//
// It is the same drawing as public/logo-philfreela.svg, which the pages
// outside the dashboard (homepage, login, admin) keep using.
//
// The loading splash (components/Loaders.jsx) uses it too, with "shine": a
// light glides across the letters every few seconds. The splash also gives
// "Freela" the page's text color (accent-logo-freela, styles/loaders.css) and
// a viewBox that puts the words in the middle.
const FONT = "Brush Script MT, Segoe Script, Lucida Handwriting, cursive";

export default function AccentLogo({ className = "", shine = false, viewBox = "0 0 800 520" }) {
  // No gliding light for people who ask their phone or computer for less motion.
  const showShine = shine && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={viewBox} role="img" aria-label="PhilFreela" className={className}>
      <defs>
        <linearGradient id="accentLogoShades" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--logo-light)" }} />
          <stop offset="55%" style={{ stopColor: "var(--logo-mid)" }} />
          <stop offset="100%" style={{ stopColor: "var(--logo-dark)" }} />
        </linearGradient>
        <filter id="accentLogoShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.35" />
        </filter>
        {showShine && (
          // A see-through band with a white middle that slides from left to
          // right in the first half of every 2.8 seconds, then waits.
          <linearGradient id="accentLogoShine" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="800" y2="220">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.43" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.9" />
            <stop offset="0.57" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
            <animateTransform attributeName="gradientTransform" type="translate" values="-900 0; 900 0; 900 0" keyTimes="0; 0.55; 1" dur="2.8s" repeatCount="indefinite" />
          </linearGradient>
        )}
      </defs>

      <g filter="url(#accentLogoShadow)" transform="skewX(-7)">
        <text x="95" y="190" fontFamily={FONT} fontSize="220" fontWeight="700" fill="url(#accentLogoShades)">Phil</text>
        <text x="78" y="395" fontFamily={FONT} fontSize="220" fontWeight="700" fill="#f5f5f5" className="accent-logo-freela">Freela</text>
      </g>

      {/* The same words again, painted with the moving light on top. */}
      {showShine && (
        <g transform="skewX(-7)" aria-hidden="true">
          <text x="95" y="190" fontFamily={FONT} fontSize="220" fontWeight="700" fill="url(#accentLogoShine)">Phil</text>
          <text x="78" y="395" fontFamily={FONT} fontSize="220" fontWeight="700" fill="url(#accentLogoShine)">Freela</text>
        </g>
      )}
    </svg>
  );
}
