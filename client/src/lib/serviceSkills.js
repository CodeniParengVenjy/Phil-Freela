// The skills a freelancer can pick when posting a service (Post a Service) and
// that the offer page (Service Details) shows as a chip. One shared list, so
// the form and the page always match. The values are stored in services.skill.
export const skillOptions = [
  { value: "critical-thinker", label: "Critical Thinker" },
  { value: "web-developer", label: "Web Developer" },
  { value: "creativity", label: "Creativity" },
  { value: "video-editor", label: "Video Editor" }
];

// The words for a stored skill value ("" when the service has none).
export function skillLabel(value) {
  return skillOptions.find((s) => s.value === value)?.label || "";
}
