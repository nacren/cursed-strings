// Variation selector smuggling.
//
// There are exactly 256 variation selectors:
//   VS1 to VS16    U+FE00 to U+FE0F    bytes 0x00 to 0x0F
//   VS17 to VS256  U+E0100 to U+E01EF  bytes 0x10 to 0xFF
// So one selector encodes one byte. They carry no width of their own. Appended
// after a base character, or after each other, they are invisible to a reader
// and still present in the string a machine receives.

/** Map a byte (0 to 255) to the code point of its variation selector. */
export function byteToVS(b) {
  return b < 16 ? 0xfe00 + b : 0xe0100 + (b - 16);
}

/** Map a code point back to a byte, or null if it is not a variation selector. */
export function vsToByte(cp) {
  if (cp >= 0xfe00 && cp <= 0xfe0f) return cp - 0xfe00;
  if (cp >= 0xe0100 && cp <= 0xe01ef) return cp - 0xe0100 + 16;
  return null;
}

/** Encode a string as a run of variation selectors. */
export function encodeVariation(text) {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (const b of bytes) out += String.fromCodePoint(byteToVS(b));
  return out;
}

/** Recover a string from the variation selectors embedded in `text`. */
export function decodeVariation(text) {
  const bytes = [];
  for (const ch of text) {
    const v = vsToByte(ch.codePointAt(0));
    if (v !== null) bytes.push(v);
  }
  if (bytes.length === 0) return "";
  return new TextDecoder().decode(new Uint8Array(bytes));
}
