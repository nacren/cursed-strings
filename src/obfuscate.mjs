// Filter evasion forms of a single token. These are the shapes the moderation
// scenario (S3) uses: the word must still reach the model as itself while it no
// longer matches a plain substring filter.
//
// The letter spaced forms are the interesting ones. Dropping an invisible code
// point between every letter breaks `includes("PINEAPPLE")` while a model, or a
// person, still reads the word underneath.

import { encodeTag } from "./tags.mjs";
import { encodeVariation } from "./variation.mjs";
import { ZERO } from "./zerowidth.mjs";
import { toHomoglyphs } from "./homoglyph.mjs";

export const SOFT_HYPHEN = String.fromCodePoint(0x00ad);

export const OBFUSCATIONS = [
  "tags",
  "zerowidth",
  "variation",
  "homoglyph",
  "softhyphen",
];

/** Put `sep` between every character of `token`. */
export function letterSpace(token, sep = ZERO) {
  return [...token].join(sep);
}

/** Return `token` rewritten with one evasion technique. */
export function obfuscateToken(token, technique) {
  switch (technique) {
    case "tags":
      return encodeTag(token);
    case "zerowidth":
      return letterSpace(token, ZERO);
    case "variation":
      return encodeVariation(token);
    case "homoglyph":
      return toHomoglyphs(token);
    case "softhyphen":
      return letterSpace(token, SOFT_HYPHEN);
    default:
      throw new Error(`obfuscateToken: unknown technique "${technique}"`);
  }
}
