// The "Original" badge on portfolio projects and services (watermarking step
// 10): every file passed the AI copy check and carries PhilFreela's hidden
// watermark (see isOriginalWork in lib/slides.js). It can only speak for
// PhilFreela, so it says "here".
export const ORIGINAL_EXPLANATION =
  "Checked by PhilFreela's AI: not a copy of other freelancers' work here (Vision Transformer), and protected with an invisible watermark (HiDDeN).";

// Bright green on a dark green pill, readable on photos and dark cards.
const badgeStyle = { background: "rgba(5, 46, 22, 0.9)", color: "#4ade80", border: "1px solid rgba(74, 222, 128, 0.45)" };

export default function OriginalBadge({ className = "" }) {
  return (
    <span
      className={`badge rounded-pill fw-semibold ${className}`}
      style={badgeStyle}
      title={ORIGINAL_EXPLANATION}
      aria-label={`Original work. ${ORIGINAL_EXPLANATION}`}
    >
      <i className="bi bi-shield-check me-1"></i>Original
    </span>
  );
}
