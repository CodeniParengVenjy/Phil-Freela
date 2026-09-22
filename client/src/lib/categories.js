// One shared list of service/job categories, used by the Post a Service,
// Browse Services, Find Jobs and Post a Project pages so they always match.
// The first four values are already stored in the database -- do not rename them.
export const categories = [
  { value: "video-editing", label: "Video Editing & Motion Graphics", icon: "bi-camera-reels-fill" },
  { value: "graphic-design", label: "Graphic Design & Poster/Logo", icon: "bi-palette-fill" },
  { value: "web-development", label: "Web Development & React Apps", icon: "bi-code-slash" },
  { value: "copywriting", label: "Copywriting & Content Creation", icon: "bi-pencil-fill" },
  { value: "mobile-development", label: "Mobile App Development", icon: "bi-phone-fill" },
  { value: "ui-ux-design", label: "UI/UX & Web Design", icon: "bi-window-sidebar" },
  { value: "digital-marketing", label: "Digital Marketing & SEO", icon: "bi-graph-up-arrow" },
  { value: "social-media", label: "Social Media Management", icon: "bi-share-fill" },
  { value: "virtual-assistant", label: "Virtual Assistant & Admin Support", icon: "bi-headset" },
  { value: "customer-support", label: "Customer Support", icon: "bi-chat-heart-fill" },
  { value: "data-entry", label: "Data Entry & Research", icon: "bi-table" },
  { value: "translation", label: "Translation & Transcription", icon: "bi-translate" },
  { value: "photography", label: "Photography & Photo Editing", icon: "bi-camera-fill" },
  { value: "audio-music", label: "Audio, Voiceover & Music", icon: "bi-mic-fill" },
  { value: "animation-3d", label: "Animation & 3D Modeling", icon: "bi-box-fill" },
  { value: "accounting", label: "Accounting & Bookkeeping", icon: "bi-calculator-fill" },
  { value: "tutoring", label: "Online Tutoring & Teaching", icon: "bi-mortarboard-fill" },
  { value: "other", label: "Other", icon: "bi-briefcase-fill" }
];

// Looks up a category by its stored value; unknown values still show something sensible.
export function getCategory(value) {
  return categories.find((c) => c.value === value) || { label: value, icon: "bi-briefcase-fill" };
}
