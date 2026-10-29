// The repo eats its own cooking. Every source, test and doc file is run
// through the detector. Code must be free of invisible code points and mixed
// script words. Prose may show a look alike as an example, but it still must
// carry no invisible bytes.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detect } from "../src/detect.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CODE_DIRS = ["src", "bin", "bench", "demos", "test"];
const PROSE = ["README.md", "docs/writeup.md", "package.json"];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "results" || e.name === "node_modules") continue;
      yield* walk(p);
    } else if (/\.(mjs|cjs|js|json|md)$/.test(e.name)) {
      yield p;
    }
  }
}

test("code carries no invisible bytes and no mixed script words", () => {
  for (const dir of CODE_DIRS) {
    for (const f of walk(path.join(root, dir))) {
      const rel = path.relative(root, f);
      const d = detect(fs.readFileSync(f, "utf8"));
      assert.equal(d.invisible.count, 0, `${rel}: ${d.invisible.count} invisible code points`);
      assert.equal(d.suspicious, false, `${rel}: ${d.reasons.join("; ")}`);
    }
  }
});

test("prose carries no invisible bytes", () => {
  for (const rel of PROSE) {
    const f = path.join(root, rel);
    if (!fs.existsSync(f)) continue;
    const d = detect(fs.readFileSync(f, "utf8"));
    assert.equal(d.invisible.count, 0, `${rel}: ${d.invisible.count} invisible code points`);
    assert.equal(d.channels.tags.count + d.channels.bidi.count, 0, `${rel}: tags or bidi`);
  }
});
