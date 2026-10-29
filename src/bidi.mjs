// Bidirectional control characters, the "Trojan Source" family. These reorder
// how text is displayed without changing its logical byte order, so what a
// human reviewer reads can differ from what the machine receives. Included
// mostly as an aside and as something the exorcist must strip. Built with
// fromCodePoint so the source carries no invisible bytes of its own.

export const BIDI = {
  LRE: String.fromCodePoint(0x202a),
  RLE: String.fromCodePoint(0x202b),
  PDF: String.fromCodePoint(0x202c),
  LRO: String.fromCodePoint(0x202d),
  RLO: String.fromCodePoint(0x202e),
  LRI: String.fromCodePoint(0x2066),
  RLI: String.fromCodePoint(0x2067),
  FSI: String.fromCodePoint(0x2068),
  PDI: String.fromCodePoint(0x2069),
};

export const BIDI_CHARS = new Set(Object.values(BIDI));

/** Wrap text in a right-to-left override so it renders reversed. */
export function bidiWrap(text) {
  return BIDI.RLO + text + BIDI.PDF;
}
