# System map

This page connects the file-level view to the runtime. Read it when you know
what the app does but have not found the owning module yet.

## Route adapters

Routes are thin. They parse Expo Router params, inject navigation callbacks and
render a feature screen.

| Route | Renders | Notes |
| --- | --- | --- |
| `app/index.tsx` | Redirect | Boots into the Library tab. |
| `app/(tabs)/_layout.tsx` | Tab navigator | Library, History, Browse, Settings; fade transition respects reduced motion. |
| `app/(tabs)/library.tsx` | `@features/library` `LibraryScreen` | Library grid, sync and onboarding host. |
| `app/(tabs)/history.tsx` | History route composer | Reads `@core/db/repositories/historyRepository`. |
| `app/(tabs)/browse.tsx` | `BrowseExtensionsScreen` | Accepts `tab` and `query` params. |
| `app/(tabs)/settings.tsx` | `SettingsHomeScreen` | Landing list; sections have separate routes. |
| `app/extensions/source/[sourceId].tsx` | `ExtensionSourceScreen` | One source catalogue and filters. |
| `app/manga/[slug].tsx` | `MangaScreen` | Shared detail route; `provider` and `downloadsOnly` params select the source mode. |
| `app/reader/[id].tsx` | `ReaderScreen` inside `ReaderSessionProvider` | Shared chapter reader for every extension source. |
| `app/downloads/index.tsx` | Download manager | Downloads grouped by source. |
| `app/downloads/[mangaId].tsx` | Downloaded-series view | Offline chapters for one title. |
| `app/settings/display.tsx` ... | Settings section screens | Thin adapters; `app/settings/_layout.tsx` is a headerless stack. |

The root stack lives in `app/_layout.tsx`. Source detail, manga, reader and
download routes are outside the tab shell so they use the full screen.

## Composition and startup

| Path | Owns |
| --- | --- |
| `src/composition/providers/appServices.ts` | Frozen, identity-stable service objects passed to the root provider. |
| `src/composition/providers/bootstrapRuntime.ts` | Database startup, abandoned-artifact cleanup, scheduler start, background refreshes and foreground throttle. |
| `src/composition/providers/AppBootstrapGate.tsx` | Loading/ready/error gate, splash hide and retry. |
| `src/composition/navigation/manga.ts` | Navigation callback that opens the shared manga route without importing feature internals. |
| `src/shared/runtime/AppServicesProvider.tsx` | Typed context for `AppServices`. |
| `src/shared/runtime/OverlayHostProvider.tsx` | Root registry for feature-owned overlays. |

See [runtime/startup-and-composition.md](runtime/startup-and-composition.md)
for ordering and failure policy.

## Feature public entry points

Every slice exposes a small `index.ts`. Use these imports, not deep paths, from
another feature, composition or a route.

| Import | Public role |
| --- | --- |
| `@features/downloads` | Download catalog/queue controls, storage policy, offline reader/session ports and download UI. |
| `@features/extensions` | Repository/catalog loading, filters, registry subscriptions, installation helpers and browse screens. |
| `@features/library` | Library screen, membership tracking and history integration. |
| `@features/manga` | Manga source adapter and shared chapter/viewer contracts; the detail screen is route-owned. |
| `@features/reader` | Reader screen/session, paged/strip views and reader domain types. |
| `@features/settings` | Settings screens and the `useAppSettings` external-store hook. |
| `@features/translation` | Language/engine contracts, translation pipeline, quota, lock and pre-translate queue. |
| `@features/updates` | Release checking, APK download/installation state. |
| `@features/vision` | Detection, segmentation, OCR and model management. |

## Core modules

