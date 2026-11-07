import { useState } from "react";

const DISMISSED_KEY = "philfreela-desktop-notice-dismissed";

// True when a phone is showing the desktop version of the site. Chrome does
// this when "Desktop site" is ticked: it lays the page out at desktop width and
// draws it shrunk to fit the screen, so the text looks tiny and the phone
// layout never appears. The shrinking is the sure sign (the browser's zoom is
// below 1 when the page opens): a tablet or a phone in its normal layout draws
// the page at full size. (The old test went by screen size, so a small tablet
// held sideways, 600px tall, got this bar wrongly; 2026-11-07.)
function phoneShowingDesktopSize() {
  if (!(navigator.maxTouchPoints > 0) || window.innerWidth < 768) return false;
  const zoom = window.visualViewport?.scale;
  if (typeof zoom === "number") return zoom < 0.9;
  // A browser without visualViewport: the old screen-size test.
  return Math.min(window.screen.width, window.screen.height) <= 600;
}

function alreadyDismissed() {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

// A bar at the bottom of the screen for exactly that case. It stays out of the
// way everywhere else (phones in their normal layout, tablets, computers).
export default function DesktopSiteNotice() {
  const [shown, setShown] = useState(() => phoneShowingDesktopSize() && !alreadyDismissed());
  // The page is drawn shrunk in this case, so the bar's text is made bigger by
  // the same amount to stay readable.
  const [zoom] = useState(() => Math.min(1, window.visualViewport?.scale || 1));

  if (!shown) return null;

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Without storage the bar just comes back on the next page load.
    }
    setShown(false);
  }

  return (
    <div
      role="status"
      className="position-fixed bottom-0 start-0 end-0 d-flex align-items-center gap-3 bg-dark text-white border-top border-warning p-3"
      style={{ zIndex: 3000, fontSize: `${Math.round(15 / zoom)}px` }}
    >
      <span className="flex-grow-1">
        You're seeing PhilFreela at desktop size on your phone. For the phone layout, tap the &#8942; menu in Chrome, untick <strong>Desktop site</strong>, then reload.
      </span>
      <button type="button" className="btn btn-warning fw-bold rounded-pill flex-shrink-0" style={{ fontSize: "inherit" }} onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
