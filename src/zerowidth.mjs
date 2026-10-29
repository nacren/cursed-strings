// Zero-width binary encoding.
//
// Each UTF-8 byte of the payload becomes eight zero-width code points:
//   U+200B ZERO WIDTH SPACE      -> bit 0
//   U+200C ZERO WIDTH NON-JOINER -> bit 1
// The result is invisible, survives copy and paste, and still reaches the
// model. The decoder is defensive and ignores any other characters.
//
// Code points are built with fromCodePoint so the source carries no invisible
// bytes of its own.

export const ZERO = String.fromCodePoint(0x200b); // bit 0
export const ONE = String.fromCodePoint(0x200c); // bit 1

/** Encode a string as a run of zero-width characters. */
export function encodeZeroWidth(text) {
  const bytes = new TextEncoder().encode(text);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (const bit of bits) out += bit === "0" ? ZERO : ONE;
  return out;
}

/** Recover a string from the zero-width bits embedded in `text`. */
export function decodeZeroWidth(text) {
  let bits = "";
  for (const ch of text) {
    if (ch === ZERO) bits += "0";
    else if (ch === ONE) bits += "1";
  }
  const nbytes = Math.floor(bits.length / 8);
  if (nbytes === 0) return "";
  const arr = new Uint8Array(nbytes);
  for (let i = 0; i < nbytes; i++) {
    arr[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return new TextDecoder().decode(arr);
}