| Directory | Owns |
| --- | --- |
| `src/core/catalog` | Canonical provider-qualified identity, provider adapters, catalog sync and extension page loading. |
| `src/core/db` | SQLite client, Drizzle schema/migrations, repositories, backup/restore and bootstrap. |
| `src/core/settings` | Settings schema/defaults, JSON store, reader chrome settings, backup and storage accounting. |
| `src/core/storage` | Picked SAF root, naming, SAF operations and legacy reader-cache cleanup. |
| `src/core/images` | Decodability checks and AVIF-to-PNG transcoding. |
| `src/core/net` | Browser/network fetch helpers. |
| `src/core/platform` | Notification setup and permission policy. |

## Platform bridges

| Directory | Owns |
| --- | --- |
| `src/platform/extensions` | Typed facade over `NativeModules.MangoraExtensions`; parses JSON at the boundary so opaque source ids stay strings. |
| `src/platform/native` | Typed updater/installer bridge over `MangoraDownloader`. |

Downloader SAF/archive/foreground-service calls are feature-owned in
`src/features/downloads/adapters/nativeDownloader.ts`; they are not in the
platform zone because their shapes are download policy.

## Shared infrastructure

| Directory | Owns |
| --- | --- |
| `src/shared/contracts` | Ports (`AppServices`, `DownloadSessionPort`, notification ports, `TranslationEngine`, viewer contracts). |
| `src/shared/runtime` | Root service and overlay composition. |
| `src/shared/motion` and `shared/ui/motion` | Reduced-motion policy and motion primitives. |
| `src/shared/ui` | Product-agnostic feedback, interaction, layout, navigation and overlay primitives. |
| `src/shared/theme` | Colors, spacing, radii and shadows. |
| `src/shared/geometry` | `Box`/`Point` coordinate vocabulary. |
| `src/shared/net` | Extension image-header registry. |
| `src/shared/async` | Generic serial/work queue helpers. |

## Native source map

Canonical Kotlin and config plugins live under `plugins/`. They are copied into
the generated `android/` tree by config plugins during prebuild/build. The
generated copies are build products, not edit targets.

| Canonical source | Purpose |
| --- | --- |
| `plugins/android/extensionhost/` | Mihon/Keiyoushi extension host and compatibility shims. |
| `plugins/android/downloader/` | SAF/ZIP operations, installer/updater helpers and foreground download service. |
| `plugins/android/avifdecoder/` | AVIF-to-PNG transcoder. |
| `plugins/android/subsampling/` | Tiled long-strip image view and React Native package. |

See [native/config-plugins.md](native/config-plugins.md) and
[native/native-modules.md](native/native-modules.md).

## Generated artifacts

- `docs/architecture/generated/dependency-graph.json` - file nodes with their
  exports, symbol-level import/re-export bindings, zones, feature aggregates,
  cycles and boundary findings.
- `docs/architecture/generated/api-surface.json` - public entry-point exports,
  public aliases, type-only markers and their source locations.

The graph generator is the authority; do not hand-edit these JSON files. See
[operations/documentation-and-graph.md](operations/documentation-and-graph.md).

## Change paths

| Change | First files to read | Validation |
| --- | --- | --- |
| Route/param shape | `app/**`, feature screen props | Type check, navigation on device |
| Feature boundary | `src/features/*/index.ts`, `scripts/check-architecture.mjs` | `npm run check:arch` |
| Database/schema | `src/core/db/schema.ts`, migrations, repositories | `npm run check`, migration test on existing DB |
| Settings | `src/core/settings/*`, settings sections | `npm run check`, settings contract test |
| Reader/gesture | reader domain/views/hooks | Static checks plus device smoke test |
| Download/storage | downloads storage/queue/sessions, `src/core/storage` | On-device SAF/archive test |
| Translation/OCR | translation pipeline, vision, reader translation | Static checks plus real-page device test |
| Native module/plugin | `plugins/**`, matching config plugin | Clean prebuild/build and device test |

## Related reading

- [Overview](overview.md)
- [Runtime composition](runtime/startup-and-composition.md)
- [Persistence](runtime/persistence-and-storage.md)
- [Contracts](contracts/shared-ports.md)
- [Data model](contracts/data-model.md)
