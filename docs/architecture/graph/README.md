# Dependency graph

The architecture graph is generated from the TypeScript/JavaScript source tree.
It is the data source for the `/android/dev/graph` explorer on the Mangora
website; it is not a hand-drawn diagram.

## Generated files

| File | Contents |
| --- | --- |
| `docs/architecture/generated/dependency-graph.json` | Schema v2, app version, zone/feature aggregates, file nodes with exports, symbol-level import edges, cycles and boundary findings. |
| `docs/architecture/generated/api-surface.json` | Schema v2, public entry-point exports with their source module and export kind. |

Both files are deterministic JSON with a trailing newline. The generator is
`scripts/generate-architecture-docs.mjs`.

## Regenerate and check

```powershell
npm run docs:graph
npm run docs:check
npm run docs:test
```

`docs:graph` writes the snapshots. `docs:test` exercises the parser with
synthetic fixtures for every supported import/export form. `docs:check`
regenerates in memory and exits non-zero if either checked-in file is stale. Use
all three in PR CI and the first two as a release gate. Do not manually edit the
JSON files.

The snapshot deliberately excludes commit hashes and worktree status. Those
values change without a source-interface change and would make `docs:check`
fail after every commit. The release or website layer may attach provenance
separately when publishing.

## JSON contract

Top-level `dependency-graph.json` fields:

```text
schemaVersion  2
generatedBy      script path
appVersion       app.json expo.version
sourceRoots      ["src", "app"]
zones            aggregate files/lines/dependencies by zone
features         aggregate files/lines/publicEntry by feature
nodes            [{ id, zone, feature, kind, lines, exports }]
edges            [{ id, from, to, kind, typeOnly, specifier, bindings }]
cycles           [[file ids]]
violations       [{ rule, from, to, message }]
warnings         [{ from, specifier }]
counts           { files, edges, zones, features }
```

Node ids and edge endpoints are repository-relative, forward-slash paths. A
node's `exports` array uses `{ name, alias, kind, typeOnly }`, where `name` is
the original or imported symbol and `alias` is the name exported from that file.
`kind` is `declaration`, `default`, `named`, `namespace`, `star` or `local`.

Each edge is one import, re-export or dynamic-import declaration that resolves to
a file inside the repository. An edge has `{ id, from, to, kind, typeOnly,
specifier, bindings }`:

- `kind` is `import`, `re-export` or `dynamic`;
- `typeOnly` is true when the declaration is `import type` or `export type`;
- `bindings` is an array of `{ name, alias, kind, typeOnly }`, where `name` is the
  source symbol, `alias` is the local imported name or exported name, and
  `kind` is `default`, `named`, `namespace`, `side-effect`, `star` or `dynamic`;
- `id` is deterministic and unique, so React Flow can use it directly even when
  two declarations share the same source and target.

One declaration produces one edge, not one edge per symbol. For example, a named
import of `Foo` and `Bar as Baz` is a single edge with two bindings. The website
should aggregate its label from bindings, such as `Foo, Bar as Baz`, truncated
to `Foo, Bar +1` when space is limited, and show the complete binding list in the
edge/selection panel.

`api-surface.json` contains `schemaVersion: 2` and an `entries` array of
`{ entry, name, exportedAs, source, kind, typeOnly }` objects. `name` is the
original symbol, `exportedAs` is the public alias, and `typeOnly` separates type
contracts from runtime exports.

Resolution is intentionally limited to relative imports and the project aliases
`@composition/*`, `@shared/*`, `@core/*`, `@features/*` and `@platform/*`.
Libraries and tooling packages (`react`, `expo`, `lucide-react-native` and so on)
are excluded, as are CSS imports, `node_modules`, and files outside the
repository. The graph describes app-owned boundaries, not third-party
dependencies.

The graph is deliberately library-neutral. A website can use React Flow, Cytoscape,
Sigma or another renderer without asking the app generator to emit a renderer-
specific format.

## Website explorer

The website renders this snapshot as an interactive file dependency board with
`@xyflow/react`. Each node is a source file; each directed edge is one import,
re-export or dynamic-import declaration. The arrow points from the importing file
to the imported file. Edge hover shows every binding name, and edge selection shows
the declaration kind, type-only marker and specifier. Selecting a file focuses the
board on its direct imports and importers and opens its exports and public API
entries. Search, zone, feature and edge filters are shareable URL parameters.

The initial board shows up to 24 prominent files, prioritizing a connected
neighborhood. A selected file shows up to 40 files including itself and its
direct neighbors. This keeps the large snapshot usable on
mobile; narrower searches and file selection reveal other files. ELK.js lays out
the visible subgraph. The generated JSON stays renderer-neutral and contains the
full snapshot. The site checks `schemaVersion` before rendering.

The website consumes the synchronized checked-in snapshot under
`mangoraweb/content/generated/docs/android/architecture/generated/`. Run
`npm run content:sync` in the website repository after changing these files.
Never hand-write board nodes or edge keys: use `node.id` and `edge.id` from this
schema, including when multiple declarations connect the same pair of files.
External packages, CSS imports and files outside the repository remain excluded.

## Release automation

The app repository and website are separate repositories. Use one of these
explicit contracts:

1. **Checked-in snapshot:** run `npm run docs:graph` on the default branch after
   a release-affecting merge, commit the two JSON files, and let the website build
   fetch them from GitHub raw content. This is the simplest and most auditable
   option.
2. **Release artifact:** upload the generated directory as an artifact from the
   Android release workflow. The website deployment downloads and publishes that
   artifact. This avoids committing changing metadata on every release but needs
   an artifact-fetch/copy step.
3. **Bot commit from release:** after checkout in the release workflow, run the
   generator and commit only the generated files with `github-actions[bot]`.
   This keeps the snapshot close to the release tag but must guard against loops
   and should not rewrite unrelated files.

The recommended default is option 1 for reviewability, with option 2 used if
website deploys should not depend on a latest-branch checkout. In either case,
`npm run docs:check` must fail when the snapshot is stale.

## Adding a node/edge type

Update `scripts/generate-architecture-docs.mjs` and its schema version first,
then update the website renderer. Do not add one-off fields in the website that
the generator does not own. Add a fixture/spec for a new edge kind if the renderer
must distinguish it.

## Related reading

- [System map](../system-map.md)
- [Boundaries](../boundaries.md)
- [Documentation and graph operations](../operations/documentation-and-graph.md)
