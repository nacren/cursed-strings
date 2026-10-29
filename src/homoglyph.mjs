// Homoglyph substitution: replace Latin letters with visually identical
// Cyrillic or Greek code points. Unlike the invisible channels, the result is
// fully visible to a person. It just is not the bytes a naive keyword or regex
// filter is looking for, while a model still reads it as the intended word.

import { CONFUSABLES, skeleton } from "./confusables.mjs";

// Reverse the confusables table: ASCII letter to one look alike code point.
const REVERSE = {};
for (const [conf, asc] of Object.entries(CONFUSABLES)) {
  if (!(asc in REVERSE)) REVERSE[asc] = conf;
}

/** Replace each Latin character that has a look alike with that look alike. */
export function toHomoglyphs(text) {
  let out = "";
  for (const ch of text) out += REVERSE[ch] ?? ch;
  return out;
}

export { skeleton };
