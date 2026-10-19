#!/usr/bin/env node
// Runs the evaluator against every generated Croissant+ODRL file in a
// directory, one request per file (action=use, purpose=research — the
// broadest sane default). Goal: find what breaks at scale, not exhaustively
// test every action per license yet.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { evaluateCroissantPolicy } from "./dist/evaluate.js";

const inputDir = process.argv[2];
if (!inputDir) {
  console.error("Usage: node run-corpus-eval.mjs <dir-of-jsonld-files>");
  process.exit(1);
}

// function firstTarget(doc) {
//   const dist = Array.isArray(doc.distribution) ? doc.distribution : [];
//   const entry = dist.find(d => d["@type"] === "cr:FileObject" || d["@type"] === "cr:FileSet");
//   return entry?.["@id"];
// }
function firstTarget(doc) {
  const dist = Array.isArray(doc.distribution) ? doc.distribution : [];
  const entry = dist.find(d => d["@type"] === "cr:FileObject" || d["@type"] === "cr:FileSet");
  if (entry?.["@id"]) return entry["@id"];
  // Empty distribution (common for multi-config datasets, e.g. facebook/mlqa) —
  // most generated policies are dataset-wide with no odrl:target on the
  // policy side, so any placeholder target still evaluates correctly.
  return doc["@id"] || doc.url || "dataset";
}

const files = (await readdir(inputDir)).filter(f => f.endsWith(".jsonld"));
console.log(`${files.length} files to evaluate`);

const rows = [["file", "decision", "detail"]];
const counts = {};

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  let decision = "ERROR", detail = "";
  try {
    const doc = JSON.parse(await readFile(path.join(inputDir, file), "utf8"));
    const target = firstTarget(doc);
    if (!target) {
      decision = "NO_TARGET";
    } else {
      const result = await evaluateCroissantPolicy(
        doc,
        // { assignee: "https://example.org/tester", action: "use", target, purpose: "research" },
        { assignee: "https://example.org/tester", action: "commercialize", target }
      );
      decision = result.decision;
    }
  } catch (e) {
    detail = String(e?.message ?? e).slice(0, 200);
  }

  rows.push([file, decision, detail]);
  counts[decision] = (counts[decision] ?? 0) + 1;

  if ((i + 1) % 100 === 0 || i + 1 === files.length) {
    console.log(`  ${i + 1}/${files.length}  ${JSON.stringify(counts)}`);
  }
}

const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
await writeFile("corpus-eval-results.csv", csv);

console.log("\nFinal counts:", counts);
console.log("Full results: corpus-eval-results.csv");
