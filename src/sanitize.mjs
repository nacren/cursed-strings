// The exorcist. Normalize untrusted text in three steps. This does not make
// embedded instructions trustworthy:
//   1. strip every code point that renders as nothing (or as a blank) and so
//      can carry data a reader never sees,
//   2. apply Unicode NFKC normalization, which folds compatibility look alikes
//      such as fullwidth letters and ligatures,
//   3. fold the remaining confusables down to their ASCII skeleton.
//
// Steps 2 and 3 are both required and neither subsumes the other. NFKC will not
// turn Cyrillic "о" into Latin "o". The skeleton step will.
//
// The honest cost: step 1 also removes legitimate joiners. Emoji ZWJ sequences
// flatten into their parts, and Persian or Hindi text loses the ZWNJ it needs.
// Pass { keepEmoji: true } to keep joiners that sit between two emoji, at the
// price of a one bit channel per emoji. There is no safe mode for ZWNJ inside
// words. The writeup discusses the trade off.

import { skeleton } from "./confusables.mjs";

// General category Cf (format) covers the classic set: soft hyphen, zero width
// space, joiner and non-joiner, word joiner, bidi controls, the Tags block,
// interlinear annotation marks, and a few script specific controls. Unassigned
// (Cn), private use (Co) and lone surrogate (Cs) code points render as nothing
// or as tofu, and have no business in text headed for a model.
const FORMAT_OR_GARBAGE = /[\p{Cf}\p{Cn}\p{Co}\p{Cs}]/u;

// Ranges Cf misses. Variation selectors are nonspacing marks. The Hangul
// fillers and the Braille blank are letters and symbols that draw as a blank.
const EXTRA = [
  [0xe0000, 0xe007f], // the whole Tags block, assigned or not
  [0xfe00, 0xfe0f], // variation selectors 1 to 16
  [0xe0100, 0xe01ef], // variation selectors 17 to 256
  [0x180b, 0x180d], // Mongolian free variation selectors
  [0x034f, 0x034f], // combining grapheme joiner
  [0x115f, 0x1160], // Hangul choseong and jungseong fillers
  [0x3164, 0x3164], // Hangul filler
  [0xffa0, 0xffa0], // halfwidth Hangul filler
  [0x2800, 0x2800], // Braille pattern blank
  [0x17b4, 0x17b5], // Khmer inherent vowels, which draw as nothing
];

/** True if the code point should be removed from untrusted text. */
export function isStrippable(cp) {
  for (const [lo, hi] of EXTRA) if (cp >= lo && cp <= hi) return true;
  return FORMAT_OR_GARBAGE.test(String.fromCodePoint(cp));
}

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
const ZWJ = 0x200d;
const VS16 = 0xfe0f;
const isSkinTone = (cp) => cp >= 0x1f3fb && cp <= 0x1f3ff;

// Is the strippable code point at `i` glue inside an emoji sequence? A ZWJ
// counts when the nearest visible neighbours on both sides are pictographs. A
// VS16 counts when it directly follows a pictograph.
function isEmojiGlue(chars, i) {
  const cp = chars[i].codePointAt(0);
  if (cp === VS16) {
    return i > 0 && PICTOGRAPHIC.test(chars[i - 1]);
  }
  if (cp !== ZWJ) return false;
  let p = i - 1;
  while (p >= 0) {
    const pc = chars[p].codePointAt(0);
    if (pc === VS16 || isSkinTone(pc)) p--;
    else break;
  }
  const next = chars[i + 1];
  return p >= 0 && PICTOGRAPHIC.test(chars[p]) && !!next && PICTOGRAPHIC.test(next);
}

/** Step 1 on its own: remove invisible and garbage code points. */
export function stripInvisible(text, { keepEmoji = false } = {}) {
  const chars = [...text];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    if (!isStrippable(chars[i].codePointAt(0))) {
      out += chars[i];
    } else if (keepEmoji && isEmojiGlue(chars, i)) {
      out += chars[i];
    }
  }
  return out;
}

/** All three steps. The result is what a filter, a log and a model should all see. */
export function sanitize(text, { keepEmoji = false } = {}) {
  return skeleton(stripInvisible(text, { keepEmoji }).normalize("NFKC"));
}
