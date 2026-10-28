import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import ts from "typescript";

import {
  collectExports,
  collectModuleSpecifiers,
  declarationExports,
  exportBindings,
  importBindings,
  resolveModule,
} from "./generate-architecture-docs.mjs";

function parse(source, fileName = "fixture.ts") {
  return ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
  );
}

function statements(source, fileName) {
  return parse(source, fileName).statements;
}

function onlySpecifier(source) {
  return collectModuleSpecifiers(parse(source))[0];
}

function names(bindings) {
  return bindings.map(({ name, alias, kind, typeOnly }) => ({
    name,
    alias,
    kind,
    typeOnly,
  }));
}

test("default imports retain the exported symbol and local alias", () => {
  const importDeclaration = statements('import App from "./app";')[0];
  assert.deepEqual(names(importBindings(importDeclaration)), [
    { name: "default", alias: "App", kind: "default", typeOnly: false },
  ]);
  assert.deepEqual(onlySpecifier('import App from "./app";'), {
    specifier: "./app",
    kind: "import",
    typeOnly: false,
    bindings: [
      { name: "default", alias: "App", kind: "default", typeOnly: false },
    ],
  });
});

test("named, aliased and combined imports retain every binding", () => {
  const importDeclaration = statements(
    'import Default, { Foo, Bar as Baz } from "./module";',
  )[0];
  assert.deepEqual(names(importBindings(importDeclaration)), [
    { name: "default", alias: "Default", kind: "default", typeOnly: false },
    { name: "Foo", alias: "Foo", kind: "named", typeOnly: false },
    { name: "Bar", alias: "Baz", kind: "named", typeOnly: false },
  ]);
});

test("namespace imports are labelled with the namespace alias", () => {
  const importDeclaration = statements(
    'import * as theme from "./theme";',
  )[0];
  assert.deepEqual(names(importBindings(importDeclaration)), [
    { name: "*", alias: "theme", kind: "namespace", typeOnly: false },
  ]);
});

test("side-effect imports produce one explicit side-effect binding", () => {
  assert.deepEqual(onlySpecifier('import "./setup";'), {
    specifier: "./setup",
    kind: "import",
    typeOnly: false,
    bindings: [
      { name: "*", alias: "*", kind: "side-effect", typeOnly: false },
    ],
  });
});

test("dynamic import calls are captured", () => {
  assert.deepEqual(onlySpecifier('const module = import("./lazy");'), {
    specifier: "./lazy",
    kind: "dynamic",
    typeOnly: false,
    bindings: [{ name: "*", alias: "*", kind: "dynamic", typeOnly: false }],
  });
});

test("type-only imports mark both the edge and each binding", () => {
  assert.deepEqual(onlySpecifier('import type { Box, Point as P } from "./box";'), {
    specifier: "./box",
    kind: "import",
    typeOnly: true,
    bindings: [
      { name: "Box", alias: "Box", kind: "named", typeOnly: true },
      { name: "Point", alias: "P", kind: "named", typeOnly: true },
    ],
  });
});

test("type-only named re-exports keep every symbol and alias", () => {
  const exportDeclaration = statements(
    'export type { Box, Point as P } from "./box";',
  )[0];
  assert.deepEqual(names(exportBindings(exportDeclaration)), [
    { name: "Box", alias: "Box", kind: "named", typeOnly: true },
    { name: "Point", alias: "P", kind: "named", typeOnly: true },
  ]);
});

test("star and namespace re-exports are distinguished", () => {
  assert.deepEqual(
    names(exportBindings(statements('export * from "./module";')[0])),
    [{ name: "*", alias: "*", kind: "star", typeOnly: false }],
  );
  assert.deepEqual(
    names(exportBindings(statements('export * as api from "./module";')[0])),
    [{ name: "*", alias: "api", kind: "namespace", typeOnly: false }],
  );
});

test("re-export statements carry their local module specifier", () => {
  assert.deepEqual(
    collectModuleSpecifiers(parse('export { Foo } from "./foo";')),
    [
      {
        specifier: "./foo",
        kind: "re-export",
        typeOnly: false,
        bindings: [
          { name: "Foo", alias: "Foo", kind: "named", typeOnly: false },
        ],
      },
    ],
  );
});

test("default function and class declarations export the default symbol", () => {
  for (const source of [
    "export default function App() {}",
    "export default class App {}",
  ]) {
    const declaration = statements(source)[0];
    assert.deepEqual(names(declarationExports(declaration)), [
      { name: "default", alias: "default", kind: "default", typeOnly: false },
    ]);
  }
});

test("declaration exports keep types separate from values", () => {
  const source = [
    "export type Shape = { width: number };",
    "export interface Options { enabled: boolean }",
    "export function render() {}",
    "export const width = 1, height = 2;",
  ].join("\n");
  const declarations = statements(source);
  assert.deepEqual(
    declarations.flatMap((declaration) => names(declarationExports(declaration))),
    [
      { name: "Shape", alias: "Shape", kind: "declaration", typeOnly: true },
      { name: "Options", alias: "Options", kind: "declaration", typeOnly: true },
      { name: "render", alias: "render", kind: "declaration", typeOnly: false },
      { name: "width", alias: "width", kind: "declaration", typeOnly: false },
      { name: "height", alias: "height", kind: "declaration", typeOnly: false },
    ],
  );
});

test("local named exports preserve aliases and statement-level type-only", () => {
  assert.deepEqual(
    names(collectExports(parse("const Box = 1; export { Box };"))),
    [{ name: "Box", alias: "Box", kind: "local", typeOnly: false }],
  );
  assert.deepEqual(
    names(collectExports(parse("type Box = {}; type Point = {}; export type { Box, Point as P };"))),
    [
      { name: "Box", alias: "Box", kind: "local", typeOnly: true },
      { name: "Point", alias: "P", kind: "local", typeOnly: true },
    ],
  );
});

test("export assignments appear as default exports", () => {
  assert.deepEqual(
    names(collectExports(parse("const value = 1; export default value;"))),
    [{ name: "default", alias: "default", kind: "default", typeOnly: false }],
  );
});

test("library, CSS and external modules are not resolved into local edges", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mangora-graph-"));
  const containingFile = path.join(directory, "entry.ts");
  fs.writeFileSync(containingFile, "");
  try {
    for (const specifier of ["react", "expo", "lucide-react-native", "./style.css", "../outside"]) {
      assert.equal(resolveModule(specifier, containingFile), null, specifier);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
