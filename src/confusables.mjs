// A curated subset of the UTS #39 confusables table: code points that look
// Latin, mapped to their ASCII "skeleton". This is deliberately small and
// readable. The full table runs to thousands of rows. It covers the Cyrillic
// and Greek look alikes that matter for the homoglyph demos. The skeleton step
// is what NFKC does not do. NFKC folds compatibility characters such as
// fullwidth letters and ligatures, but leaves Cyrillic and Greek look alikes
// untouched.

export const CONFUSABLES = {
  // Cyrillic -> Latin
  "а": "a", // а
  "е": "e", // е
  "о": "o", // о
  "р": "p", // р
  "с": "c", // с
  "у": "y", // у
  "х": "x", // х
  "ѕ": "s", // ѕ
  "і": "i", // і
  "ј": "j", // ј
  "ӏ": "l", // ӏ
  "ԁ": "d", // ԁ
  "һ": "h", // һ
  "А": "A",
  "В": "B",
  "Е": "E",
  "К": "K",
  "М": "M",
  "Н": "H",
  "О": "O",
  "Р": "P",
  "С": "C",
  "Т": "T",
  "Х": "X",
  "У": "Y",
  // Greek -> Latin
  "ο": "o", // ο
  "ρ": "p", // ρ
  "α": "a", // α
  "ε": "e", // ε
  "ι": "i", // ι
  "κ": "k", // κ
  "ν": "v", // ν
  "υ": "u", // υ
  "χ": "x", // χ
  "Α": "A",
  "Β": "B",
  "Ε": "E",
  "Η": "H",
  "Ι": "I",
  "Κ": "K",
  "Μ": "M",
  "Ν": "N",
  "Ο": "O",
  "Ρ": "P",
  "Τ": "T",
  "Χ": "X",
  "Υ": "Y",
};

/** Fold confusable code points in `text` down to their ASCII skeleton. */
export function skeleton(text) {
  let out = "";
  for (const ch of text) out += CONFUSABLES[ch] ?? ch;
  return out;
}
