import { test } from "node:test";
import assert from "node:assert/strict";
import { obfuscateToken, OBFUSCATIONS, letterSpace, SOFT_HYPHEN } from "../src/obfuscate.mjs";
import { skeleton } from "../src/confusables.mjs";
import { ZERO } from "../src/zerowidth.mjs";

const blocked = "PINEAPPLE";

test("every evasion form dodges a naive substring filter", () => {
  for (const tech of OBFUSCATIONS) {
    const shown = obfuscateToken(blocked, tech);
    assert.notEqual(shown, blocked, tech);
    assert.equal(shown.toUpperCase().includes(blocked), false, tech);
  }
});

test("letter spacing keeps every visible letter in order", () => {
  for (const sep of [ZERO, SOFT_HYPHEN]) {
    const spaced = letterSpace(blocked, sep);
    assert.equal([...spaced].filter((c) => c !== sep).join(""), blocked);
    assert.equal([...spaced].filter((c) => c === sep).length, blocked.length - 1);
  }
});

test("the homoglyph form still reads as the word after skeletonizing", () => {
  assert.equal(skeleton(obfuscateToken(blocked, "homoglyph")), blocked);
});

test("unknown technique throws", () => {
  assert.throws(() => obfuscateToken(blocked, "nope"));
});
