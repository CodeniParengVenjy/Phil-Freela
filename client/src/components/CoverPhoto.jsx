import { useState } from "react";
import { coverUrl } from "../lib/avatar";

// The wide banner at the top of a profile. With no cover (or one that fails to
// load) it shows a plain banner in the user's accent color instead.
// previewUrl is for Settings: a picked cover shown before it's saved.
// onOpen: when given (profile pages), clicking a real cover calls it, to show
// the cover bigger (components/PictureViewer.jsx).
// The height follows the screen width, so the banner stays wide but never
// gets tall on a big screen or tiny on a phone.
export default function CoverPhoto({ path, previewUrl, name, className = "", onOpen }) {
  const src = previewUrl || coverUrl(path);
  // The link that failed to load, so a new cover gets tried again.
  const [failedSrc, setFailedSrc] = useState(null);
  const style = { width: "100%", height: "clamp(110px, 20vw, 200px)" };

  if (!src || src === failedSrc) {
    return (
      <div
        className={className}
        style={{ ...style, background: "linear-gradient(135deg, var(--accent-role) 0%, var(--accent-role-2) 100%)", opacity: 0.35 }}
        aria-hidden="true"
      ></div>
    );
  }

  const image = (
    <img
      src={src}
      alt={name ? `${name}'s cover photo` : "Cover photo"}
      className={`d-block object-fit-cover ${className}`}
      style={style}
      onError={() => setFailedSrc(src)}
    />
  );
  if (!onOpen) return image;

  return (
    <button
      type="button"
      className="d-block w-100 border-0 bg-transparent p-0"
      style={{ cursor: "zoom-in" }}
      title="View cover photo"
      aria-label={name ? `View ${name}'s cover photo` : "View cover photo"}
      onClick={onOpen}
    >
      {image}
    </button>
  );
}
