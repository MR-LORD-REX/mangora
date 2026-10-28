# Architecture overview

Mangora is an Expo SDK 54 / React Native Android reader and optional translation
client. It has no built-in content catalog. Users add extension repositories and
install compatible Mihon/Keiyoushi-style extensions; the app provides one shared
manga page, reader, library, downloader and translation pipeline for every
installed source.

## One-screen mental model

```text
Expo Router route
    -> feature screen
        -> feature hook / state
            -> shared port or core service
                -> platform facade
                    -> native Android module or network endpoint
```

The app is organised by product capability, not by file type. A feature owns its
screens, components, hooks, domain rules and data adapters. Cross-feature code
uses the owning feature's `index.ts`; there are no deep cross-feature imports and
no compatibility trees.

## Runtime at a glance

`app/_layout.tsx` is a small composition root:

```text
GestureHandlerRootView
  ThemeProvider
    MotionProvider
      AppServicesProvider (identity-stable services)
        AppBootstrapGate (database loading / ready / error)
          OverlayHostProvider
            Stack
            DownloadSheetHost
```

The startup gate opens SQLite, clears abandoned temporary artifacts and starts
the download scheduler before routes render. One-time background refreshes and
the pre-translate queue are started only after the database is ready. See
[runtime/startup-and-composition.md](runtime/startup-and-composition.md) for the
exact order and failure policy.

## Zones and ownership

| Zone | Owns | May import |
| --- | --- | --- |
| `app/` | Expo Router adapters, route params and composition | `@composition/*`, feature public entry points, `@shared/*`, `@core/*`, `@platform/*` |
| `src/composition/` | Root services, startup, navigation policy | Feature public entry points, shared/core/platform |
| `src/features/<name>/` | One product capability | Own files, shared/core/platform, other features through their public entry point |
| `src/core/` | Database, settings, catalog, storage, images, network policy | Shared/platform and other core modules |
| `src/platform/` | Typed native bridge facades | Shared and other platform modules |
| `src/shared/` | Product-agnostic UI, contracts, geometry, theme, runtime, motion | Third-party packages and shared modules only |
| `plugins/` | Canonical Expo config plugins and Kotlin sources | Not imported by JavaScript |

The enforced dependency direction is downward. `shared` never imports a feature,
`core` never imports React screens, and no source imports a generated file under
`android/`. See [boundaries.md](boundaries.md) for the import checker and the
feature-extension recipe.

## Feature slices

| Slice | Responsibility | Start with |
| --- | --- | --- |
| `downloads` | Download catalog, queue, SAF/archive storage, recovery and offline page sessions | [features/downloads.md](features/downloads.md) |
| `extensions` | Repository catalog, installed source registry, filters and APK installation | [features/extensions.md](features/extensions.md) |
| `library` | Library membership, cards, filters, sync and reading tracking | [features/library-and-manga.md](features/library-and-manga.md) |
| `manga` | Shared manga detail page, chapter list and provider source adapters | [features/library-and-manga.md](features/library-and-manga.md) |
| `onboarding` | First-launch guide overlay and session snooze | [features/settings-and-updates.md](features/settings-and-updates.md) |
| `reader` | Paged/strip presentation, gestures, progress, downloads and translations | [features/reader.md](features/reader.md) |
| `settings` | Settings landing pages, sections and the settings hook | [features/settings-and-updates.md](features/settings-and-updates.md) |
| `translation` | Translation engines, cache, quota, lock and pre-translate queue | [features/translation-and-vision.md](features/translation-and-vision.md) |
| `updates` | GitHub release feed, APK verification and installer handoff | [features/settings-and-updates.md](features/settings-and-updates.md) |
| `vision` | YOLO detection, bubble segmentation, PP-OCR and model management | [features/translation-and-vision.md](features/translation-and-vision.md) |

## Data and native boundaries

Structured app data lives in SQLite through Drizzle. Settings are primarily a
JSON file under `trapp-settings/` and are mirrored into `app_settings` on a
best-effort basis. Downloads are written to a user-selected SAF root and
recoverable through `downloads/metadata/metadata.json`; SQLite remains the fast
operational index. The canonical native sources live in `plugins/`, with copies
materialised into the generated `android/` tree by config plugins.

Read [runtime/persistence-and-storage.md](runtime/persistence-and-storage.md) and
[native/config-plugins.md](native/config-plugins.md) before changing storage or
native code.

## Where to go next

- [System map](system-map.md) - routes, feature entry points and runtime edges.
- [Boundaries](boundaries.md) - what may import what, and how to add a feature.
- [Contracts](contracts/shared-ports.md) - shared ports and identity rules.
- [Data model](contracts/data-model.md) - tables, ownership and invariants.
- [Operations](operations/build-and-release.md) - build, validation and release.
- [Generated graph](graph/README.md) - JSON shape, regeneration and website plan.