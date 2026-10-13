// The preview of a document's text (document previews, see
// PLAN-document-previews.md): the first 30% of it, at most 1,500 characters,
// cut at a word. A very short text still shows a little: at least 200
// characters, or half of it when it is shorter than 400.
//
// This is the same rule as the AI service's (ai-service/document_preview.py),
// which cuts every document when it is uploaded, so visitors never receive the
// hidden part. The website only needs this copy for old pasted writing, which
// is still whole in the portfolio_items table (none exist now, and the site no
// longer creates them). Keep the two the same.
const SHARE_PERCENT = 30;
const MAX_SHOWN = 1500;
const MIN_SHOWN = 200;
// Backing up to the space before a cut word only happens for words up to this long.
const LONGEST_WORD = 40;

// The invisible characters that carry the hidden watermark code (they take no
// space, so only the other characters count).
const HIDDEN = /[​-‏⁠-⁤﻿]/;
const HIDDEN_ALL = /[​-‏⁠-⁤﻿]/g;

// How many visible characters the preview holds, for a text of this length.
export function previewLength(visible) {
  return Math.min(MAX_SHOWN, Math.max(Math.floor((visible * SHARE_PERCENT) / 100), Math.min(MIN_SHOWN, Math.floor(visible / 2))));
}

// { shown, hiddenChars }: the start of the text, and how many visible
// characters were left out of it (0 when nothing needed hiding).
export function cutPreview(text) {
  const visible = text.replace(HIDDEN_ALL, "").length;
  const limit = previewLength(visible);
  if (limit >= visible) return { shown: text, hiddenChars: 0 };

  // Walk to the first visible character past the limit. Everything before it
  // stays, with the invisible characters between its letters, so a code is
  // never cut in half.
  let seen = 0;
  let cut = text.length;
  for (let index = 0; index < text.length; index += 1) {
    if (HIDDEN.test(text[index])) continue;
    if (seen === limit) {
      cut = index;
      break;
    }
    seen += 1;
  }
  let shown = text.slice(0, cut);

  // Don't end in the middle of a word: back up to the space before it.
  if (!/\s/.test(text[cut]) && !/\s/.test(shown.slice(-1))) {
    const word = shown.match(/\s\S*$/);
    if (word && word[0].length <= LONGEST_WORD) shown = shown.slice(0, word.index);
  }
  shown = shown.trimEnd();
  return { shown, hiddenChars: visible - shown.replace(HIDDEN_ALL, "").length };
}
