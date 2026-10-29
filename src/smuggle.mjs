// High level offense: hide a secret instruction inside benign looking cover
// text using one of the four channels. The invisible channels (tags, zerowidth,
// variation) append an unseen payload. Homoglyph rewrites the instruction into
// look alikes that stay visible but dodge a filter.

import { encodeTag } from "./tags.mjs";
import { encodeZeroWidth } from "./zerowidth.mjs";
import { encodeVariation } from "./variation.mjs";
import { toHomoglyphs } from "./homoglyph.mjs";

export const TECHNIQUES = ["tags", "zerowidth", "variation", "homoglyph"];

/**
 * @param {string} cover   visible, benign cover text
 * @param {string} secret  the instruction to smuggle
 * @param {string} technique one of TECHNIQUES
 * @returns {string} the untrusted text as it would reach a model
 */
export function smuggle(cover, secret, technique) {
  switch (technique) {
    case "tags":
      return cover + encodeTag(secret);
    case "zerowidth":
      return cover + encodeZeroWidth(secret);
    case "variation":
      // Anchor the selectors on the last visible character so they are valid.
      return cover + encodeVariation(secret);
    case "homoglyph":
      return cover + " " + toHomoglyphs(secret);
    default:
      throw new Error(`smuggle: unknown technique "${technique}"`);
  }
}
