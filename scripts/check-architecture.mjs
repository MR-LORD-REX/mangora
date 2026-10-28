#!/usr/bin/env node
/**
 * Architecture boundary check for the refactor.
 *
 * Uses the TypeScript compiler API so multi-line imports, type-only imports,
 * re-exports and dynamic imports are all represented accurately.
 *
 * Run: npm run check:arch
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = ["src", "app"];
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".expo",
  "android",
  "dist",
  "releases",
  "assets",
  "coverage",
]);
// Routes are part of the boundary check from Phase 1. Legacy source folders
// join the scan as each one moves behind a feature entry point.
const ALLOWED_LEGACY_FILES = new Set([]);
const compilerOptions = {
  allowJs: true,
  jsx: ts.JsxEmit.ReactJSX,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  baseUrl: ROOT,
  paths: {
    "@composition/*": ["./src/composition/*"],
    "@shared/*": ["./src/shared/*"],
    "@core/*": ["./src/core/*"],
    "@features/*": ["./src/features/*"],
    "@platform/*": ["./src/platform/*"],
  },
};

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
      continue;
    }
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const files = SOURCE_ROOTS.flatMap((root) => walk(path.join(ROOT, root)));
const rel = (file) => path.relative(ROOT, file).replaceAll("\\", "/");
const edges = new Map(files.map((file) => [path.resolve(file), []]));
const errors = [];
const warnings = [];
const REMOVED_LEGACY_PATHS = [
  "constants/theme",
  "components/common/AppHeader",
  "components/common/Dialogs",
  "components/common/MenuSheet",
  "services/yolo/",
  "services/segmentation/",
  "services/detection/",
  "services/ocr/",
  "services/translation/",
  "services/downloader/",
  "components/downloader/",
  "components/sources/SourceFilterOverlay",
  "services/extensions/",
  "components/extensions/",
  "components/manga/openMangaInfo",
  "components/manga/",
];

function collectSpecifiers(sourceFile) {
  const specifiers = new Set();
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        specifiers.add(statement.moduleSpecifier.text);
      }
    }
  }
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  for (const specifier of collectSpecifiers(sourceFile)) {
    if (REMOVED_LEGACY_PATHS.some((removed) => specifier === `@/${removed}` || specifier.startsWith(`@/${removed}`))) {
      errors.push(`${rel(file)} imports removed legacy path: ${specifier}`);
      continue;
    }
    if (specifier.includes("/android/") || specifier.startsWith("android/")) {
      errors.push(`${rel(file)} imports generated native path: ${specifier}`);
      continue;
    }
    if (specifier.endsWith(".css")) continue;
    if (!specifier.startsWith(".") && !specifier.startsWith("@/") && !specifier.startsWith("@shared/") && !specifier.startsWith("@core/") && !specifier.startsWith("@features/") && !specifier.startsWith("@composition/") && !specifier.startsWith("@platform/")) continue;
    const resolved = ts.resolveModuleName(specifier, file, compilerOptions, ts.sys).resolvedModule;
    if (!resolved) {
      warnings.push(`${rel(file)} imports unresolved local path: ${specifier}`);
      continue;
    }
    const target = path.resolve(resolved.resolvedFileName);
    if (target.startsWith(ROOT) && !target.startsWith(path.join(ROOT, "node_modules"))) {
      edges.get(path.resolve(file)).push(target);
    }
  }
}

function zoneOf(file) {
  const r = rel(file);
  if (r.startsWith("app/")) return "app";
  if (r.startsWith("src/features/")) return "features";
  if (r.startsWith("src/shared/")) return "shared";
  if (r.startsWith("src/core/")) return "core";
  if (r.startsWith("src/composition/")) return "composition";
  if (r.startsWith("src/platform/")) return "platform";
  return "legacy";
}

function featureOf(file) {
  const r = rel(file);
  if (!r.startsWith("src/features/")) return null;
  return r.split("/")[2] ?? null;
}

function isFeatureIndex(file) {
  return /^src\/features\/[^/]+\/index\.(ts|tsx)$/.test(rel(file));
}

for (const [file, targets] of edges) {
  const fromZone = zoneOf(file);
  const fromFeature = featureOf(file);
  for (const target of targets) {
    const toZone = zoneOf(target);
    const toFeature = featureOf(target);
    if (fromZone !== "app" && fromZone !== "composition" && toZone === "app") {
      errors.push(`${rel(file)} -> ${rel(target)}: only routes and composition may import app zones`);
    }
    if (
      fromZone !== "app" &&
      fromZone !== "composition" &&
      toZone === "composition"
    ) {
      errors.push(`${rel(file)} -> ${rel(target)}: composition must not be imported by lower zones`);
    }
    if (fromZone === "shared" && toZone === "features") {
      errors.push(`${rel(file)} -> ${rel(target)}: shared must not import features`);
    }
    if (fromZone === "core" && toZone === "features") {
      errors.push(`${rel(file)} -> ${rel(target)}: core must not import features`);
    }
    if (fromZone === "shared" && toZone === "core") {
      errors.push(`${rel(file)} -> ${rel(target)}: shared must not import core`);
    }
    if (fromZone === "platform" && (toZone === "features" || toZone === "core")) {
      errors.push(`${rel(file)} -> ${rel(target)}: platform must not import features or core`);
    }
    if (fromZone === "app" && toZone === "features" && !isFeatureIndex(target)) {
      errors.push(`${rel(file)} -> ${rel(target)}: app may import a feature only through its index.ts`);
    }
    if (fromZone === "composition" && toZone === "features" && !isFeatureIndex(target)) {
      errors.push(`${rel(file)} -> ${rel(target)}: composition may import a feature only through its index.ts`);
    }
    if (fromZone === "features" && toZone === "composition") {
      errors.push(`${rel(file)} -> ${rel(target)}: features must not import composition`);
    }
    if (fromZone === "features" && toZone === "features" && fromFeature !== toFeature && !isFeatureIndex(target)) {
      errors.push(`${rel(file)} -> ${rel(target)}: cross-feature imports must use the public index.ts`);
    }
    if (fromZone === "legacy" && toZone !== "legacy" && !ALLOWED_LEGACY_FILES.has(rel(file))) {
      warnings.push(`${rel(file)} -> ${rel(target)}: legacy file imports a new zone`);
    }
  }
}

let nextIndex = 0;
const stack = [];
const onStack = new Set();
const indices = new Map();
const lowLinks = new Map();
const components = [];

function strongConnect(node) {
  indices.set(node, nextIndex);
  lowLinks.set(node, nextIndex);
  nextIndex += 1;
  stack.push(node);
  onStack.add(node);
  for (const next of edges.get(node) ?? []) {
    if (!indices.has(next)) {
      strongConnect(next);
      lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(next)));
    } else if (onStack.has(next)) {
      lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(next)));
    }
  }
  if (lowLinks.get(node) === indices.get(node)) {
    const component = [];
    let member;
    do {
      member = stack.pop();
      onStack.delete(member);
      component.push(member);
    } while (member !== node);
    if (component.length > 1) components.push(component);
  }
}

for (const node of edges.keys()) {
  if (!indices.has(node)) strongConnect(node);
}
for (const component of components) {
  errors.push(`Import cycle: ${component.map(rel).sort().join(" -> ")}`);
}

if (warnings.length) for (const warning of warnings) console.warn(`warning: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`error: ${error}`);
  console.error(`\nArchitecture check failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(`Architecture check passed: ${files.length} files, ${[...edges.values()].flat().length} local edges.`);
if (warnings.length) console.log(`${warnings.length} legacy warning(s).`);
