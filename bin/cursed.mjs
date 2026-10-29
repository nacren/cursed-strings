#!/usr/bin/env node
// cursed: command line front end for the exorcist and the smuggler.
//
//   node bin/cursed.mjs detect [file]              report hidden channels, exit 1 if suspicious
//   node bin/cursed.mjs clean [file]               print the exorcised text
//   node bin/cursed.mjs decode [file]              print any decoded hidden payloads
//   node bin/cursed.mjs dump [file]                list every non ASCII code point with its name
//   node bin/cursed.mjs smuggle <technique> <secret> [file]   hide secret in the cover text
//   node bin/cursed.mjs obfuscate <technique> <token>          filter evasion form of one token
//
// File defaults to stdin. Flags: --json (detect), --keep-emoji (clean).

import fs from "node:fs";
import { detect, describeCodePoint } from "../src/detect.mjs";
import { sanitize } from "../src/sanitize.mjs";
import { smuggle, TECHNIQUES } from "../src/smuggle.mjs";
import { obfuscateToken, OBFUSCATIONS } from "../src/obfuscate.mjs";

const USAGE = `usage: cursed <command> [file] [--json] [--keep-emoji]

  detect [file]                       report hidden channels, exit 1 if suspicious
  clean [file]                        print the exorcised text
  decode [file]                       print any decoded hidden payloads
  dump [file]                         list every non ASCII code point with its name
  smuggle <technique> <secret> [file] hide secret in the cover text
  obfuscate <technique> <token>       filter evasion form of one token

file defaults to stdin.
smuggle techniques:   ${TECHNIQUES.join(", ")}
obfuscate techniques: ${OBFUSCATIONS.join(", ")}
`;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const [cmd, ...rest] = positional;
const asJson = flags.has("--json");
const keepEmoji = flags.has("--keep-emoji");

function readInput(file) {
  if (file && file !== "-") return fs.readFileSync(file, "utf8");
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

const out = (s) => process.stdout.write(s);
const line = (s = "") => out(s + "\n");
const show = (s) => JSON.stringify(s);

function cmdDetect(file) {
  const text = readInput(file);
  const d = detect(text);
  if (asJson) {
    line(JSON.stringify(d, null, 2));
  } else {
    line(`verdict         ${d.suspicious ? "SUSPICIOUS" : "clean"}`);
    for (const r of d.reasons) line(`  - ${r}`);
    line("channels");
    const ch = d.channels;
    const row = (name, c) =>
      line(
        `  ${name.padEnd(14)}${String(c.count).padStart(5)}` +
          (c.payload ? `   payload ${show(c.payload)}` : ""),
      );
    row("tags", ch.tags);
    row("zero width", ch.zeroWidth);
    row("variation", ch.variation);
    row("bidi", ch.bidi);
    row("other", ch.other);
    line(
      `hidden runs     ${d.invisible.runs.length}` +
        (d.invisible.runs.length
          ? "   " +
            d.invisible.runs
              .slice(0, 6)
              .map((r) => `[${r.start}..${r.end}) ${r.length}`)
              .join(", ") +
            (d.invisible.runs.length > 6 ? ", ..." : "")
          : ""),
    );
    for (const [k, n] of Object.entries(d.invisible.byKind)) {
      line(`  ${k}: ${n}`);
    }
    line(
      `inside words    ${d.intraWord.count}` +
        (d.intraWord.samples.length
          ? "   " + d.intraWord.samples.map(show).join(", ")
          : ""),
    );
    line(
      `mixed script    ${d.mixedScript.count}` +
        (d.mixedScript.words.length
          ? "   " + d.mixedScript.words.map(show).join(", ")
          : ""),
    );
    line(
      `look alikes     ${d.lookalikeWords.count}` +
        (d.lookalikeWords.words.length
          ? "   " + d.lookalikeWords.words.map(show).join(", ")
          : ""),
    );
    line(
      `confusables     ${d.confusables.count}` +
        (d.confusables.count ? `   skeleton ${show(d.confusables.skeleton)}` : ""),
    );
  }
  process.exitCode = d.suspicious ? 1 : 0;
}

function cmdClean(file) {
  out(sanitize(readInput(file), { keepEmoji }));
}

function cmdDecode(file) {
  const d = detect(readInput(file));
  const found = [
    ["tags", d.channels.tags.payload],
    ["zero width", d.channels.zeroWidth.payload],
    ["variation", d.channels.variation.payload],
  ].filter(([, p]) => p);
  if (asJson) {
    line(JSON.stringify(Object.fromEntries(found)));
    return;
  }
  if (!found.length) {
    line("no decodable payload");
    return;
  }
  for (const [name, p] of found) line(`${name.padEnd(12)} ${show(p)}`);
}

function cmdDump(file) {
  const chars = [...readInput(file)];
  let shown = 0;
  chars.forEach((c, i) => {
    const cp = c.codePointAt(0);
    if (cp >= 0x20 && cp <= 0x7e) return;
    if (cp === 0x0a || cp === 0x0d || cp === 0x09) return;
    const desc = describeCodePoint(cp);
    const vis = desc.endsWith(" visible") ? `  ${c}` : "";
    line(`${String(i).padStart(6)}  ${desc}${vis}`);
    shown++;
  });
  if (!shown) line("only printable ASCII");
}

function cmdSmuggle(technique, secret, file) {
  if (!technique || secret === undefined) {
    line(USAGE);
    process.exitCode = 2;
    return;
  }
  const cover = readInput(file).replace(/\r?\n$/, "");
  out(smuggle(cover, secret, technique));
}

function cmdObfuscate(technique, token) {
  if (!technique || token === undefined) {
    line(USAGE);
    process.exitCode = 2;
    return;
  }
  out(obfuscateToken(token, technique));
}

try {
  switch (cmd) {
    case "detect":
      cmdDetect(rest[0]);
      break;
    case "clean":
      cmdClean(rest[0]);
      break;
    case "decode":
      cmdDecode(rest[0]);
      break;
    case "dump":
      cmdDump(rest[0]);
      break;
    case "smuggle":
      cmdSmuggle(rest[0], rest[1], rest[2]);
      break;
    case "obfuscate":
      cmdObfuscate(rest[0], rest[1]);
      break;
    default:
      line(USAGE);
      process.exitCode = cmd ? 2 : 0;
  }
} catch (e) {
  process.stderr.write(`cursed: ${e.message || e}\n`);
  process.exitCode = 2;
}
