// Report generation. Turns results/progress.jsonl into results.md and
// results.csv. Run it on its own to rebuild the reports without Ollama:
//   node bench/report.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIOS } from "./scenarios.mjs";
import { TECHNIQUES, TEMPERATURE, SEED_BASE } from "./config.mjs";

import { RESULTS_DIR } from "./paths.mjs";
export { RESULTS_DIR };
export const PROGRESS = path.join(RESULTS_DIR, "progress.jsonl");
export const ARMS = ["control", "baseline", ...TECHNIQUES];

/** Read progress.jsonl into a Map keyed by cell key. Malformed lines are skipped. */
export function loadProgress() {
  const done = new Map();
  if (!fs.existsSync(PROGRESS)) return done;
  for (const line of fs.readFileSync(PROGRESS, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      done.set(rec.key, rec);
    } catch {
      // a half written line from an interrupted run
    }
  }
  return done;
}

// A trailing * marks a cell rescored from its transcripts after a judge fix.
const pct = (r) =>
  r && r.trials
    ? Math.round((100 * r.success) / r.trials) + "%" + (r.rejudged ? "*" : "")
    : "n/a";

function glanceCell(none, exo, arm) {
  if (arm === "control" || arm === "baseline") return pct(none);
  return `${pct(none)} / ${pct(exo)}`;
}

export function writeReports(done) {
  const all = [...done.values()];
  const rows = all.filter((r) => !r.skipped);
  const models = [...new Set(all.map((r) => r.model))];
  const scenarios = Object.values(SCENARIOS);

  // CSV, one line per cell.
  const csv = ["model,scenario,arm,defense,trials,success,asr,errors"];
  for (const r of rows) {
    csv.push(
      [
        r.model,
        r.scenario,
        r.arm,
        r.defense,
        r.trials,
        r.success,
        (r.success / r.trials).toFixed(3),
        r.errors,
      ].join(","),
    );
  }
  fs.writeFileSync(path.join(RESULTS_DIR, "results.csv"), csv.join("\n") + "\n");

  const find = (model, scenario, arm, defense) =>
    rows.find(
      (r) =>
        r.model === model &&
        r.scenario === scenario &&
        r.arm === arm &&
        r.defense === defense,
    );
  const skippedNote = (model, scenario) =>
    all.find((r) => r.skipped && r.model === model && r.scenario === scenario);

  const trialsSeen = [...new Set(rows.map((r) => r.trials))].sort((a, b) => a - b);
  const temps = [...new Set(rows.map((r) => r.temperature ?? TEMPERATURE))];

  const md = [];
  md.push("# Cursed Strings benchmark results");
  md.push("");
  md.push(
    `Trials per cell: ${trialsSeen.join(" or ") || "n/a"}. ` +
      `Temperature ${temps.join(" or ")}. Seeds start at ${SEED_BASE}.`,
  );
  md.push("");
  md.push(
    "ASR is the attack success rate, the share of trials the judge scored as a " +
      "successful attack. In the glance tables each technique cell reads: without " +
      "defense / with the exorcist in front. Control and baseline arms run " +
      "undefended only. A model marked (thinking) ran with reasoning enabled. " +
      "A cell marked * was rescored from its saved transcripts after a judge fix " +
      "(see bench/rejudge.mjs).",
  );

  md.push("");
  md.push("## At a glance");
  for (const scenario of scenarios) {
    const present = models.filter((m) =>
      rows.some((r) => r.model === m && r.scenario === scenario.id),
    );
    if (!present.length) continue;
    md.push("");
    md.push(`### ${scenario.name}`);
    md.push("");
    md.push("| arm | " + present.join(" | ") + " |");
    md.push("|---|" + "---|".repeat(present.length));
    for (const arm of ARMS) {
      const cells = present.map((m) =>
        glanceCell(
          find(m, scenario.id, arm, "none"),
          find(m, scenario.id, arm, "exorcist"),
          arm,
        ),
      );
      if (cells.every((c) => c === "n/a" || c === "n/a / n/a")) continue;
      md.push(`| ${arm} | ${cells.join(" | ")} |`);
    }
  }

  for (const model of models) {
    md.push("");
    md.push(`## ${model}`);
    for (const scenario of scenarios) {
      const rs = rows.filter(
        (r) => r.model === model && r.scenario === scenario.id,
      );
      const note = skippedNote(model, scenario.id);
      if (!rs.length && !note) continue;
      md.push("");
      md.push(`### ${scenario.name}`);
      md.push("");
      if (!rs.length) {
        md.push(`Not run: ${note.skipped}.`);
        continue;
      }
      md.push("| arm | ASR (no defense) | ASR (exorcist) | errors |");
      md.push("|---|---|---|---|");
      for (const arm of ARMS) {
        const none = find(model, scenario.id, arm, "none");
        const exo = find(model, scenario.id, arm, "exorcist");
        if (!none && !exo) continue;
        md.push(
          `| ${arm} | ${pct(none)} | ${exo ? pct(exo) : "n/a"} | ${
            (none?.errors || 0) + (exo?.errors || 0)
          } |`,
        );
      }
    }
  }
  fs.writeFileSync(path.join(RESULTS_DIR, "results.md"), md.join("\n") + "\n");
}

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const done = loadProgress();
  if (!done.size) {
    console.log(`No progress found at ${PROGRESS}. Run the benchmark first.`);
    process.exit(1);
  }
  writeReports(done);
  console.log(`Rebuilt results.md and results.csv from ${done.size} cells.`);
}
