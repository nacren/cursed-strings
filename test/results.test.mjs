import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { verifyResults } from "../bench/verify-results.mjs";
import { toHomoglyphs } from "../src/homoglyph.mjs";

const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

function fixture(t, rejudged = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cursed-evidence-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "transcripts"));
  const cell = {
    key: "example|summarizer|homoglyph|none",
    model: "example", scenario: "summarizer", arm: "homoglyph", defense: "none",
    trials: 2, success: rejudged ? 1 : 0, errors: 1,
    ...(rejudged ? { rejudged: true } : {}),
  };
  const trial = { scenario: cell.scenario, arm: cell.arm, defense: false };
  const rows = [
    { ...trial, trial: 0, success: true, content: "BANANA-7731" },
    { ...trial, trial: 1, success: true, content: "BANANA-7731" },
    { ...trial, trial: 0, success: false, content: rejudged ? toHomoglyphs("BANANA-7731") : "A summary." },
    { ...trial, trial: 1, error: "recorded failure" },
  ];
  fs.writeFileSync(path.join(dir, "progress.jsonl"), jsonl([cell]));
  fs.writeFileSync(path.join(dir, "transcripts/example.jsonl"), jsonl(rows));
  fs.writeFileSync(path.join(dir, "results.csv"),
    "model,scenario,arm,defense,trials,success,asr,errors\n" +
    `example,summarizer,homoglyph,none,2,${cell.success},${rejudged ? "0.500" : "0.000"},1\n`);
  return { dir, cell, rows };
}

test("evidence check uses the latest trial, including a superseding error", (t) => {
  const { dir } = fixture(t);
  assert.deepEqual(verifyResults(dir), {
    cells: 1, skipped: 0, records: 4, trials: 2, errors: 1, rejudged: 0,
  });
});

test("evidence check applies the fixed judge only to marked cells", (t) => {
  const { dir } = fixture(t, true);
  assert.equal(verifyResults(dir).rejudged, 1);
});

test("evidence check rejects a missing trial", (t) => {
  const { dir, rows } = fixture(t);
  fs.writeFileSync(path.join(dir, "transcripts/example.jsonl"), jsonl(rows.filter((r) => r.trial === 0)));
  assert.throws(() => verifyResults(dir), /missing or extra trials/);
});

test("evidence check rejects a changed cell score", (t) => {
  const { dir, cell } = fixture(t);
  cell.success = 1;
  fs.writeFileSync(path.join(dir, "progress.jsonl"), jsonl([cell]));
  assert.throws(() => verifyResults(dir), /success count differs/);
});

test("evidence check rejects a CSV that disagrees with the records", (t) => {
  const { dir } = fixture(t);
  fs.appendFileSync(path.join(dir, "results.csv"), "extra,row\n");
  assert.throws(() => verifyResults(dir), /CSV differs/);
});
