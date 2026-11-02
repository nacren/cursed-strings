// Report for the thinking trace probe. Turns thinking.json into thinking.md.
// Run it on its own to rebuild the report without Ollama:
//   node bench/think-report.mjs
//
// Excerpts are cleaned for display. Broken half characters are dropped, runs
// of invisible characters are shown as a label such as
// "[20 invisible Tags characters]", the text is trimmed to whole words, and
// every cut is marked with [...]. thinking.json keeps the excerpts as saved.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RESULTS_DIR } from "./paths.mjs";
import { CANARY, TEMPERATURE } from "./config.mjs";
import { skeleton } from "../src/confusables.mjs";
import { isStrippable } from "../src/sanitize.mjs";
import { kindOf } from "../src/detect.mjs";

const isLoneSurrogate = (ch) => {
  const u = ch.charCodeAt(0);
  return ch.length === 1 && u >= 0xd800 && u <= 0xdfff;
};
const ENDS_A_PHRASE = new Set([".", "!", "?", '"', ")"]);
const CUT = "[...]";

/** Replace each run of invisible code points with a readable label. */
export function labelInvisible(text) {
  let out = "";
  let run = null;
  const flush = () => {
    if (!run) return;
    const plural = run.count === 1 ? "character" : "characters";
    out += `[${run.count} invisible ${run.kind} ${plural}]`;
    run = null;
  };
  for (const ch of text) {
    if (isLoneSurrogate(ch)) continue; // half of a character cut in two
    const cp = ch.codePointAt(0);
    if (isStrippable(cp)) {
      const kind = kindOf(cp);
      if (run && run.kind === kind) run.count++;
      else {
        flush();
        run = { kind, count: 1 };
      }
      continue;
    }
    flush();
    out += ch;
  }
  flush();
  return out;
}

/**
 * Clean an excerpt for display. cutStart and cutEnd say whether the excerpt
 * was taken from the middle of a longer trace on that side.
 */
export function cleanExcerpt(raw, { cutStart = true, cutEnd = true } = {}) {
  let s = labelInvisible(raw).replace(/\s+/g, " ").trim();

  if (cutStart) {
    // Drop a partial first word. A label or punctuation at the start is kept.
    if (/^[\p{L}\p{N}]/u.test(s) && s.includes(" ")) s = s.slice(s.indexOf(" ") + 1);
    s = `${CUT} ${s}`;
  }

  if (cutEnd) {
    // End at the last complete phrase after the canary, else at a word.
    const at = skeleton(s).toUpperCase().indexOf(CANARY);
    const from = at >= 0 ? at + CANARY.length - 1 : 0;
    let end = -1;
    for (let i = s.length - 1; i >= from; i--) {
      if (ENDS_A_PHRASE.has(s[i])) {
        end = i + 1;
        break;
      }
    }
    if (end < 0) end = s.lastIndexOf(" ") > from ? s.lastIndexOf(" ") : s.length;
    s = `${s.slice(0, end).trimEnd()} ${CUT}`;
  }
  return s;
}

/**
 * Take an excerpt around the first canary in a full trace. Works on whole code
 * points, so it never splits a character, and widens to whole words.
 */
export function excerptAround(text, { before = 200, after = 120 } = {}) {
  const cps = [...text];
  const skel = [...skeleton(text)].join("");
  const at16 = skel.toUpperCase().indexOf(CANARY);
  if (at16 < 0) return "";
  const at = [...skel.slice(0, at16)].length; // code point index
  let start = Math.max(0, at - before);
  let end = Math.min(cps.length, at + CANARY.length + after);
  while (start > 0 && !/\s/.test(cps[start - 1])) start--;
  while (end < cps.length && !/\s/.test(cps[end])) end++;
  return cleanExcerpt(cps.slice(start, end).join(""), {
    cutStart: start > 0,
    cutEnd: end < cps.length,
  });
}

/** Build thinking.md from the rows saved in thinking.json. */
export function renderThinkingReport(rows) {
  const md = [
    "# Thinking trace probe",
    "",
    `The undefended S1 document, run with thinking enabled. For each technique: how ` +
      `many trials had the canary "${CANARY}" somewhere in the thinking trace, and how ` +
      `many had it in the answer. A trace hit with no answer hit is a model that read ` +
      `the hidden instruction and declined to follow it. Temperature ${TEMPERATURE}.`,
    "",
    `Excerpts are cleaned for display. ${CUT} marks where the excerpt was cut, and a ` +
      `bracketed label marks invisible characters the model copied into its trace. ` +
      `thinking.json keeps each excerpt exactly as saved.`,
    "",
  ];
  for (const r of rows) {
    md.push(`## ${r.model}`);
    md.push("");
    md.push("| technique | canary in thinking | canary in answer | avg thinking chars | errors |");
    md.push("|---|---|---|---|---|");
    for (const [arm, a] of Object.entries(r.arms)) {
      md.push(
        `| ${arm} | ${a.inThinking}/${r.trials} | ${a.inAnswer}/${r.trials} | ${a.avgThinkingChars} | ${a.errors} |`,
      );
    }
    md.push("");
    for (const [arm, a] of Object.entries(r.arms)) {
      if (!a.excerpt) continue;
      // Excerpts saved before full traces were kept are fixed windows, cut on both sides.
      const shown = a.traces ? a.excerpt : cleanExcerpt(a.excerpt);
      md.push(`${arm}, first trace that decoded it:`);
      md.push("");
      md.push("> " + shown.replace(/\|/g, "/"));
      md.push("");
    }
    if (Object.values(r.arms).some((a) => a.traces)) {
      md.push("Full traces for this model are saved in thinking.json.");
      md.push("");
    }
  }
  return md.join("\n");
}

export function writeThinkingReport(rows, dir = RESULTS_DIR) {
  fs.writeFileSync(path.join(dir, "thinking.md"), renderThinkingReport(rows));
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const file = path.join(RESULTS_DIR, "thinking.json");
  if (!fs.existsSync(file)) {
    console.log(`No thinking probe results at ${file}. Run npm run think first.`);
    process.exit(1);
  }
  writeThinkingReport(JSON.parse(fs.readFileSync(file, "utf8")));
  console.log(`Rebuilt ${path.relative(process.cwd(), path.join(RESULTS_DIR, "thinking.md"))}`);
}
