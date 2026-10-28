#!/usr/bin/env node
/**
 * Validate repository-local Markdown links.
 *
 * Usage:
 *   node scripts/check-doc-links.mjs
 *
 * Checks docs/, feature READMEs and the public root documents. Links are
 * resolved relative to the containing Markdown file. External URLs, anchors and
 * fenced code blocks are ignored.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = ["docs", "src/features"];
const ROOT_FILES = ["README.md", "THIRD-PARTY.md"];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

const files = SCAN_ROOTS.flatMap((root) => walk(path.join(ROOT, root)));
for (const file of ROOT_FILES) {
  const full = path.join(ROOT, file);
  if (fs.existsSync(full)) files.push(full);
}
files.sort();

const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8").replace(/```[\s\S]*?```/g, "");
  const links = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = links.exec(text))) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1);
    }
    if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
      continue;
    }
    target = target.split("#", 1)[0].split("?", 1)[0];
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      failures.push(`${path.relative(ROOT, file).replaceAll("\\", "/")} -> ${match[1]}`);
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`error: broken documentation link: ${failure}`);
  console.error(`\n${failures.length} broken link(s) in ${files.length} Markdown files.`);
  process.exit(1);
}

console.log(`Documentation links passed: ${files.length} Markdown files.`);