#!/usr/bin/env node
// Performance budget — Phase 5.
//
// Sums uncompressed JS chunk sizes shipped by `next build` against
// committed thresholds in perf-budget.json. Exits 1 on violation
// so CI fails before a regression lands.
//
// Two subcommands:
//   node scripts/perf-budget.mjs snapshot
//     Writes the current sizes to perf-budget.snapshot.json
//     (gitignored). Useful for human diff / debugging.
//
//   node scripts/perf-budget.mjs check
//     Reads perf-budget.json (committed) and compares. Prints
//     per-key delta vs budget and a final PASS / FAIL line.
//
// No third-party dependencies. Designed to work offline against
// a completed `.next/` build directory.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const NEXT_DIR = path.join(ROOT, ".next");
const STATIC_CHUNKS = path.join(NEXT_DIR, "static", "chunks");
const BUDGET_FILE = path.join(ROOT, "perf-budget.json");
const SNAPSHOT_FILE = path.join(ROOT, "perf-budget.snapshot.json");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      out.push(...walk(p));
    } else if (stat.isFile() && p.endsWith(".js")) {
      out.push({ path: p, size: stat.size });
    }
  }
  return out;
}

function bytesToKB(b) {
  return Math.round(b / 1024);
}

/** Sum all JS chunks emitted under `.next/static/chunks`. Returns
 *  { totalKB, fileCount, biggestKB } so the snapshot stays small
 *  and stable across builds. */
function measure() {
  const files = walk(STATIC_CHUNKS);
  let total = 0;
  let biggest = 0;
  for (const f of files) {
    total += f.size;
    if (f.size > biggest) biggest = f.size;
  }
  return {
    totalKB: bytesToKB(total),
    fileCount: files.length,
    biggestKB: bytesToKB(biggest),
  };
}

function ensureBuilt() {
  if (!fs.existsSync(NEXT_DIR)) {
    console.error(
      "[perf-budget] .next/ not found — run `npm run build` first.",
    );
    process.exit(2);
  }
  if (!fs.existsSync(STATIC_CHUNKS)) {
    console.error(
      "[perf-budget] .next/static/chunks not found — build may have failed.",
    );
    process.exit(2);
  }
}

const cmd = process.argv[2] ?? "check";

if (cmd === "snapshot") {
  ensureBuilt();
  const snapshot = { measuredAt: Date.now(), ...measure() };
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2));
  console.log(
    `[perf-budget] snapshot written → totalKB=${snapshot.totalKB} files=${snapshot.fileCount} biggestKB=${snapshot.biggestKB}`,
  );
  process.exit(0);
}

if (cmd === "check") {
  ensureBuilt();
  if (!fs.existsSync(BUDGET_FILE)) {
    console.error(
      "[perf-budget] perf-budget.json not found. Run `npm run perf:snapshot` then copy values into perf-budget.json.",
    );
    process.exit(2);
  }
  const budget = JSON.parse(fs.readFileSync(BUDGET_FILE, "utf-8"));
  const m = measure();

  const checks = [
    {
      key: "totalKB",
      actual: m.totalKB,
      limit: budget.totalKB,
    },
    {
      key: "biggestKB",
      actual: m.biggestKB,
      limit: budget.biggestKB,
    },
    {
      key: "fileCount",
      actual: m.fileCount,
      limit: budget.fileCount,
    },
  ];

  let failed = false;
  for (const c of checks) {
    if (typeof c.limit !== "number") continue;
    const over = c.actual > c.limit;
    const delta = c.actual - c.limit;
    const sign = delta >= 0 ? "+" : "";
    console.log(
      `[perf-budget] ${c.key}: ${c.actual} (limit ${c.limit}, ${sign}${delta}) ${over ? "FAIL" : "ok"}`,
    );
    if (over) failed = true;
  }

  if (failed) {
    console.error("[perf-budget] FAIL — budget exceeded.");
    process.exit(1);
  }
  console.log("[perf-budget] PASS");
  process.exit(0);
}

console.error(`[perf-budget] unknown command: ${cmd}`);
process.exit(2);
