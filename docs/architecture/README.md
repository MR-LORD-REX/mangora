# Mangora Architecture

This document is the contributor-facing summary of the structure defined in
`plan.md`. It describes where code belongs, which direction imports may flow,
and what a feature may expose to the rest of the app.

## Zone map

| Zone | Owns | May import |
| --- | --- | --- |
| `app/` | Expo Router files and route params only | `@composition/*`, feature public entry points, `@shared/*`, `@core/*`, `@platform/*` |
| `src/composition/` | App composition, providers, startup and navigation policy | Feature public entry points, `@shared/*`, `@core/*`, `@platform/*` |
| `src/features/<name>/` | One product capability and its UI, state, domain and data adapters | Its own files, `@shared/*`, `@core/*`, `@platform/*`, other features through their public entry point |
| `src/shared/` | Generic UI, theme, hooks, geometry and contracts with no product knowledge | Third-party packages and other `@shared/*` modules only |
| `src/core/` | Database, settings persistence, image decode, network and device policy | `@shared/*`, `@platform/*`, other `@core/*` modules |
| `src/platform/` | Native bridge contracts and implementations | `@shared/*`, other `@platform/*` modules |
| `plugins/` | Canonical Expo config plugins and Kotlin sources | Not imported by JavaScript |

Dependencies point downward. A shared component must not know what a manga,
chapter, reader page or download is. A core repository must not import React
screens. A platform bridge exposes typed capabilities, not feature policy.

## Feature anatomy

Every feature follows the same shape, adding only folders that contain code:

```text
src/features/<feature>/
  screens/       route-level composition
  components/    feature-owned presentation grouped by use
  hooks/         React state and lifecycle
  state/         providers and external-store adapters
  domain/        pure types, rules, sorting and validation
  data/          feature-specific loading and persistence
  adapters/      implementations of shared ports
  index.ts       the only public API
  README.md      ownership, contracts and testing notes
```

Import implementation files directly inside the owning feature. Import another
feature only as `@features/<name>`. Never use a deep cross-feature path.

## Import rules

1. Routes compose a feature screen; they do not contain feature business logic.
2. A feature's `index.ts` is its public contract. Export only what consumers use.
3. `shared` and `core` never import a feature or an Expo route.
4. `platform` never imports a feature. Feature adapters translate platform types
   into feature contracts.
5. No source file imports a generated file under `android/`.
6. Barrels outside a feature's public entry point are avoided. They hide cycles
   and make ownership unclear.
7. A feature may use a shared port (`ChapterSource`, `NotificationPort`,
   `DownloadSessionPort`) without importing the feature that implements it.

Run `npm run check:arch` after changing imports. The checker reports cycles,
forbidden zone edges, cross-feature deep imports and generated-native imports.

## Runtime composition

The root route is intentionally small:

```text
app/_layout.tsx
  -> AppServicesProvider
  -> AppBootstrapGate
  -> OverlayHostProvider
  -> Stack + feature-owned root hosts
```

Startup work is split into three explicit operations:

- `startAppRuntime()` opens the database and clears abandoned page artifacts.
- `startBackgroundServices(services)` runs one-time refreshes after the
  database is ready using stable services from `AppServicesProvider`.
- `refreshDownloadedMetadataOnForeground(services)` owns the throttled
  app-resume refresh.

Keep startup operations idempotent. A retry must be safe, and background failures
must not prevent the database-ready state from rendering the app.

## Adding a feature

1. Create `src/features/<name>/` with a README and an `index.ts`.
2. Define the feature's public types and contracts before moving UI.
3. Move the leaf data and domain modules first, then hooks, then components.
4. Migrate one caller per pull request and keep the old import shim until the
   final caller moves.
5. Add the feature to the architecture checker's allowed zones if it introduces
   a new top-level zone (features themselves are already covered).
6. Document the owner in `CODEOWNERS` after GitHub handles are confirmed.

Do not create empty scaffolding. A folder exists when it has an owner and code.

## Migration status and next safe cut

`vision`, `translation`, `downloads`, `extensions`, `library`, `manga`
and `settings` are completed slices. Each owns its domain, UI and public entry
point; the corresponding legacy service/component trees are removed.

Translation consumes downloads and notifications only through shared ports.
The composition root wires the adapters and starts the queue after notification
initialization, so there is no notification -> translation -> downloader cycle.

`downloads` is also complete. It owns the catalog, queue, archive/page storage,
metadata recovery, offline browsing, reader page sessions and download UI. The
public `@features/downloads` entry point replaces the old broad barrel; internal
files import concrete siblings and cross-feature callers never deep-import it.

The picked SAF root lives in `src/core/storage/root.ts` because downloads,
database backups and legacy reader cleanup share one directory grant. Feature
storage owns only its subdirectory and layout. Settings persistence stays in
`src/core/settings`; settings screens belong to the settings feature and may
consume the core store.

The shared runtime providers and external-store adapters are in place. Stable
service identities live in `AppServicesProvider`; hot queue, settings and
registry snapshots remain external stores.

The reader's pure domain cut is in place under `src/features/reader/domain/`.
It owns the two product views (`paged` and `strip`), geometry, display items
and tap-zone resolution; legacy reader files are compatibility re-exports for
now. `ReaderSessionProvider` owns reader-local page, chrome and loading state
and is already consumed by the route. The route is now a 54-line adapter and
the screen lives at `src/features/reader/screens/ReaderScreen.tsx`. Paged mode
uses `PagedReader` with the default `FlatList`; strip mode uses
`StripReader`, a custom `ScrollView` that mounts only the active world window.
The strip viewport now owns the shared world camera, viewport-level tap zones
and long-press page identity; while zoomed, camera pan is the only vertical pan
owner. The next cut is remaining large-screen decomposition, then hooks and
presentation; on-device page, gesture and translation validation still gates
removal of legacy paths.

## Validation

```powershell
npm run check
npx eslint <touched paths>
```

`npm run check` runs type checking, the architecture graph and every feature
test. `.github/workflows/pull-request.yml` also exports the Android bundle on
each pull request. Reader changes additionally require the
[device smoke test](../qa/reader-device-smoke.md); a passing static check does
not prove touch, zoom or overlay behavior.

Architecture decisions live in [adr/README.md](adr/README.md). Add an ADR when
a change affects a boundary, a shared runtime contract or the reader view
model.

Reader, native and on-device validation remain governed by `AGENTS.md`,
`workspace.md` and `APP.md`; passing a static check does not prove reader
gesture or overlay behaviour.
