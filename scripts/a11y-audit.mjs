#!/usr/bin/env node
// Accessibility audit — Phase 5.
//
// Static regex scan for common JSX a11y omissions across the
// component tree. NOT a full AST parser; tuned for the patterns
// THIS codebase actually produces, so it stays fast (no deps) and
// usable as a CI gate without a heavyweight linter pipeline.
//
// Findings categories:
//   img-no-alt         <img ...> with no alt attribute
//   button-no-label    <button> / <motion.button> that contains
//                      ONLY an icon component (no text node, no
//                      aria-label / aria-labelledby)
//
// Exit code 0 = no findings. Exit 1 = at least one finding. Use:
//   node scripts/a11y-audit.mjs        # report only
//   node scripts/a11y-audit.mjs --fail # also exit 1 on findings
//
// Designed to be re-run after every component edit. The
// "known false positive" list at the bottom of the script captures
// lines we've manually verified are fine but trip the regex; keep
// it short — extending it is a code smell.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

const SHOULD_FAIL = process.argv.includes("--fail");

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      out.push(...walk(p));
    } else if (
      stat.isFile() &&
      (p.endsWith(".tsx") || p.endsWith(".jsx"))
    ) {
      out.push(p);
    }
  }
  return out;
}

const findings = [];

// 1) <img> without alt attribute.
//    Matches both self-closed (`<img ... />`) and open (`<img ...>`),
//    requires the same tag to lack `alt=`.
const IMG_WITHOUT_ALT = /<img\b(?![^>]*\balt\s*=)[^>]*>/g;

// 2) Icon-only button. A motion.button or button whose body is JUST
//    a known lucide icon component (PascalCase ending with no children
//    text). Captured as: opening tag, contents up to `</button>` or
//    `</motion.button>`. We then check whether contents contains any
//    user-facing text (Hebrew / English word character outside JSX).
const BUTTON_BLOCK = /<(motion\.button|button)\b[^>]*>([\s\S]*?)<\/\1>/g;

for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, "utf-8");
  const lines = text.split("\n");

  // img-no-alt
  let m;
  while ((m = IMG_WITHOUT_ALT.exec(text)) !== null) {
    const upto = text.slice(0, m.index);
    const lineNo = upto.split("\n").length;
    findings.push({
      file,
      line: lineNo,
      rule: "img-no-alt",
      snippet: lines[lineNo - 1]?.trim() ?? m[0],
    });
  }

  // icon-only button
  IMG_WITHOUT_ALT.lastIndex = 0;
  while ((m = BUTTON_BLOCK.exec(text)) !== null) {
    const openTag = m[0].slice(0, m[0].indexOf(">") + 1);
    const body = m[2];

    // Skip if the opening tag already carries an aria-label or aria-
    // labelledby — caller said "I know this is decorative content".
    if (
      /\baria-label\s*=/.test(openTag) ||
      /\baria-labelledby\s*=/.test(openTag) ||
      /\btitle\s*=/.test(openTag)
    ) {
      continue;
    }

    // Check whether the body has ANY user-facing text. Strip JSX
    // tags. For JSX expressions `{...}`, peek inside for any
    // quoted string literal — that's runtime-visible text the
    // static scan can't otherwise see.
    const tagsStripped = body.replace(/<[^>]*>/g, " ");
    const hasQuotedString = /["'`][^"'`\n]{1,}["'`]/.test(tagsStripped);
    if (hasQuotedString) continue;
    const stripped = tagsStripped
      .replace(/\{[^{}]*\}/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped.length > 0) continue; // has visible text

    const upto = text.slice(0, m.index);
    const lineNo = upto.split("\n").length;
    findings.push({
      file,
      line: lineNo,
      rule: "button-no-label",
      snippet: openTag.trim().slice(0, 120),
    });
  }
}

// Known false positives — keep this list small and SHORT-LIVED.
// Each entry must explain WHY the rule shouldn't fire here.
const SUPPRESS = new Set([
  // none yet
]);

const filtered = findings.filter(
  (f) => !SUPPRESS.has(`${path.relative(ROOT, f.file)}:${f.line}:${f.rule}`),
);

if (filtered.length === 0) {
  console.log("[a11y-audit] no findings ✓");
  process.exit(0);
}

console.log(`[a11y-audit] ${filtered.length} finding(s):`);
for (const f of filtered) {
  const rel = path.relative(ROOT, f.file);
  console.log(`  ${rel}:${f.line}: ${f.rule}`);
  console.log(`    ${f.snippet}`);
}
if (SHOULD_FAIL) process.exit(1);
process.exit(0);
