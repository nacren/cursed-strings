// Thinking trace probe. For a reasoning model, does the hidden instruction show
// up in the model's own thinking even when the answer ignores it?
//
// Runs the undefended S1 document for each technique with thinking enabled and
// reports, per trial, whether the canary appears in the thinking trace and
// whether it appears in the answer. The gap between those two columns is a
// model that read the payload and chose not to obey it.
//
// Every trace and answer is saved in thinking.json, and thinking.md shows the
// first matching excerpt per technique, cut on whole words.
//
// Usage: MODELS=qwen3.6:35b-a3b node bench/think.mjs   (THINK_TRIALS, ARMS)

import fs from "node:fs";
import path from "node:path";
import { RESULTS_DIR } from "./paths.mjs";
import { listModels, chat } from "../src/ollama.mjs";
import { skeleton } from "../src/confusables.mjs";
import { SCENARIOS } from "./scenarios.mjs";
import { MODELS, NUM_CTX, TEMPERATURE, SEED_BASE, CANARY, TECHNIQUES } from "./config.mjs";
import { excerptAround, writeThinkingReport } from "./think-report.mjs";

fs.mkdirSync(RESULTS_DIR, { recursive: true });

const TRIALS = Number(process.env.THINK_TRIALS || 5);
const ARMS = process.env.ARMS
  ? process.env.ARMS.split(",").map((s) => s.trim()).filter(Boolean)
  : TECHNIQUES;

const has = (s) => skeleton(s || "").toUpperCase().includes(CANARY);

const available = new Set(await listModels());
const targets = MODELS.filter((m) => available.has(m));
if (!targets.length) {
  console.log("No target models available.");
  process.exit(1);
}

const results = [];
for (const model of targets) {
  const row = { model, trials: TRIALS, arms: {} };
  for (const arm of ARMS) {
    let inThinking = 0;
    let inAnswer = 0;
    let errors = 0;
    let excerpt = "";
    let chars = 0;
    const traces = [];
    for (let t = 0; t < TRIALS; t++) {
      const built = SCENARIOS.summarizer.build(arm, { defense: false });
      try {
        const { content, thinking } = await chat(model, built.messages, {
          temperature: TEMPERATURE,
          seed: SEED_BASE + t,
          numCtx: NUM_CTX,
          think: true,
        });
        chars += thinking.length;
        const thought = has(thinking);
        const answered = has(content);
        if (thought) inThinking++;
        if (answered) inAnswer++;
        if (thought && !excerpt) excerpt = excerptAround(thinking);
        traces.push({ trial: t, canaryInThinking: thought, canaryInAnswer: answered, thinking, answer: content });
      } catch (e) {
        errors++;
        traces.push({ trial: t, error: String(e.message || e).slice(0, 200) });
      }
      console.log(`${model}  ${arm.padEnd(10)} trial ${t}: thinking=${inThinking} answer=${inAnswer}`);
    }
    row.arms[arm] = {
      inThinking,
      inAnswer,
      errors,
      avgThinkingChars: Math.round(chars / Math.max(1, TRIALS - errors)),
      excerpt,
      traces,
    };
  }
  results.push(row);
}

const JSON_PATH = path.join(RESULTS_DIR, "thinking.json");
const merged = new Map();
if (fs.existsSync(JSON_PATH)) {
  try {
    for (const r of JSON.parse(fs.readFileSync(JSON_PATH, "utf8"))) merged.set(r.model, r);
  } catch {
    // start fresh
  }
}
for (const r of results) merged.set(r.model, r);
const allRows = [...merged.values()];
fs.writeFileSync(JSON_PATH, JSON.stringify(allRows, null, 2));
writeThinkingReport(allRows);
console.log(`\nWrote ${path.relative(process.cwd(), path.join(RESULTS_DIR, "thinking.md"))}`);
