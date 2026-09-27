import { useState } from "react";
import { avatarUrl } from "../lib/avatar";

// A round profile picture, `size` pixels wide. With no picture (or one that
// fails to load) it shows the first letter of the name instead.
// previewUrl is for Settings: a picked picture shown before it's saved.
export default function Avatar({ path, previewUrl, name, size = 40, className = "" }) {
  const src = previewUrl || avatarUrl(path);
  // The link that failed to load, so a new picture gets tried again.
  const [failedSrc, setFailedSrc] = useState(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt={name ? `${name}'s profile picture` : "Profile picture"}
        className={`rounded-circle object-fit-cover flex-shrink-0 ${className}`}
        style={style}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  const letter = (name || "").trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className={`rounded-circle bg-role text-white fw-bold d-inline-flex align-items-center justify-content-center flex-shrink-0 ${className}`}
      style={style}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
