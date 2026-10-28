#!/usr/bin/env node
/**
 * Generate deterministic architecture data for the docs website.
 *
 * Outputs:
 *   docs/architecture/generated/dependency-graph.json
 *   docs/architecture/generated/api-surface.json
 *
 * Usage:
 *   npm run docs:graph   write the snapshots
 *   npm run docs:check   fail if either checked-in snapshot is stale
 *
 * The generator deliberately uses the TypeScript compiler API, matching
 * scripts/check-architecture.mjs. It includes static imports, re-exports and
 * dynamic import() calls, preserving imported/exported symbols, but it does not
 * attempt runtime reflection. Bare package and CSS imports are excluded.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = ["src", "app"];
const OUTPUT_DIR = path.join(ROOT, "docs", "architecture", "generated");
const GRAPH_FILE = path.join(OUTPUT_DIR, "dependency-graph.json");
const API_FILE = path.join(OUTPUT_DIR, "api-surface.json");
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".expo",
  "android",
  "dist",
  "releases",
  "assets",
  "coverage",
  "generated",
]);
const COMPILER_OPTIONS = {
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
    if (
      /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const relative = (file) => path.relative(ROOT, file).replaceAll("\\", "/");

function sourceFiles() {
  return SOURCE_ROOTS.flatMap((root) => walk(path.join(ROOT, root))).sort();
}

function fileKind(file) {
  const name = path.basename(file);
  if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) return "test";
  if (name.startsWith("index.")) return "barrel";
  if (name.endsWith(".d.ts")) return "declaration";
  if (name.endsWith(".tsx")) return "component";
  return "module";
}

function zoneOf(file) {
  const rel = relative(file);
  if (rel.startsWith("app/")) return "app";
  if (rel.startsWith("src/composition/")) return "composition";
  if (rel.startsWith("src/features/")) return "features";
  if (rel.startsWith("src/core/")) return "core";
  if (rel.startsWith("src/platform/")) return "platform";
  if (rel.startsWith("src/shared/")) return "shared";
  return "other";
}

function featureOf(file) {
  const rel = relative(file);
  const match = /^src\/features\/([^/]+)/.exec(rel);
  return match ? match[1] : null;
}

function moduleNameText(node) {
  return node && ts.isIdentifier(node) ? node.text : node?.text ?? null;
}

function binding(name, alias, kind, typeOnly) {
  return { name, alias, kind, typeOnly: Boolean(typeOnly) };
}

export function importBindings(statement) {
  const clause = statement.importClause;
  if (!clause) return [];
  const bindings = [];
  if (clause.name) {
    bindings.push(binding("default", clause.name.text, "default", clause.isTypeOnly));
  }
  const named = clause.namedBindings;
  if (named && ts.isNamespaceImport(named)) {
    bindings.push(binding("*", named.name.text, "namespace", clause.isTypeOnly));
  } else if (named && ts.isNamedImports(named)) {
    for (const element of named.elements) {
      bindings.push(
        binding(
          moduleNameText(element.propertyName ?? element.name),
          element.name.text,
          "named",
          clause.isTypeOnly || element.isTypeOnly,
        ),
      );
    }
  }
  return bindings;
}

export function exportBindings(statement) {
  const clause = statement.exportClause;
  if (!clause) {
    return [binding("*", "*", "star", statement.isTypeOnly)];
  }
  if (ts.isNamespaceExport(clause)) {
    return [binding("*", clause.name.text, "namespace", statement.isTypeOnly)];
  }
  if (ts.isNamedExports(clause)) {
    return clause.elements.map((element) =>
      binding(
        moduleNameText(element.propertyName ?? element.name),
        element.name.text,
        "named",
        statement.isTypeOnly || element.isTypeOnly,
      ),
    );
  }
  return [];
}

export function collectModuleSpecifiers(sourceFile) {
  const specifiers = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const bindings = importBindings(statement);
      specifiers.push({
        specifier: statement.moduleSpecifier.text,
        kind: "import",
        typeOnly: statement.importClause?.isTypeOnly ?? false,
        bindings: bindings.length ? bindings : [binding("*", "*", "side-effect", false)],
      });
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      specifiers.push({
        specifier: statement.moduleSpecifier.text,
        kind: "re-export",
        typeOnly: statement.isTypeOnly,
        bindings: exportBindings(statement),
      });
    }
  }
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push({
        specifier: node.arguments[0].text,
        kind: "dynamic",
        typeOnly: false,
        bindings: [binding("*", "*", "dynamic", false)],
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return specifiers;
}

export function resolveModule(specifier, containingFile) {
  if (specifier.endsWith(".css")) return null;
  const isLocal =
    specifier.startsWith(".") ||
    specifier.startsWith("@shared/") ||
    specifier.startsWith("@core/") ||
    specifier.startsWith("@features/") ||
    specifier.startsWith("@composition/") ||
    specifier.startsWith("@platform/");
  if (!isLocal) return null;
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    COMPILER_OPTIONS,
    ts.sys,
  ).resolvedModule;
  if (!resolved) return null;
  const target = path.resolve(resolved.resolvedFileName);
  if (!target.startsWith(ROOT) || target.startsWith(path.join(ROOT, "node_modules"))) {
    return null;
  }
  return target;
}

function isWithin(target, directory) {
  const rel = path.relative(directory, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function featureIndex(feature) {
  return path.join(ROOT, "src", "features", feature, "index.ts");
}

function countLines(text) {
  if (!text) return 0;
  return text.split("\n").length;
}

function versionFromAppJson() {
  try {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, "app.json"), "utf8"));
    return app?.expo?.version ?? null;
  } catch {
    return null;
  }
}

export function analyze() {
  const files = sourceFiles();
  const nodes = [];
  const edges = [];
  const violations = [];
  const warnings = [];
  const edgeCounts = new Map();
  const edgeOccurrences = new Map();

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const node = {
      id: relative(file),
      zone: zoneOf(file),
      feature: featureOf(file),
      kind: fileKind(file),
      lines: countLines(text),
      exports: collectExports(sourceFile),
    };
    nodes.push(node);

    for (const { specifier, kind, typeOnly, bindings } of collectModuleSpecifiers(sourceFile)) {
      const target = resolveModule(specifier, file);
      if (!target || target === file) continue;
      const from = relative(file);
      const to = relative(target);
      const edgeIdentity = `${from}\0${to}\0${kind}\0${specifier}`;
      const occurrence = (edgeOccurrences.get(edgeIdentity) ?? 0) + 1;
      edgeOccurrences.set(edgeIdentity, occurrence);
      const id = [
        "edge",
        encodeURIComponent(from),
        encodeURIComponent(to),
        kind,
        encodeURIComponent(specifier),
        occurrence,
      ].join(":");
      edges.push({ id, from, to, kind, typeOnly, specifier, bindings });

      const fromZone = node.zone;
      const toZone = zoneOf(target);
      const fromFeature = node.feature;
      const toFeature = featureOf(target);
      const key = `${fromZone}->${toZone}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);

      const isFeatureIndex = toFeature !== null && /\/index\.tsx?$/.test(to);
      if (fromZone === "app" && toZone === "features" && !isFeatureIndex) {
        violations.push({
          rule: "app-feature-deep-import",
          from,
          to,
          message: "app may import a feature only through its index.ts",
        });
      }
      if (
        fromZone === "composition" &&
        toZone === "features" &&
        !isFeatureIndex
      ) {
        violations.push({
          rule: "composition-feature-deep-import",
          from,
          to,
          message: "composition may import a feature only through its index.ts",
        });
      }
      if (
        fromZone === "features" &&
        toZone === "features" &&
        fromFeature !== toFeature &&
        !isFeatureIndex
      ) {
        violations.push({
          rule: "cross-feature-deep-import",
          from,
          to,
          message: "cross-feature imports must use the public index.ts",
        });
      }
      if (fromZone === "shared" && (toZone === "features" || toZone === "core")) {
        violations.push({
          rule: "shared-import-upward",
          from,
          to,
          message: "shared must not import features or core",
        });
      }
      if (fromZone === "core" && toZone === "features") {
        violations.push({
          rule: "core-import-feature",
          from,
          to,
          message: "core must not import features",
        });
      }
      if (
        fromZone === "platform" &&
        (toZone === "features" || toZone === "core")
      ) {
        violations.push({
          rule: "platform-import-upward",
          from,
          to,
          message: "platform must not import features or core",
        });
      }
      if (fromZone === "features" && toZone === "composition") {
        violations.push({
          rule: "feature-import-composition",
          from,
          to,
          message: "features must not import composition",
        });
      }
      if (toZone === "composition" && fromZone !== "app" && fromZone !== "composition") {
        violations.push({
          rule: "composition-imported-by-lower-zone",
          from,
          to,
          message: "composition is the top-level composition layer",
        });
      }
      if (target === path.join(ROOT, "node_modules")) {
        warnings.push({ from, specifier });
      }
    }
  }

  // Simple cycle detection over file-level edges.
  const adjacency = new Map(files.map((file) => [relative(file), []]));
  for (const edge of edges) {
    if (adjacency.has(edge.from)) adjacency.get(edge.from).push(edge.to);
  }
  let index = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];
  const visit = (node) => {
    indices.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const next of adjacency.get(node) ?? []) {
      if (!indices.has(next)) {
        visit(next);
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
      if (component.length > 1) cycles.push(component.sort());
    }
  };
  for (const node of adjacency.keys()) {
    if (!indices.has(node)) visit(node);
  }

  const zones = {};
  const features = {};
  for (const node of nodes) {
    const zone = (zones[node.zone] ??= {
      files: 0,
      lines: 0,
      dependencies: 0,
    });
    zone.files += 1;
    zone.lines += node.lines;
    if (node.feature) {
      const feature = (features[node.feature] ??= {
        files: 0,
        lines: 0,
        publicEntry: relative(featureIndex(node.feature)),
      });
      feature.files += 1;
      feature.lines += node.lines;
    }
  }
  for (const edge of edges) {
    const zone = zones[zoneOf(path.join(ROOT, edge.from))];
    if (zone) zone.dependencies += 1;
  }

  const graph = {
    schemaVersion: 2,
    generatedBy: "scripts/generate-architecture-docs.mjs",
    appVersion: versionFromAppJson(),
    sourceRoots: SOURCE_ROOTS,
    zones,
    features,
    nodes,
    edges,
    cycles,
    violations,
    warnings,
    counts: {
      files: nodes.length,
      edges: edges.length,
      zones: Object.keys(zones).length,
      features: Object.keys(features).length,
    },
  };

  return { graph, nodes, edges };
}

export function declarationExports(node) {
  const names = [];
  if (ts.isFunctionDeclaration(node) && node.name) names.push(node.name.text);
  if (ts.isClassDeclaration(node) && node.name) names.push(node.name.text);
  if (ts.isInterfaceDeclaration(node) && node.name) names.push(node.name.text);
  if (ts.isTypeAliasDeclaration(node) && node.name) names.push(node.name.text);
  if (ts.isEnumDeclaration(node) && node.name) names.push(node.name.text);
  if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
    names.push(node.name.text);
  }
  if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
    }
  }
  const exported = node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
  if (!exported) return [];
  const isDefault = node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
  );
  if (isDefault) {
    return [
      binding(
        "default",
        "default",
        "default",
        ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node),
      ),
    ];
  }
  return names.map((name) =>
    binding(
      name,
      name,
      "declaration",
      ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node),
    ),
  );
}

export function collectExports(sourceFile) {
  const exports = [];
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (!statement.moduleSpecifier) {
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const element of statement.exportClause.elements) {
            exports.push(
              binding(
                moduleNameText(element.propertyName ?? element.name),
                element.name.text,
                "local",
                statement.isTypeOnly || element.isTypeOnly,
              ),
            );
          }
        }
        continue;
      }
      exports.push(...exportBindings(statement));
      continue;
    }
    if (ts.isExportAssignment(statement)) {
      exports.push(binding("default", "default", "default", false));
      continue;
    }
    exports.push(...declarationExports(statement));
  }
  exports.sort((a, b) => {
    const left = `${a.alias}\0${a.name}`;
    const right = `${b.alias}\0${b.name}`;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
  return exports;
}

export function apiSurface(nodes) {
  const entries = [];
  for (const node of nodes) {
    if (node.kind !== "barrel") continue;
    const file = path.join(ROOT, node.id);
    const text = fs.readFileSync(file, "utf8");
    const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    for (const statement of sourceFile.statements) {
      if (ts.isExportDeclaration(statement)) {
        const specifier = statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : null;
        const clause = statement.exportClause;
        if (clause && ts.isNamedExports(clause)) {
          for (const element of clause.elements) {
            entries.push({
              entry: node.id,
              name: moduleNameText(element.propertyName ?? element.name),
              exportedAs: element.name.text,
              source: specifier,
              kind: "re-export",
              typeOnly: statement.isTypeOnly || element.isTypeOnly,
            });
          }
        } else if (specifier) {
          entries.push({
            entry: node.id,
            name: "*",
            exportedAs: clause && ts.isNamespaceExport(clause)
              ? clause.name.text
              : "*",
            source: specifier,
            kind: clause && ts.isNamespaceExport(clause)
              ? "namespace-re-export"
              : "star-re-export",
            typeOnly: statement.isTypeOnly,
          });
        }
      }
      if (ts.isExportAssignment(statement)) {
        entries.push({
          entry: node.id,
          name: "default",
          exportedAs: "default",
          source: null,
          kind: "default-export",
          typeOnly: false,
        });
      }
      for (const exported of declarationExports(statement)) {
        entries.push({
          entry: node.id,
          name: exported.name,
          exportedAs: exported.alias,
          source: null,
          kind: exported.kind === "default" ? "default-export" : "declaration",
          typeOnly: exported.typeOnly,
        });
      }
    }
  }
  entries.sort((a, b) => {
    const left = `${a.entry}\0${a.exportedAs}`;
    const right = `${b.entry}\0${b.exportedAs}`;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
  return {
    schemaVersion: 2,
    generatedBy: "scripts/generate-architecture-docs.mjs",
    appVersion: versionFromAppJson(),
    entries,
    counts: { entries: entries.length },
  };
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function main() {
  const check = process.argv.includes("--check");
  const { graph, nodes } = analyze();
  const api = apiSurface(nodes);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (check) {
    const currentGraph = readJson(GRAPH_FILE);
    const currentApi = readJson(API_FILE);
    const graphStale = stableJson(currentGraph) !== stableJson(graph);
    const apiStale = stableJson(currentApi) !== stableJson(api);
    if (graphStale || apiStale) {
      console.error("Generated architecture docs are stale. Run npm run docs:graph.");
      if (graphStale) console.error(`- ${relative(GRAPH_FILE)}`);
      if (apiStale) console.error(`- ${relative(API_FILE)}`);
      process.exit(1);
    }
    console.log(`Architecture docs are current: ${graph.counts.files} files, ${graph.counts.edges} edges.`);
    return;
  }

  fs.writeFileSync(GRAPH_FILE, stableJson(graph));
  fs.writeFileSync(API_FILE, stableJson(api));
  console.log(`Wrote ${relative(GRAPH_FILE)} (${graph.counts.files} files, ${graph.counts.edges} edges).`);
  console.log(`Wrote ${relative(API_FILE)} (${api.counts.entries} exports).`);
  if (graph.cycles.length) {
    console.warn(`warning: ${graph.cycles.length} file-level cycle(s) detected.`);
  }
  if (graph.violations.length) {
    console.warn(`warning: ${graph.violations.length} boundary violation(s) detected.`);
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
