# Documentation and graph operations

This page defines how the architecture docs stay trustworthy as the app changes.
Documentation is part of the change surface: a route, public export, table,
provider port or native plugin is not complete until its page and generated
inventory are current.

## What is generated

`scripts/generate-architecture-docs.mjs` scans `src/**` and `app/**` and writes:

- `docs/architecture/generated/dependency-graph.json` - schema v2 file nodes
  with exports, symbol-level import/re-export bindings, zone/feature aggregates,
  cycles and boundary findings;
- `docs/architecture/generated/api-surface.json` - schema v2 exported names from
  barrels, including type-only markers and public aliases.

The scan excludes `node_modules`, generated `android/`, build output, assets and
the generated docs directory. It uses the TypeScript compiler API and resolves
the `@composition`, `@shared`, `@core`, `@features` and `@platform` aliases.
Bare packages (`react`, `expo`, `lucide-react-native` and so on), CSS imports
and files outside the repository are deliberately excluded; the graph describes
app-owned imports rather than third-party dependencies. Each import or re-export
declaration becomes one edge with a `bindings` list, so a UI can show the exact
symbols without conflating two declarations between the same files.

## Commands

```powershell
npm run docs:graph
npm run docs:check
npm run docs:test
npm run docs:links
```

`docs:test` runs synthetic parser fixtures for default, named, aliased,
namespace, side-effect, dynamic, type-only, star and declaration imports/exports.
`docs:check` does not rewrite files; it exits `1` with the stale paths.
`docs:links` checks every relative Markdown link in `docs/`, feature READMEs and
the public root documents and exits non-zero for a broken target. Use both in PR
CI and at release time. Generated JSON is deterministic and contains no
commit hash or dirty-worktree flag; release provenance belongs to the publisher.
See [graph/README.md](../graph/README.md) for the JSON shape and the website
explorer plan.

## When to update which page

| Change | Update |
| --- | --- |
| New route/param | `runtime/navigation.md`, `system-map.md` |
| New feature/slice or public export | `boundaries.md`, feature page, `system-map.md` |
| New provider/service port | `contracts/shared-ports.md`, `runtime/startup-and-composition.md` when wired |
| New table/column/migration | `contracts/data-model.md`, `runtime/persistence-and-storage.md` |
| Settings default/validation | feature settings page, `runtime/state-and-providers.md` |
| Reader gesture/layout change | `features/reader.md`, reader smoke checklist |
| Download/storage change | `features/downloads.md`, `runtime/persistence-and-storage.md` |
| OCR/translation engine change | `features/translation-and-vision.md`, `runtime/native-and-network.md` |
| Native module/config plugin | `native/config-plugins.md`, `native/native-modules.md` |
| Build/release/CI change | `operations/build-and-release.md` |
| New long-lived architectural decision | a new ADR in `adr/`, link from the relevant page |

Do not copy release notes into architecture pages. Release notes describe what
changed for a user; an architecture page describes the current contract.

## Release automation

The website is a separate repository. A release should publish a stable snapshot
of the generated docs rather than relying on a sibling checkout. Choose one of
these contracts and document the choice in the website repo:

1. **Checked-in snapshot (recommended for reviewability):** commit the two
   generated JSON files whenever source imports exports change. The website build
   fetches the files from the tagged/default branch.
2. **Release artifact:** in `.github/workflows/android-release.yml`, run
   `npm run docs:graph` after checkout and upload the generated directory as an
   artifact. The website deploy downloads that artifact.
3. **Bot commit on release:** run the generator and commit only the generated
   files with `github-actions[bot]`. Prevent loops and never rewrite unrelated
   files.

Whichever option is used, keep an app-side `docs:check` before release so a stale
snapshot cannot silently ship. If a bot commit is added, make the workflow
idempotent and restrict its `git add` to `docs/architecture/generated/`.

## Docs website contract

- `docs/appguide/` is the future user-guide source for `/android/docs`.
- `docs/architecture/` is the developer guide for `/android/dev/docs`.
- `docs/architecture/generated/dependency-graph.json` powers
  `/android/dev/graph`.
- Use relative Markdown links inside the repository; the renderer should resolve
  them to website routes.
- The site should expose a visible app-version/schema-version label from the JSON
  metadata, and may attach its deployment commit separately.
- A generated schema version bump must be coordinated with the website renderer.

The app docs do not import website React components or Tailwind classes. Keep the
content portable.

## Removing or retiring a document

Only remove a doc after its durable information has moved somewhere with a clear
owner. Keep release notes, third-party notices, the public README and feature
READMEs unless they become actively misleading. The architecture landing page and
the old context page are superseded by this tree; their durable content is now in
the overview, state/provider and runtime pages.

Do not delete a feature README merely because a high-level page links to it; it
is the local debugging/ownership note for the code beside it.

## Validation of docs

Before calling a documentation change complete:

- [ ] `npm run docs:links` passes;
- [ ] commands are correct for PowerShell/CI;
- [ ] generated files are refreshed with `npm run docs:graph`;
- [ ] `npm run docs:check` passes;
- [ ] `npm run docs:test` passes;
- [ ] no page claims a route/table/export that is not in the source;
- [ ] no page links the old root plan;
- [ ] reader/native pages include device validation, not only static checks.

## Related reading

- [Documentation home](../../README.md)
- [Graph](../graph/README.md)
- [Validation](validation-and-qa.md)
- [Build and release](build-and-release.md)
