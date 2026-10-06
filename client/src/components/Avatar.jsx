import { useState } from "react";
import { Link } from "react-router-dom";
import { avatarUrl } from "../lib/avatar";

// A round profile picture, `size` pixels wide. With no picture (or one that
// fails to load) it shows the first letter of the name instead.
// previewUrl is for Settings: a picked picture shown before it's saved.
// to: when given, the picture is a link to that page (the person's public
// profile), so clicking a picture works like clicking the name beside it.
export default function Avatar({ path, previewUrl, name, size = 40, className = "", to }) {
  const src = previewUrl || avatarUrl(path);
  // The link that failed to load, so a new picture gets tried again.
  const [failedSrc, setFailedSrc] = useState(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };

  const letter = (name || "").trim().charAt(0).toUpperCase() || "?";
  const picture = src && src !== failedSrc ? (
    <img
      src={src}
      alt={name ? `${name}'s profile picture` : "Profile picture"}
      className={`rounded-circle object-fit-cover flex-shrink-0 ${className}`}
      style={style}
      onError={() => setFailedSrc(src)}
    />
  ) : (
    <span
      className={`rounded-circle bg-role text-white fw-bold d-inline-flex align-items-center justify-content-center flex-shrink-0 ${className}`}
      style={style}
      aria-hidden="true"
    >
      {letter}
    </span>
  );

  if (!to) return picture;

  // The link is given the picture's own size, so the layout around it stays
  // the same and only the picture is clickable (not the empty space beside it
  // on a phone). The label is for screen readers (the letter version has no
  // text of its own).
  const label = name ? `View ${name}'s profile` : "View profile";
  return (
    <Link
      to={to}
      className="d-inline-flex flex-shrink-0 rounded-circle text-decoration-none"
      style={{ width: size, height: size }}
      title={label}
      aria-label={label}
    >
      {picture}
    </Link>
  );
}
