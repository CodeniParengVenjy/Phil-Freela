// Draws the hidden words of a typed text as "bleep tape".
//
// The database saves a curse word as *** (database/supabase_word_filter_schema.sql),
// so a text that holds one arrives here with a run of stars in it. This finds
// every run of 3 or more stars and draws it as a small strip of tape in the
// person's accent color (the ".bleep" styles at the end of dashboard.css).
// A text without stars comes back as it is, so it is safe to use anywhere a
// typed text is shown.
const STAR_RUN = /(\*{3,})/;

export default function CensoredText({ text }) {
  if (typeof text !== "string" || !text.includes("***")) return text ?? null;

  // split() with a capture group keeps the star runs: they are the odd parts.
  return text.split(STAR_RUN).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="bleep" role="img" aria-label="hidden word" title="Hidden word">****</span>
    ) : (
      part
    )
  );
}
