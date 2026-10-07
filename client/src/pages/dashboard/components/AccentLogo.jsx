// The PhilFreela logo in the dashboard's top bar. It is drawn here instead of
// loaded as a picture file, because a picture file can't read the page's
// colors: this way the gold "Phil" follows the accent color the user picked
// in Settings > Appearance. Its three shades come from --logo-light,
// --logo-mid and --logo-dark (top of dashboard.css; lib/appearance.js changes
// them). "Freela" stays white, since the top bar is dark in both modes.
//
// It is the same drawing as public/logo-philfreela.svg, which the pages
// outside the dashboard (homepage, login, admin) keep using.
const FONT = "Brush Script MT, Segoe Script, Lucida Handwriting, cursive";

export default function AccentLogo({ className = "" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" role="img" aria-label="PhilFreela" className={className}>
      <defs>
        <linearGradient id="accentLogoShades" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--logo-light)" }} />
          <stop offset="55%" style={{ stopColor: "var(--logo-mid)" }} />
          <stop offset="100%" style={{ stopColor: "var(--logo-dark)" }} />
        </linearGradient>
        <filter id="accentLogoShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter="url(#accentLogoShadow)" transform="skewX(-7)">
        <text x="95" y="190" fontFamily={FONT} fontSize="220" fontWeight="700" fill="url(#accentLogoShades)">Phil</text>
        <text x="78" y="395" fontFamily={FONT} fontSize="220" fontWeight="700" fill="#f5f5f5">Freela</text>
      </g>
    </svg>
  );
}
