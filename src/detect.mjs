// Detection side of the exorcist: scan text for the invisible channels, decode
// any hidden payload, and report the readable tricks too (invisible code points
// inside words, words that mix scripts, look alike letters).
//
// "suspicious" is deliberately conservative so it does not fire on ordinary
// text. A lone emoji variation selector, a single joiner, a Russian sentence,
// or one soft hyphen in a long word is not enough. It fires on the shapes an
// attacker needs: a channel that decodes to text, a Tags block or bidi control
// anywhere, invisibles sandwiched between Latin letters, or Cyrillic and Greek
// letters mixed into a Latin word.

import { decodeTag } from "./tags.mjs";
import { decodeZeroWidth } from "./zerowidth.mjs";
import { decodeVariation } from "./variation.mjs";
import { skeleton, CONFUSABLES } from "./confusables.mjs";
import { isStrippable } from "./sanitize.mjs";

const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const GREEK = /\p{Script=Greek}/u;
const LETTER = /\p{L}/u;
const WORDISH = /[\p{L}\p{M}\p{N}]/u;
const LATIN_ALNUM = /[\p{Script=Latin}\p{Nd}]/u;

const KINDS = [
  [0x00ad, 0x00ad, "soft hyphen"],
  [0x034f, 0x034f, "combining grapheme joiner"],
  [0x061c, 0x061c, "Arabic letter mark"],
  [0x115f, 0x1160, "Hangul filler"],
  [0x17b4, 0x17b5, "Khmer inherent vowel"],
  [0x180b, 0x180d, "Mongolian free variation selector"],
  [0x180e, 0x180e, "Mongolian vowel separator"],
  [0x200b, 0x200b, "zero width space"],
  [0x200c, 0x200c, "zero width non-joiner"],
  [0x200d, 0x200d, "zero width joiner"],
  [0x200e, 0x200f, "bidi mark"],
  [0x202a, 0x202e, "bidi embedding or override"],
  [0x2060, 0x2060, "word joiner"],
  [0x2061, 0x2064, "invisible math operator"],
  [0x2066, 0x2069, "bidi isolate"],
  [0x206a, 0x206f, "deprecated format control"],
  [0x2800, 0x2800, "Braille pattern blank"],
  [0x3164, 0x3164, "Hangul filler"],
  [0xfe00, 0xfe0f, "variation selector"],
  [0xfeff, 0xfeff, "zero width no-break space"],
  [0xffa0, 0xffa0, "halfwidth Hangul filler"],
  [0xfff9, 0xfffb, "interlinear annotation"],
  [0xe0001, 0xe0001, "language tag"],
  [0xe0000, 0xe007f, "Tags block"],
  [0xe0100, 0xe01ef, "variation selector supplement"],
];

/** A short name for the kind of invisible a code point is. */
export function kindOf(cp) {
  for (const [lo, hi, name] of KINDS) if (cp >= lo && cp <= hi) return name;
  const ch = String.fromCodePoint(cp);
  if (/\p{Cf}/u.test(ch)) return "format character";
  if (/\p{Co}/u.test(ch)) return "private use";
  if (/\p{Cn}/u.test(ch)) return "unassigned";
  if (/\p{Cs}/u.test(ch)) return "lone surrogate";
  return "visible";
}

/** "U+200B zero width space" style description. */
export function describeCodePoint(cp) {
  const hex = "U+" + cp.toString(16).toUpperCase().padStart(4, "0");
  return `${hex} ${kindOf(cp)}`;
}

function looksLikePayload(s) {
  const chars = [...s];
  if (chars.length < 3) return false;
  const printable = chars.filter((c) => {
    const cp = c.codePointAt(0);
    return cp >= 0x20 && cp < 0x7f;
  }).length;
  return printable >= Math.ceil(chars.length * 0.8);
}

