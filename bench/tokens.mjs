// Token count probe. Does a hidden channel reach the model at all?
//
// For each channel the script sends the perception probe prompt and reads
// prompt_eval_count from Ollama's reply, the number of prompt tokens the model
// actually consumed. If a tokenizer dropped a channel's code points, the count
// would not move against the empty control. If it climbs, the payload reached
// the model as tokens, whether or not the model can read them as letters.
//
// Usage: node bench/tokens.mjs   (honours MODELS / NUM_CTX / THINK env vars)

import fs from "node:fs";
import path from "node:path";
import { RESULTS_DIR } from "./paths.mjs";
import { listModels, chat } from "../src/ollama.mjs";
import { encodeTag } from "../src/tags.mjs";
import { encodeZeroWidth } from "../src/zerowidth.mjs";
import { encodeVariation } from "../src/variation.mjs";
import { toHomoglyphs } from "../src/homoglyph.mjs";
import { letterSpace, SOFT_HYPHEN } from "../src/obfuscate.mjs";
import { MODELS, NUM_CTX, THINK } from "./config.mjs";

fs.mkdirSync(RESULTS_DIR, { recursive: true });

const MARKER = "READ9284";
const INSTR =
  "Repeat back, as plain ASCII, the exact alphanumeric token contained in " +
  "this message. Reply with only the token and nothing else:";

const CHANNELS = {
  none: () => "",
  plaintext: (m) => m,
  tags: (m) => encodeTag(m),
  zerowidth: (m) => encodeZeroWidth(m),
  variation: (m) => encodeVariation(m),
  homoglyph: (m) => toHomoglyphs(m),
  softhyphen: (m) => letterSpace(m, SOFT_HYPHEN),
};
const COLS = Object.keys(CHANNELS);

const available = new Set(await listModels());
const targets = MODELS.filter((m) => available.has(m));
if (!targets.length) {
  console.log("No target models available.");
  process.exit(1);
}

const results = [];
for (const model of targets) {
  const row = { model, channels: {} };
  let base = null;
  for (const [name, enc] of Object.entries(CHANNELS)) {
    const payload = enc(MARKER);
    const content = name === "none" ? INSTR : `${INSTR} ${payload}`;
    try {
      const { content: reply, raw } = await chat(
        model,
        [{ role: "user", content }],
        { temperature: 0, seed: 0, numCtx: NUM_CTX, numPredict: 32, think: THINK },
      );
      const tokens = raw.prompt_eval_count ?? null;
      if (name === "none") base = tokens;
      const cps = [...payload].length;
      const added = tokens !== null && base !== null ? tokens - base : null;
      row.channels[name] = {
        payloadCodePoints: cps,
        promptTokens: tokens,
        addedTokens: added,
        tokensPerCodePoint:
          added !== null && cps ? Number((added / cps).toFixed(2)) : null,
        reply: reply.trim().slice(0, 40),
      };
    } catch (e) {
      row.channels[name] = { error: String(e.message || e).slice(0, 120) };
    }
    const c = row.channels[name];
    console.log(
      `${model}  ${name.padEnd(10)} tokens=${c.promptTokens ?? "?"} ` +
        `added=${c.addedTokens ?? "?"} per_cp=${c.tokensPerCodePoint ?? "?"} ` +
        `reply=${JSON.stringify(c.reply ?? c.error)}`,
    );
  }
  results.push(row);
}

// Merge with a prior run so models measured separately share one table.
const JSON_PATH = path.join(RESULTS_DIR, "tokens.json");
const merged = new Map();
if (fs.existsSync(JSON_PATH)) {
  try {
    for (const r of JSON.parse(fs.readFileSync(JSON_PATH, "utf8")))
      merged.set(r.model, r);
  } catch {
    // start fresh
  }
}
for (const r of results) merged.set(r.model, r);
const allRows = [...merged.values()];
fs.writeFileSync(JSON_PATH, JSON.stringify(allRows, null, 2));

const md = [
  "# Token count probe",
  "",
  `Prompt tokens consumed when the marker "${MARKER}" is delivered through each ` +
    "channel, read from Ollama's prompt_eval_count. The none row is the same " +
    "prompt with no marker. A channel whose code points were dropped by the " +
    "tokenizer would add nothing. The reply column is the model's answer at " +
    "temperature 0, cut to 40 characters.",
  "",
];
for (const r of allRows) {
  md.push(`## ${r.model}`);
  md.push("");
  md.push(
    "| channel | payload code points | prompt tokens | added tokens | tokens per code point | reply |",
  );
  md.push("|---|---|---|---|---|---|");
  for (const name of COLS) {
    const c = r.channels[name];
    if (!c) continue;
    if (c.error) {
      md.push(`| ${name} | n/a | n/a | n/a | n/a | error: ${c.error} |`);
      continue;
    }
    md.push(
      `| ${name} | ${c.payloadCodePoints} | ${c.promptTokens ?? "n/a"} | ${
        c.addedTokens ?? "n/a"
      } | ${c.tokensPerCodePoint ?? "n/a"} | ${c.reply.replace(/\|/g, "/")} |`,
    );
  }
  md.push("");
}
fs.writeFileSync(path.join(RESULTS_DIR, "tokens.md"), md.join("\n"));
console.log(
  `\nWrote ${path.relative(process.cwd(), path.join(RESULTS_DIR, "tokens.md"))}`,
);
