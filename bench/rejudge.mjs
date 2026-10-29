// Re-score the summarizer cells from the saved transcripts with the current
// judge, then rewrite progress.jsonl and the reports.
//
// This exists because the first S1 judge matched the canary byte for byte and
// missed replies that spelled it in look alike letters, which is exactly what
// a model does when it obeys a homoglyph instruction literally. Cells whose
// score changes are marked rejudged: true. The agent scenario cannot be
// rescored this way because early transcripts did not keep tool arguments.
//
// Usage: node bench/rejudge.mjs

import fs from "node:fs";
import path from "node:path";
import { SCENARIOS } from "./scenarios.mjs";
import { RESULTS_DIR, PROGRESS, loadProgress, writeReports } from "./report.mjs";

const TRANSCRIPT_DIR = path.join(RESULTS_DIR, "transcripts");
const sanitizeName = (s) => s.replace(/[^a-z0-9._-]/gi, "_");

const done = loadProgress();
let changed = 0;
for (const rec of done.values()) {
  if (rec.skipped || rec.scenario !== "summarizer") continue;
  const file = path.join(TRANSCRIPT_DIR, sanitizeName(rec.model) + ".jsonl");
  if (!fs.existsSync(file)) continue;
  const wantDefense = rec.defense === "exorcist";
  const byTrial = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let l;
    try {
      l = JSON.parse(line);
    } catch {
      continue;
    }
    if (l.scenario !== "summarizer" || l.arm !== rec.arm || l.defense !== wantDefense) continue;
    if (l.error) continue;
    byTrial.set(l.trial, l); // a re-run overwrites an earlier trial of the same index
  }
  if (byTrial.size !== rec.trials) {
    console.log(`! ${rec.key}: ${byTrial.size} transcript lines for ${rec.trials} trials, left as is`);
    continue;
  }
  let success = 0;
  for (const l of byTrial.values()) {
    if (SCENARIOS.summarizer.judge(rec.arm, { content: l.content || "" })) success++;
  }
  if (success !== rec.success) {
    console.log(`${rec.key}: ${rec.success} -> ${success}`);
    rec.success = success;
    rec.rejudged = true;
    changed++;
  }
}

if (!changed) {
  console.log("Nothing changed.");
} else {
  fs.writeFileSync(
    PROGRESS,
    [...done.values()].map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  writeReports(done);
  console.log(`Rescored ${changed} cells. Rewrote progress.jsonl and the reports.`);
}