export function detect(text) {
  const chars = [...text];
  const cps = chars.map((c) => c.codePointAt(0));
  const count = (pred) => cps.filter(pred).length;

  const tags = count((cp) => cp >= 0xe0000 && cp <= 0xe007f);
  const zw = count(
    (cp) =>
      (cp >= 0x200b && cp <= 0x200f) ||
      (cp >= 0x2060 && cp <= 0x2064) ||
      cp === 0xfeff,
  );
  const bidi = count(
    (cp) => (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069),
  );
  const vs = count(
    (cp) =>
      (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef),
  );

  const hidden = cps.map(isStrippable);
  const hiddenTotal = hidden.filter(Boolean).length;

  // Runs of consecutive invisible code points, by code point offset.
  const runs = [];
  const byKind = {};
  for (let i = 0; i < cps.length; i++) {
    if (!hidden[i]) continue;
    const k = kindOf(cps[i]);
    byKind[k] = (byKind[k] || 0) + 1;
    if (runs.length && runs[runs.length - 1].end === i) {
      runs[runs.length - 1].end = i + 1;
      runs[runs.length - 1].length++;
    } else {
      runs.push({ start: i, end: i + 1, length: 1 });
    }
  }

  const tagPayload = decodeTag(text);
  const zwPayload = zw >= 8 ? decodeZeroWidth(text) : "";
  const vsPayload = vs >= 2 ? decodeVariation(text) : "";

  // Word level signals. A word is a maximal run of letters, marks, digits and
  // invisibles. Invisibles between two Latin letters or digits are the letter
  // spacing trick. Scripts are checked on the visible letters only.
  const intraWord = { count: 0, samples: [] };
  const mixedScript = { count: 0, words: [] };
  const lookalikeWords = { count: 0, words: [] };
  let intraWordFires = false;
  let latinLetters = 0;
  let otherLetters = 0;
  for (let i = 0; i < chars.length; i++) {
    if (hidden[i] || !LETTER.test(chars[i])) continue;
    if (LATIN.test(chars[i])) latinLetters++;
    else if (CYRILLIC.test(chars[i]) || GREEK.test(chars[i])) otherLetters++;
  }
  const isWordChar = (k) => hidden[k] || WORDISH.test(chars[k]);
  let i = 0;
  while (i < chars.length) {
    if (!isWordChar(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < chars.length && isWordChar(j)) j++;
    let visible = "";
    let softHyphens = 0;
    let others = 0;
    for (let k = i; k < j; k++) {
      if (!hidden[k]) {
        visible += chars[k];
        continue;
      }
      let p = k - 1;
      while (p >= i && hidden[p]) p--;
      let n = k + 1;
      while (n < j && hidden[n]) n++;
      const sandwiched =
        p >= i && n < j && LATIN_ALNUM.test(chars[p]) && LATIN_ALNUM.test(chars[n]);
      if (!sandwiched) continue;
      if (cps[k] === 0x00ad) softHyphens++;
      else others++;
    }
    if (softHyphens || others) {
      intraWord.count += softHyphens + others;
      if (intraWord.samples.length < 5) intraWord.samples.push(visible);
      // One soft hyphen is how a word processor hints a line break. Two in one
      // word, or any other invisible, is the evasion shape.
      if (others > 0 || softHyphens >= 2) intraWordFires = true;
    }
    const hasLatin = LATIN.test(visible);
    const hasCyr = CYRILLIC.test(visible);
    const hasGreek = GREEK.test(visible);
    if ((hasLatin && (hasCyr || hasGreek)) || (hasCyr && hasGreek)) {
      mixedScript.count++;
      if (mixedScript.words.length < 10) mixedScript.words.push(visible);
    } else if ((hasCyr || hasGreek) && !hasLatin) {
      // A whole word made only of letters that have a Latin look alike. In a
      // Latin text that is "admin" spelled with Cyrillic letters, not Russian.
      const letters = [...visible].filter((c) => LETTER.test(c));
      if (letters.length >= 2 && letters.every((c) => c in CONFUSABLES)) {
        lookalikeWords.count++;
        if (lookalikeWords.words.length < 10) lookalikeWords.words.push(visible);
      }
    }
    i = j;
  }
  const latinDominant = latinLetters > otherLetters;

  const skel = skeleton(text);
  let confusables = 0;
  {
    const a = chars;
    const b = [...skel];
    for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) confusables++;
  }

  const reasons = [];
  if (tags > 0) reasons.push(`Unicode Tags block characters present (${tags})`);
  if (bidi > 0) reasons.push(`bidi controls present (${bidi})`);
  if (looksLikePayload(zwPayload)) reasons.push("zero width run decodes to text");
  if (looksLikePayload(vsPayload))
    reasons.push("variation selector run decodes to text");
  if (intraWordFires)
    reasons.push(`invisible code points inside words (${intraWord.count})`);
  if (mixedScript.count)
    reasons.push(`words mixing Latin with Cyrillic or Greek (${mixedScript.count})`);
  if (lookalikeWords.count && latinDominant)
    reasons.push(`whole word look alikes in Latin text (${lookalikeWords.count})`);

  return {
    suspicious: reasons.length > 0,
    reasons,
    channels: {
      tags: { count: tags, payload: tagPayload },
      zeroWidth: { count: zw, payload: zwPayload },
      variation: { count: vs, payload: vsPayload },
      bidi: { count: bidi },
      other: { count: hiddenTotal - tags - zw - bidi - vs },
    },
    invisible: { count: hiddenTotal, runs, byKind },
    intraWord,
    mixedScript,
    lookalikeWords: { ...lookalikeWords, latinDominant },
    confusables: { count: confusables, skeleton: skel },
  };
}

/** Convenience: return the first non-empty decoded payload, if any. */
export function decodeHidden(text) {
  const d = detect(text);
  return (
    d.channels.tags.payload ||
    d.channels.zeroWidth.payload ||
    d.channels.variation.payload ||
    ""
  );
}
