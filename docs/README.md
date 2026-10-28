# Mangora documentation

This directory is the contributor-facing documentation set for the Android app.
It separates product guidance from implementation contracts so the same source
can later be rendered on the website without maintaining two copies.

## Start here

| Audience | Entry point | Purpose |
| --- | --- | --- |
| New contributor | [Architecture overview](architecture/overview.md) | The app's mental model, runtime layers and first files to read. |
| Feature developer | [Architecture boundaries](architecture/boundaries.md) | Zone ownership, import direction and feature public contracts. |
| Reader or native developer | [Reader architecture](architecture/features/reader.md) | Reader view model, gestures, image path and device validation. |
| Release maintainer | [Build and release](architecture/operations/build-and-release.md) | Local builds, CI, APK variants and release gates. |
| Documentation maintainer | [Documentation plan](plan.md) | Phased documentation, website and graph work. |

The stable runtime and contract pages are the first place to check when a change
crosses a feature boundary:

- [Startup and composition](architecture/runtime/startup-and-composition.md)
- [State and providers](architecture/runtime/state-and-providers.md)
- [Navigation](architecture/runtime/navigation.md)
- [Persistence and storage](architecture/runtime/persistence-and-storage.md)
- [Native and network](architecture/runtime/native-and-network.md)

Feature READMEs stay beside their code for local ownership and debugging notes.
Architecture pages explain contracts and flows that span more than one feature.

## Documentation layout

```text
docs/
  README.md                    this index
  plan.md                      phased docs, website and graph delivery plan
  appguide/                    planned user-facing guides for /android/docs
  architecture/                developer guide for /android/dev/docs
    generated/                 generated dependency and API snapshots
    graph/                     graph contract and website explorer design
    adr/                       architecture decision records
  qa/                          index into the canonical validation checklist
```

## Documentation rules

- Write for a contributor who has the repository checked out but has never seen
  the app. Define terms on first use and link to the owning source file.
- Describe the current implementation, not a wish list. Planned work belongs in
  [plan.md](plan.md).
- Keep each page scoped to one question. Prefer precise links over duplicating a
  feature README or the public project README.
- Source paths are repository-relative and use forward slashes. Link canonical
  sources under `plugins/` and `src/`, never generated `android/` copies.
- Provider and chapter ids are opaque values. Never document reconstructing an
  extension's identity from a display title.
- Update the owning page in the same change as the contract it documents. A
  long-lived architectural choice needs an ADR.
- The generated graph is produced by `npm run docs:graph`; do not edit
  [`generated/dependency-graph.json`](architecture/generated/dependency-graph.json)
  or [`generated/api-surface.json`](architecture/generated/api-surface.json) by hand.
  Both use schema version 2: file nodes carry their exports, and each
  import/re-export edge carries its symbol bindings.

## Website audience split

The planned website routes are:

- `/android/docs` - user-facing setup and usage guides sourced from
  [`appguide/`](appguide/README.md).
- `/android/dev/docs` - this architecture set, rendered from
  [`architecture/`](architecture/README.md).
- `/android/dev/graph` - the interactive dependency explorer backed by
  [`generated/dependency-graph.json`](architecture/generated/dependency-graph.json).

The app docs remain plain Markdown with relative links so a static site can render
them without a second source of truth. See
[documentation and graph operations](architecture/operations/documentation-and-graph.md)
for the publication contract.

## Related repository documents

- [Public README](../README.md) - project overview, downloads, security scans and
  license.
- [Third-party notices](../THIRD-PARTY.md) - libraries, models, services and
  licensing caveats.
- [Release notes](../releases/) - user-visible changes by version.
- [Architecture decisions](architecture/adr/) - decisions affecting boundaries or
  shared runtime contracts.

## Keeping this set current

A change that adds or removes a public feature export, a route, a persisted table,
a provider port or a native config plugin must update the corresponding page. Run
the following before opening a pull request:

```powershell
npm run docs:graph
npm run docs:check
npm run docs:test
npm run docs:links
npm run check
```

`npm run docs:test` exercises the graph parser, `npm run docs:check` verifies that
generated artifacts match the source tree, and `npm run docs:links` verifies
every relative Markdown link. The graph is a build artifact with a checked-in
snapshot, not a manually drawn diagram.
