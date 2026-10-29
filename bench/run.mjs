// Benchmark runner. Walks the matrix of (model x scenario x arm x defense),
// runs N_TRIALS per cell against a local Ollama model, scores each trial with
// the scenario's judge, and writes attack success rate tables.
//
// Resumable: completed cells are recorded in results/progress.jsonl and skipped
// on a re-run. results.md and results.csv are regenerated after every cell, so
// you can watch them fill in. Per trial transcripts land in results/transcripts.
//
// Usage:
//   node bench/run.mjs
//   MODELS="qwen3.6:35b-a3b" N_TRIALS=3 SCENARIOS=summarizer node bench/run.mjs
//
// Filters: SCENARIOS (summarizer, agent, moderation), ARMS (control, baseline,
// tags, zerowidth, variation, homoglyph) and DEFENSES (none, exorcist) each take
// a comma separated list. THINK=true labels the model "<name> (thinking)" so a
// reasoning run gets its own row instead of overwriting the plain one.

import fs from "node:fs";
import path from "node:path";
import { chat, listModels, ToolsUnsupportedError } from "../src/ollama.mjs";
import { SCENARIOS } from "./scenarios.mjs";
import {
  MODELS,
  N_TRIALS,
  TEMPERATURE,
  SEED_BASE,
  TECHNIQUES,
  THINK,
  NUM_CTX,
} from "./config.mjs";
import { RESULTS_DIR, PROGRESS, loadProgress, writeReports } from "./report.mjs";

const TRANSCRIPT_DIR = path.join(RESULTS_DIR, "transcripts");
fs.mkdirSync(TRANSCRIPT_DIR, { recursive: true });

const listEnv = (name) =>
  process.env[name]
    ? new Set(process.env[name].split(",").map((s) => s.trim()).filter(Boolean))
    : null;
const scenarioFilter = listEnv("SCENARIOS");
const armFilter = listEnv("ARMS");
const defenseFilter = listEnv("DEFENSES");

const activeScenarios = Object.values(SCENARIOS).filter(
  (s) => !scenarioFilter || scenarioFilter.has(s.id),
);

// Control and baseline carry no hidden channel, so the exorcist has nothing to
// do there. Techniques run both undefended and defended.
const defensesFor = (arm) =>
  (arm === "control" || arm === "baseline" ? ["none"] : ["none", "exorcist"]).filter(
    (d) => !defenseFilter || defenseFilter.has(d),
  );

const key = (model, scenario, arm, defense) =>
  `${model}|${scenario}|${arm}|${defense}`;
const label = (model) => (THINK === true ? `${model} (thinking)` : model);
const sanitizeName = (s) => s.replace(/[^a-z0-9._-]/gi, "_");

const done = loadProgress();

function appendProgress(rec) {
  done.set(rec.key, rec);
  fs.appendFileSync(PROGRESS, JSON.stringify(rec) + "\n");
}

function appendTranscript(model, line) {
  fs.appendFileSync(
    path.join(TRANSCRIPT_DIR, sanitizeName(model) + ".jsonl"),
    JSON.stringify(line) + "\n",
  );
}

async function runCell(model, scenario, arm, defense) {
  let success = 0;
  let errors = 0;
  for (let t = 0; t < N_TRIALS; t++) {
    const built = scenario.build(arm, { defense: defense === "exorcist" });
    const line = {
      scenario: scenario.id,
      arm,
      defense: defense === "exorcist",
      trial: t,
    };
    try {
      const { content, thinking, toolCalls, raw } = await chat(
        model,
        built.messages,
        {
          temperature: TEMPERATURE,
          seed: SEED_BASE + t,
          tools: built.tools,
          think: THINK,
          numCtx: NUM_CTX,
        },
      );
      const ok = scenario.judge(arm, {
        content,
        toolCalls,
        filterBlocked: built.filterBlocked,
      });
      if (ok) success++;
      appendTranscript(label(model), {
        ...line,
        success: ok,
        filterBlocked: built.filterBlocked ?? null,
        promptTokens: raw.prompt_eval_count ?? null,
        thinkingChars: thinking ? thinking.length : 0,
        content: content.slice(0, 200),
        toolCalls: (toolCalls || []).map((tc) => ({
          name: tc.function?.name,
          args: JSON.stringify(tc.function?.arguments ?? {}).slice(0, 200),
        })),
      });
    } catch (e) {
      if (e instanceof ToolsUnsupportedError) throw e;
      errors++;
      appendTranscript(label(model), {
        ...line,
        error: String(e.message || e).slice(0, 200),
      });
    }
  }
  return { success, errors };
}

const available = new Set(await listModels());
const targets = MODELS.filter((m) => {
  if (available.has(m)) return true;
  console.log(`! skipping ${m} (not pulled; run: ollama pull ${m})`);
  return false;
});

if (!targets.length) {
  console.log("No target models available. Pull some, or set MODELS=.");
  process.exit(1);
}

console.log(
  `Models: ${targets.map(label).join(", ")}\nScenarios: ${activeScenarios
    .map((s) => s.id)
    .join(", ")}\nTrials/cell: ${N_TRIALS} @ temp ${TEMPERATURE}\n`,
);

for (const model of targets) {
  const name = label(model);
  for (const scenario of activeScenarios) {
    const skipKey = key(name, scenario.id, "*", "*");
    if (done.has(skipKey)) {
      console.log(`= skip (${done.get(skipKey).skipped}) ${name} ${scenario.id}`);
      continue;
    }
    let toolsUnsupported = false;
    for (const arm of scenario.arms(TECHNIQUES)) {
      if (armFilter && !armFilter.has(arm)) continue;
      for (const defense of defensesFor(arm)) {
        const k = key(name, scenario.id, arm, defense);
        if (done.has(k)) {
          console.log(`= skip (done) ${k}`);
          continue;
        }
        if (toolsUnsupported) continue;
        process.stdout.write(`... ${k} `);
        try {
          const { success, errors } = await runCell(model, scenario, arm, defense);
          appendProgress({
            key: k,
            model: name,
            scenario: scenario.id,
            arm,
            defense,
            trials: N_TRIALS,
            success,
            errors,
            temperature: TEMPERATURE,
            seedBase: SEED_BASE,
          });
          console.log(`=> ${success}/${N_TRIALS}${errors ? ` (${errors} err)` : ""}`);
          writeReports(done);
        } catch (e) {
          if (e instanceof ToolsUnsupportedError) {
            console.log(`\n! ${model} does not support tools; skipping ${scenario.id}`);
            toolsUnsupported = true;
            appendProgress({
              key: skipKey,
              model: name,
              scenario: scenario.id,
              skipped: "the model does not support tool calls",
            });
          } else {
            console.log(`\n! error on ${k}: ${e.message || e}`);
          }
        }
      }
    }
  }
}

writeReports(done);
console.log(`\nDone. See ${path.relative(process.cwd(), RESULTS_DIR)}/results.md`);
