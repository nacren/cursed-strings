// Check published accounting without calling Ollama or rewriting evidence.
// Legacy verdicts are retained except for explicitly rejudged S1 cells.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESULTS_DIR } from "./paths.mjs";
import { SCENARIOS } from "./scenarios.mjs";

function readJsonl(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).flatMap((line, i) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      throw new Error(`${file}:${i + 1}: invalid JSON`);
    }
  });
}

export function verifyResults(dir = RESULTS_DIR) {
  const progress = readJsonl(path.join(dir, "progress.jsonl"));
  assert.ok(progress.length, "No published cells found");
  const latest = new Map(progress.map((r) => [r.key, r]));
  const cells = [...latest.values()].filter((r) => !r.skipped);
  const byCell = new Map();
  let records = 0;
  for (const model of new Set(cells.map((r) => r.model))) {
    const name = model.replace(/[^a-z0-9._-]/gi, "_") + ".jsonl";
    for (const r of readJsonl(path.join(dir, "transcripts", name))) {
      records++;
      assert.equal(typeof r.defense, "boolean", `${name}: invalid defense`);
      assert.ok(Number.isInteger(r.trial) && r.trial >= 0, `${name}: invalid trial`);
      const key = `${model}|${r.scenario}|${r.arm}|${r.defense ? "exorcist" : "none"}`;
      assert.ok(latest.has(key) && !latest.get(key).skipped, `${key}: no scored cell`);
      if (!byCell.has(key)) byCell.set(key, new Map());
      byCell.get(key).set(r.trial, r);
    }
  }

  let trials = 0;
  let errors = 0;
  let rejudged = 0;
  const csv = ["model,scenario,arm,defense,trials,success,asr,errors"];
  for (const cell of cells) {
    const key = `${cell.model}|${cell.scenario}|${cell.arm}|${cell.defense}`;
    assert.equal(cell.key, key, "Cell key disagrees with its fields");
    assert.ok(Number.isInteger(cell.trials) && cell.trials > 0, `${key}: invalid trials`);
    const rows = byCell.get(key);
    assert.equal(rows?.size, cell.trials, `${key}: missing or extra trials`);
    if (cell.rejudged) {
      assert.equal(cell.scenario, "summarizer", `${key}: unsupported rejudging`);
      rejudged++;
    }
    let successes = 0;
    let failures = 0;
    for (let t = 0; t < cell.trials; t++) {
      const r = rows.get(t);
      assert.ok(r, `${key}: missing trial ${t}`);
      if (r.error) {
        failures++;
        continue;
      }
      assert.equal(typeof r.success, "boolean", `${key}: missing saved verdict`);
      if (cell.rejudged) assert.equal(typeof r.content, "string", `${key}: missing answer`);
      const success = cell.rejudged
        ? SCENARIOS.summarizer.judge(cell.arm, { content: r.content })
        : r.success;
      if (success) successes++;
    }
    assert.equal(successes, cell.success, `${key}: success count differs`);
    assert.equal(failures, cell.errors, `${key}: error count differs`);
    trials += cell.trials;
    errors += failures;
    csv.push([
      cell.model, cell.scenario, cell.arm, cell.defense,
      cell.trials, cell.success, (cell.success / cell.trials).toFixed(3), cell.errors,
    ].join(","));
  }
  const savedCsv = fs.readFileSync(path.join(dir, "results.csv"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(savedCsv, csv.join("\n") + "\n", "CSV differs from the verified cell scores");
  return { cells: cells.length, skipped: latest.size - cells.length, records, trials, errors, rejudged };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = verifyResults();
    console.log(`Verified ${r.cells} cells, ${r.trials} current trials, and ${r.errors} error(s).`);
    console.log(`${r.records} saved records include superseded trials. ${r.skipped} scenarios skipped.`);
    console.log(`${r.rejudged} S1 cells use the corrected judge. Other cells use saved verdicts.`);
    console.log("CSV matches. See bench/results/README.md for the limits of this check.");
  } catch (e) {
    console.error(`Evidence check failed: ${e.message}`);
    process.exitCode = 1;
  }
}
