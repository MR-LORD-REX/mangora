#!/usr/bin/env node
/**
 * Runs every feature test with Node's test runner.
 *
 * Keeping discovery here makes `npm test` work on Windows PowerShell and on
 * the Linux CI matrix without relying on shell glob expansion.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const features = path.join(root, "src", "features");
const require = createRequire(import.meta.url);

function collectTests(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTests(fullPath));
    } else if (entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const tests = collectTests(features).sort();
if (tests.length === 0) {
  console.error("No feature tests found under src/features.");
  process.exit(1);
}

let tsxCli;
try {
  tsxCli = require.resolve("tsx/cli");
} catch {
  console.error("tsx is not installed. Run npm ci before npm test.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [tsxCli, "--test", ...tests], {
  cwd: root,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
