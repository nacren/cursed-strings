// Unicode Tags block (U+E0000 to U+E007F).
//
// U+E0020 to U+E007E are a one to one shadow of printable ASCII 0x20 to 0x7E
// ("TAG SPACE" through "TAG TILDE"). They render as nothing in almost every
// font. Some hosted models in 2024 read them straight back as the ASCII
// underneath, which made them the modern "ASCII smuggling" primitive for prompt
// injection. Local GGUF models receive them as byte fragments instead, and
// mostly cannot read them. See bench/tokens.mjs and the writeup.

export const TAG_BASE = 0xe0000;
export const TAG_MIN = 0xe0000;
export const TAG_MAX = 0xe007f;

/** Encode a printable ASCII string into invisible tag characters. */
export function encodeTag(ascii) {
  let out = "";
  for (const ch of ascii) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp > 0x7e) {
      throw new Error(
        `encodeTag: only printable ASCII (0x20-0x7E) is encodable, got U+${cp
          .toString(16)
          .toUpperCase()}`,
      );
    }
    out += String.fromCodePoint(TAG_BASE + cp);
  }
  return out;
}

/** Recover ASCII from any tag characters embedded in `text` (others ignored). */
export function decodeTag(text) {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= 0xe0020 && cp <= 0xe007e) {
      out += String.fromCodePoint(cp - TAG_BASE);
    }
  }
  return out;
}

/** True if `text` contains any character from the Tags block. */
export function hasTags(text) {
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= TAG_MIN && cp <= TAG_MAX) return true;
  }
  return false;
}
