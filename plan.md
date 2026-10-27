# Mangora Refactor Plan

Status: active, branch `refactor`
Last updated: 2026-10-27

This plan reorganizes the Expo/React Native app into feature slices with explicit
runtime boundaries. It preserves the existing reader, extension, cache,
translation and download behaviour while making ownership and imports
predictable for GitHub collaboration. The workspace-level `plan.md` for native
reader work is separate and is not changed by this plan.

## 1. Goals and guardrails

### Goals

- One owner per feature path, documented in `.github/CODEOWNERS`.
- Thin Expo Router routes under `app/`; feature screens own product logic.
- Shared code has no knowledge of manga, reader, downloads or extensions.
- No import cycles, cross-feature deep imports or unreferenced modules.
- Runtime dependencies are explicit through React context; changing snapshots
  remain external stores.
- Native source has one canonical copy under `plugins/`, with generated copies
  never hand-edited unless the drift is explicitly reconciled.

### Non-negotiable contracts

- The reader remains at `app/reader/[id].tsx` from Expo Router's perspective.
- All extension sources keep one opaque provider/chapter identity contract.
- One local reader-cache URI supplies display, YOLO, OCR, crops and translation.
- Translation regions remain source-image-normalized; the source URL remains
  separate from the display URI.
- Crop, rotate, split and zoom share one image transform.
- The reader has exactly two product views: **paged** and **strip**. Paged
  keeps the `FlatList` and `ZoomablePage` per-page transform. Strip is a
  custom virtualized list with one strip-wide world camera; chunks are mount
  and decode windows only and never own independent zoom transforms.
- Both views own tap-zone navigation. Tap zones are resolved inside the active
  viewport's gesture owner, not by a full-screen pressable above page content.
  Paged taps turn pages; strip taps move by viewport fraction or camera pan.
- `readerLayout.ts` remains the paged/current offset contract during migration.
  Strip offsets use source-page identity plus normalized page position and must
  not depend on chunk indices.
- Native-reader work does not begin here.
- `SubsamplingScaleImageView` stays a non-interactive image surface while
  `ZoomablePage` owns gestures.
- Existing staged and unstaged work is preserved. No resets, cleans or commits.

### Measured baseline

| Area            | Files |    LOC | Current issue                           |
| --------------- | ----: | -----: | --------------------------------------- |
| `app/`        |    20 |  6,476 | routes contain feature logic            |
| `components/` |    63 | 18,030 | UI and domain logic mixed               |
| `services/`   |    77 | 15,415 | domain, data and native bridges mixed   |
| `utils/`      |    11 |  2,646 | reader hooks mixed with generic helpers |
| `constants/`  |     3 |    174 | theme and static data mixed             |

There are 175 TS/TSX modules and 548 local import edges. Eight files exceed
800 LOC, with the largest at 1,886 LOC. The current hard cycle is:

```text
services/downloader/index.ts
  -> services/downloader/scheduler.ts
  -> services/notifications/notifications.ts
  -> services/translation/pretranslateQueue.ts
  -> services/downloader/index.ts
```

## 2. Three-phase delivery

### Phase 1: Foundation and safe moves

**Objective:** make the target structure enforceable and prove the pattern on
low-risk shared code. No reader behavior changes.

**Scope**

1. Add `src/` zone aliases: `@features/*`, `@shared/*`, `@core/*`,
   `@platform/*`. Keep `@/*` temporarily for compatibility.
2. Add `scripts/check-architecture.mjs` to detect:
   - import cycles
   - `shared -> features`
   - `core -> features`
   - `app -> feature internals`
   - cross-feature deep imports
   - imports of generated `android/` files
3. Add `.github/CODEOWNERS`, `docs/architecture/README.md` and
   `docs/architecture/context.md`.
4. Move generic shared primitives:
   - `constants/theme.ts` -> `src/shared/theme/tokens.ts`
   - `components/common/Dialogs.tsx` -> `src/shared/ui/overlays/`
   - `components/common/AppHeader.tsx` -> `src/shared/ui/layout/`
   - `components/common/MenuSheet.tsx` -> `src/shared/ui/overlays/`
5. Keep compatibility re-export shims at old paths, then migrate callers. Delete
   a shim only in the PR that removes its last caller.
6. Remove confirmed unreferenced modules after a fresh import search (the four
   below were verified as self-only references and deleted):
   - `services/translation/localTranslator.ts`
   - `services/translation/pageTranslate.ts`
   - `components/downloader/DownloadedStrip.tsx`
   - `components/sources/SourceFilterOverlay.tsx`
7. Add scripts: `check:arch`, `check:types` and `check`.
8. Document the runtime context policy.

**Exit gates**

- `npx tsc --noEmit --pretty false` passes.
- `npm run check:arch` reports zero cycles and zero forbidden edges in `src/`.
- The existing reader route still opens and behaves unchanged.
- No native file is modified.
- Every moved path has a migrated caller or a documented compatibility shim.

**Rollback unit:** each numbered item is one PR. Revert the item, not the plan.

**Progress (2026-10-24)**

- Added `@composition`, `@shared`, `@core`, `@features` and `@platform` aliases.
- Added the architecture checker and ran it against `src/` and `app/`.
- Extracted shared theme tokens, dialogs, menu sheet and app header. Their old
  paths are compatibility shims with no remaining callers.
- Moved startup orchestration to `src/composition/providers/bootstrapRuntime.ts`.
- Extracted `vision` behind `@features/vision`; 12 implementation modules moved
  under `src/features/vision`, and their old service paths were deleted after
  the caller search reached zero.
- Moved generic geometry (`Box`, `Point`) to `@shared/geometry` and
  `BubbleMask` to `@shared/contracts`, removing the vision -> translation type
  dependency.
- Added `docs/architecture/README.md`, `docs/architecture/context.md` and
  `.github/CODEOWNERS.example`.
- Verified Metro/Expo resolution with
  `npx expo export --platform android`; the bundle includes the moved vision
  assets and does not treat `src/composition` as a route root.

The four unreferenced modules listed in item 6 were deleted after a fresh
source search found only self-declarations. The architecture checker now rejects
imports of those removed paths and the removed theme/shared shims.

Remaining Phase 1 item: replace the example CODEOWNERS file only after real
GitHub handles are available. Phase 2 has started with the vision slice.

### Phase 2: Feature extraction

**Objective:** move leaf features behind public entry points and remove the
existing import cycle.

**Order**

1. `vision`: YOLO, segmentation, OCR and model registry. First move shared
   geometry types out of translation so vision has no translation dependency.
2. `translation`: engines, pipeline, queue, cache and usage. Introduce
   `NotificationPort` and `DownloadSessionPort`; remove the downloader barrel
   cycle.
3. `downloads`: queue, files, archive, metadata, recovery, offline and
   reader-session concerns. Replace the 68-export barrel with explicit entry
   points.
4. `extensions`: native bridge, repository, installer, filters and catalog UI.
   Preserve a single typed native facade and opaque identity flow.
5. `library` and `manga`: library reads and chapter browsing. Manga consumes a
   `ChapterSource` contract instead of extension internals.
6. `settings`: separate the core settings store from settings screens.
7. `shared/runtime`: add the app services provider, overlay host and
   `useSyncExternalStore` bridges for settings, downloads and extensions.

**Exit gates**

- `@features/*` imports public entry points only.
- `shared` and `core` build without importing any feature.
- The dependency graph is acyclic.
- Each migrated feature has a README and a contract test.
- The Android debug build passes when native-adjacent code changes.

**Progress (2026-10-25)**

- Completed the `translation` slice behind `@features/translation`:
  language/overlay contracts, Gemini and free-Google engines, region pipeline,
  runtime lock and pre-translate queue.
- Removed the `services/translation` tree after all callers migrated; the
  architecture checker now rejects that path.
- Broke the downloader/notification import cycle. Translation consumes
  `DownloadSessionPort`, `TranslationNotificationPort` and
  `TranslationNotificationCommandPort` from `@shared/contracts`; the
  composition root wires the adapters and initializes the queue after
  notification setup.
- Moved the generic worker queue to `@shared/async/workQueue` and removed the
  settings -> translation model-id dependency by moving persisted model IDs to
  `@core/settings/geminiModelId`.
- `translationRepository` now imports only shared geometry/contracts and core
  model IDs.
- `npm run check`, ESLint on touched paths and the Expo Android export pass;
  the architecture graph has no cycle.
- Completed the `downloads` slice behind `@features/downloads`: catalog,
  canonical identity/candidates, queue/scheduler, archive and page storage,
  metadata/recovery, offline browsing, reader page sessions and download UI.
- Moved the two download routes to feature screens; `app/downloads/*` are now
  thin Expo Router adapters.
- Extracted the picked SAF root to `@core/storage/root`, so settings backup and
  legacy reader cleanup no longer import a feature or downloader-named module.
  The `download_folders` table remains the persisted grant; downloads adds only
  its `downloads/` child and archive naming.
- Removed the broad `services/downloader` and `components/downloader` trees and
  nested downloader barrels. Cross-feature callers import only the public
  `@features/downloads` entry point; internal files import concrete siblings.
- Completed the `extensions` slice behind `@features/extensions`: native host
  facade, repository/catalog, filters, installer, migration, registry and both
  browse/source screens.
- `app/(tabs)/browse.tsx` is now a 20-line route adapter. It passes initial
  params and one source-navigation callback into
  `features/extensions/screens/BrowseExtensionsScreen.tsx`; feature code does
  not import `composition`.
- Browse presentation is split into source rows, catalog rows, repository intro,
  empty states and shared filter chips. Filtering, grouping and install-state
  rules live in `features/extensions/domain/browseFilters.ts` with focused
  tests.
- Extension cover images use the registered header resolver through shared
  media cards, preserving Cloudflare/cookie handling. Corrupted UTF-8 labels in
  the extension slice were repaired.
- `npm run check:arch`, TypeScript, focused extension tests, ESLint on the
  touched paths and the Android export pass. The checker sees 127 files and
  413 local edges.
- Completed the `library` slice behind `@features/library`: screen lifecycle,
  membership dialogs, add-to-library state, cards, filters, library sync and
  reader/history tracking.
- `app/(tabs)/library.tsx` is a thin route adapter; navigation is injected and
  the feature does not import routes or composition.
- Downloaded-only cards map through a pure library domain module, while catalog
  refresh moved to `@core/catalog` so downloads and library share one adapter
  without importing each other.
- Offline reader construction now preserves opaque provider/chapter identity and
  encoded reader params in `@features/downloads`; manga owns reader navigation
  and library owns history recording.
- Removed the legacy `services/library` and `components/library` trees.
  `AddToLibraryButton` is split into component, hook, modal and identity-domain
  files behind the public feature entry point.
- Library and offline-target contract tests pass with the existing extension
  tests. TypeScript, ESLint, architecture checks and the Android export pass;
  the checker sees 147 files and 472 local edges.
- Completed the `manga` slice behind `@features/manga`: route adapter,
  detail/chapter screens, chapter grouping and filters, download selection,
  loading hooks and provider adapters. The legacy `components/manga` tree is
  removed and the feature has a README plus four focused domain tests.
- Completed the database ownership batch: schema, client, bootstrap, backup,
  repositories and bundled migration assets moved from `services/db/**` to
  `src/core/db/**`; `drizzle.config.ts` and every consumer now use `@core/db`.
  The legacy tree was removed after TypeScript and architecture checks passed.
- Completed the shared extension identity/page ownership batch:
  `imageHeaders.ts` moved to `@shared/net/imageHeaders`,
  `readerIdentity.ts` and `loadChapterPages.ts` moved to `@core/catalog`, and
  `providerLabel.ts` moved behind `@features/extensions`. `ProviderId` now has
  a core-owned type module. The legacy `utils/reader` folder and
  `utils/providerLabel.ts` are removed, and library's filter sheet now uses the
  extension public API rather than a deep registry import.
- Completed the `settings` split: persisted schema/store/backup/usage live in
  `@core/settings`, while routes, section UI and `useAppSettings` live behind
  `@features/settings`. The settings hook now uses `useSyncExternalStore`.
- Added the shared runtime layer: `AppServicesProvider` exposes stable service
  identities, `AppBootstrapGate` owns startup/splash/app-resume state and
  `OverlayHostProvider` owns root-level feature overlays. The download sheet
  registers through that host instead of rendering directly from the route.
- Settings, manga, extension, library and offline-target tests passed at the
  Phase 2 checkpoint: 25 tests total. The current suite is 43 tests after the
  reader domain/session cuts. TypeScript, full ESLint, architecture checks and
  the Android export pass; the checker now sees 214 files and 656 local edges.

**Phase 2 feature extraction is complete.** The next safe cut is Phase 3:
reader domain extraction, the two-view presentation contract and reader state
providers. Legacy reader/onboarding/source files remain until their owning
feature slices move.

**Phase 3 progress:** the pure reader domain cut is complete. The reader now
exposes exactly three product modes: `webtoon` (long strip with gaps),
`continuousVertical` (long strip) and `pagedHorizontal` (paged, with an
independent LTR/RTL direction). Legacy reading-mode values are mapped at the
migration boundary. Geometry, display-item construction and tap-zone
resolution live under `src/features/reader/domain/`, with focused
tests for each contract. The `components/reader` compatibility tree has
been removed; the former `utils/reader` modules now live in shared/core, with
the reader-owned helpers beside their consumers.
`ReaderSessionProvider` now owns active page, chrome visibility, chrome
settings and loading state, and the reader route consumes it. The strip camera
cut is now in `src/features/reader/views/strip/stripCamera.ts`, with the
viewport owning one camera, viewport-level tap zones and long-press page
identity; while zoomed, camera pan is the only vertical pan owner. The next cut
is the remaining UI split. `app/reader/[id].tsx` is now a
54-line route adapter; `PagedReader` keeps the default `FlatList`, while
`StripReader` uses a custom `ScrollView` that mounts only the active strip
window. Strip page rows are now inert; the viewport owns tap, long-press,
pinch and camera pan, page-turn taps move by 90% of the viewport scaled by the
current camera zoom, and camera worklets read only Reanimated shared values.
The feature screen still needs its large-screen decomposition.

**Phase 3 static gate:** TypeScript, targeted ESLint, `check:arch` (220 files,
666 edges), all 53 feature tests, and the Android debug APK build pass.

**Phase 3 device checkpoint (2026-10-27):** the user confirmed paged/strip tap
zones, zoom, and scroll behavior on the V2311L after the auto-scroll fix, then
disconnected the device. The remaining UI cut has started: settings, page
measurement/prefetch and chapter-arrow resolution are extracted; the chrome
stack has its own component and prop contract. `ReaderScreen` is still about
1,619 LOC and owns several lifecycle/gesture concerns, so the screen split and
the legacy-shim removal remain open. The extracted chrome component (323 LOC)
and settings hook (245 LOC) currently meet the 400/250 LOC targets; keep the
screen itself as the documented exception until its lifecycle cut lands. Re-run
`docs/qa/reader-device-smoke.md` on the next device connection before treating
the reader release gate as closed.

**Phase 3 screen split (2026-10-27):** `ReaderScreen` now composes three
extracted hooks and no longer owns page loading, history/progress persistence
or the paged-tap latch. `useReaderChapterPages` owns downloaded-vs-network page
selection and cleanup; `useReaderSessionLedger` owns restore, progress and
history; `usePagedTap` owns tap-zone resolution and the transition gate. The
screen is about 1,240 LOC, down from 1,536, and TypeScript, targeted ESLint,
`check:arch` (277 files, 848 edges) and all 69 tests pass. The screen still
exceeds the 400 LOC target, so the remaining work is a viewport/tap-wiring cut,
not a behavior change. The device smoke checklist must be rerun before release;
the latest device checkpoint predates this extraction.

**Phase 3 viewport and display cut (2026-10-27):** `ReaderViewport` now owns
the paged/strip presentation branch, tap-zone preview and page flash;
`useReaderDownloadState` owns identity, catalog download metadata and the
download candidate/context; `usePagedDisplayAnchor` and
`useReaderDisplayIndex` own display-row alignment and scrubber lookup. The
translation pipeline now lives in `features/reader/translation/`, with
`scanOcr`, `translateWorkers`, `readerTranslationPipeline`, cache/page-state
modules and the session hook. `ReaderScreen` is 1,157 LOC. The full
gate is green: TypeScript, targeted ESLint, `check:arch` (282 files, 860
edges) and all 69 tests. This remains a behavior-preserving refactor; the
device smoke checklist is still open until the V2311L is reconnected.

**Phase 3 settings bridge and screen lifetime (2026-10-27):**
`useReaderSettingsBridge` now owns the persisted settings subscription,
chrome/auto-scroll refresh, debounced write flush and the chrome-facing
translation/overlay callbacks. `useReaderScreenLifetime` owns orientation
locking and focus-scoped keep-awake. `useReaderScrollTracking` owns the
row-offset lookup and FlatList layout callback, with the pure offset lookup in
`domain/layout/scrollOffset.ts`. The bridge is invoked at the original
settings-effect position so reader effect ordering is unchanged. `ReaderScreen`
is 1,068 LOC, down from 1,157. TypeScript, targeted ESLint, `check:arch` (287
files, 870 edges) and all 72 tests pass. Behavior is unchanged; device smoke
testing remains open until the V2311L is reconnected.

**Phase 3 page-layout and screen-state cut (2026-10-27):** `pageOffsets.ts` now
owns both display-row geometry and the prefix table; `ReaderScreen`, scroll
tracking and FlatList layout consume that one source of truth. The screen no
longer contains an inline page renderer, page-flash animation or loading/empty
JSX. `ReaderPageRenderer` owns display-row-to-page wiring,
`ReaderScreenStates` owns route states, and `useReaderPageFlash` owns the flash
timeline. The chrome stack contract now uses the shared translation engine and
mode types. `ReaderScreen` is 935 LOC, down from 1,157 at the start of this
pass. The full gate is green: TypeScript, targeted ESLint, `check:arch` (294
files, 889 edges) and all 77 tests, including five new page-offset tests.
Device smoke testing remains open because the V2311L is disconnected.

**Phase 3 strip window and chrome composition (2026-10-27):** `StripReader`
public interfaces now live in `StripReader.types.ts`; the tested camera metrics
constructor lives in `stripCamera.ts`; and `useStripWindow` owns the mounted-row
window, camera-derived visible range and page-notification de-duplication.
`ReaderChromeRenderer` owns the chrome-stack prop mapping, leaving
`ReaderScreen` as the session/lifecycle composer. `StripReader` is 537 LOC
(down from 631), `ReaderScreen` remains 934 LOC, and
`ReaderChromeRenderer` is 284 LOC. The full gate is green: TypeScript,
targeted ESLint, `check:arch` (297 files, 894 edges) and all 77 tests.
The strip camera worklets were not moved, so gesture behavior is unchanged by
construction; device smoke testing remains the release gate.

**Rollback unit:** one feature per PR, keeping the old feature API as a
re-export until all callers move.

### Phase 3: Reader decomposition and collaboration scale

**Objective:** split the reader without changing its rendering contract, then
make multi-owner development enforceable.

**Order**

1. [X] Extract reader domain modules: geometry, layouts, modes, tap zones,
    overlay fitting and page items.
2. [X] Add `ReaderSessionProvider` and a reducer for active page, chrome, settings
    patch and session lifecycle.
3. [X] Split the route into `app/reader/[id].tsx` (thin adapter) and
    `features/reader/screens/ReaderScreen.tsx`.
4. [ ] Split the remaining UI into page, chrome, panels and overlays; the
    paged/strip list hosts are already separated.
5. [X] Split `useReaderTranslation.ts` into scan, OCR, translate and cache
    pipeline modules plus a session hook. The compatibility shim remains until
    the legacy-reader cleanup in item 6.
6. [ ] Remove legacy shims and the temporary `@/*` alias.
7. [X] Add the CI matrix, device smoke checklist, CODEOWNERS review rules, ADRs
    and feature contribution templates. CODEOWNERS activation remains pending
    real GitHub handles; the example file documents the intended ownership map.

**Exit gates**

- Route file is at most 120 LOC and only composes the feature screen.
- No reader component exceeds 400 LOC without a documented exception.
- No reader hook exceeds 250 LOC without a documented exception.
- Paging, zoom, split/rotate, orientation, restore and translation alignment
  pass the on-device checklist.
- Translation overlays stay aligned after fit changes and chapter transitions.
- `npm run check` is green and the graph has no cycle or forbidden edge.

**Phase 3 collaboration slice:** `.github/workflows/pull-request.yml` runs
types, the architecture graph and the 50 feature tests, then exports the
Android bundle. `.github/pull_request_template.md` requires scope, import
review and reader/native evidence. `docs/qa/reader-device-smoke.md` is the
reader release gate, and `docs/architecture/adr/` records the feature boundary,
two-view reader and context/store decisions. `scripts/run-tests.mjs` uses the
pinned local `tsx` and discovers tests without shell glob expansion. The static
workflow is complete; on-device reader validation remains the Phase 3 release
gate. CODEOWNERS activation is the only collaboration item waiting on real
GitHub handles.

**Phase 3 device checkpoint (2026-10-26):** the previous device failure was
traced to two interaction defects: the native `SubsamplingScaleImageView`
requested touch interception even with its own gestures disabled, and a
full-size transparent tap surface competed with the strip `ScrollView`.
`ReaderTiledImageView` now always releases parent interception, and
`StripReader` has one viewport-level `GestureDetector` owning pinch, camera pan,
tap and long-press. Ordinary scrolling remains owned by the native
`ScrollView` at 1x; zoomed scrolling is owned by the camera. The generated
native copies were rebuilt successfully. A device was not attached at the end
of this pass, so the release gate remains open until the checklist below is
run on the V2311L.

### Reader view contract (Phase 3)

The reader is reduced to two explicit presentation views behind one session:

```text
features/reader/
  screens/ReaderScreen.tsx
  views/
    paged/
      PagedReader.tsx            FlatList + viewability + offset restore
      PagedItem.tsx              one page slot, paged geometry
    strip/
      StripReader.tsx            custom virtual list host
      StripViewport.tsx          sole gesture owner and world camera
      StripChunk.tsx             N pages at fixed world offsets
      StripPage.tsx              page surface at a fixed world offset
      stripCamera.ts             scale/pan/clamp math
      useStripWindow.ts          current chunk plus neighbor mounting
  domain/
    modes.ts                     paged | strip only
    layout/pageGeometry.ts
    layout/pagedOffsets.ts       current readerLayout contract
    layout/stripLayout.ts        world offsets, gap math, anchors, chunking
    layout/stripLayout.test.ts
    navigation/tapZones.ts       pure preset, invert, RTL resolution
    navigation/tapZones.test.ts
    navigation/tapCommands.ts    previous | next | toggle mapping
  components/
    page/PageSurface.tsx         tiled image + translation overlay
    overlays/TapZonePreview.tsx  pointerEvents="none" only
  state/ReaderSessionProvider.tsx
  index.ts  README.md
```

**Strip invariants**

- One world-coordinate space contains every page and its gap.
- One camera transforms all mounted chunks and overlays together.
- Chunks are appended at fixed world offsets; a chunk never applies its own
  scale, translation or page-order reversal.
- Chunk by target world height, not a fixed page count. A single tall webtoon
  page may be its own chunk.
- Build chunks from `ReaderDisplayItem[]` so split, rotate and page identity
  stay shared with paged mode.
- Render the current chunk and a bounded neighbor window. Do not rasterize all
  N pages into one giant bitmap; keep per-page tiled surfaces.
- Tap resolution reports viewport coordinates directly from the strip viewport.
  The strip `GestureDetector` wraps the viewport, never the transformed content,
  so `event.x` and `event.y` already include the current scroll offset and must
  not be adjusted by `scrollY` a second time.
- While zoomed, the camera owns panning. The list scroller must be suspended or
  explicitly coordinated; two vertical pan owners are forbidden.
- Restore and scrubber anchors use source-page identity plus normalized page
  position, never chunk index or internal scroll offset.
- Translation regions stay source-image-normalized, and image + overlay remain
  in the same transformed page surface.

**Tap-zone contract**

| View  | `previous` / `next`                                                     | `toggle`           |
| ----- | --------------------------------------------------------------------------- | -------------------- |
| Paged | Previous/next page                                                          | Toggle reader chrome |
| Strip | Move approximately 90% of the viewport, divided by the current camera scale | Toggle reader chrome |

The tap-zone preview remains a non-interactive overlay. Header, footer and
open sheets sit above the viewport and win touches naturally. Long-press page
actions work in both views.

**Paged invariants**

- Every paged page owns an independent zoom/pan transform, including tall
  pages. Tall paged pages use fit-width geometry so vertical panning has range.
- The per-page pan gesture has no static "fits at base scale" gate; translation
  clamping is the only limit, so a page remains pannable after it is zoomed.
- A vertical one-finger drag pans a tall page; a clearly horizontal drag is
  left to the paged `FlatList`, so swipes still turn pages.
- Zoom-out is enabled by default (`disableZoomOut: false`) to the 0.4x page
  floor; the user can disable it in Reader Config.

The `components/reader` shims are gone, and the former `utils/reader` modules
now live in shared/core. The route is not rewritten first.

## 3. Target folder structure

Add folders only when they contain real code. The tree below is the intended
end state, not a request to create empty scaffolding.

```text
TrApp/
  app/                                  Expo Router only
    _layout.tsx                         providers + bootstrap gate
    (tabs)/
      _layout.tsx
      library.tsx
      history.tsx
      browse.tsx
      settings.tsx
    reader/[id].tsx                     thin route adapter
    manga/[slug].tsx
    extensions/source/[sourceId].tsx
    downloads/index.tsx
    downloads/[mangaId].tsx
    settings/                           one page per settings section
      _layout.tsx  about.tsx  downloads.tsx  ocr-models.tsx
      queue.tsx  storage.tsx  translation.tsx  translation-queue.tsx

  src/
    composition/                        non-route app composition
      providers/
        AppProviders.tsx
        AppBootstrapGate.tsx
      navigation/
        routes.ts
        readerLinks.ts

    shared/                             no feature knowledge
      theme/
        tokens.ts  typography.ts  spacing.ts  radius.ts  index.ts
      ui/
        primitives/                     Button, IconButton, Card, Badge, Chip,
                                        Divider, Spinner
        inputs/                         TextField, SearchField, Toggle, Slider,
                                        SegmentedControl
        feedback/                       EmptyState, ErrorState, LoadingState,
                                        Toast, Banner
        overlays/                       Modal, BottomSheet, ConfirmDialog,
                                        PromptDialog, MenuSheet,
                                        OverlayHostProvider
        layout/                         Screen, AppHeader, SectionHeader,
                                        SafeAreaContainer
        media/                          CoverImage, RemoteImage
        index.ts
      hooks/                            useAsync, useDebouncedValue, useLatest,
                                        useAppState, useStoreSnapshot
      lib/                              formatBytes, formatDate, invariant, result
      contracts/                        chapterSource, imageSource,
                                        notificationPort, downloadSessionPort,
                                        translationEngine
      geometry/                         box, point, polygon
      runtime/                          AppServicesProvider, useAppServices,
                                        OverlayHostProvider
      index.ts

    core/                               data and platform policy
      db/
        client.ts  schema.ts  migrations.ts  bootstrap.ts
        repositories/                   library, catalog, download, progress,
                                        history, settings, translation
      settings/                         settingsStore, settingsSchema, backup,
                                        storageUsage
      images/                           avif, decode, imageHeaders
      net/                              browserFetch, imageFetch
      platform/                         notifications, orientation, keepAwake,
                                        appState
      index.ts

    features/
      reader/
        screens/ReaderScreen.tsx
        views/
          paged/                    PagedReader, PagedItem
          strip/                    StripReader, StripViewport, StripChunk,
                                    StripPage, stripCamera, useStripWindow
        components/
          page/                         PageSurface, ZoomablePage,
                                        SubsamplingStripImage, PageImage
          chrome/                       ReaderHeader, ReaderBottomBar,
                                        ReaderModeIcon
          panels/                       ReaderConfigPanel,
                                        ReaderReadingModeSheet,
                                        ReaderRotationSheet,
                                        ReaderPageActionsSheet,
                                        ReaderPanelPrimitives
          overlays/                     PageTranslationOverlay,
                                        PageTrStatusBadge, SingleTranslateFab
          translation/                  ReaderTranslationPanel and its tabs
        hooks/                          useReaderSession, useReaderPaging,
                                        useReaderChrome, useReaderRestore,
                                        useReaderTapZones,
                                        useReaderTranslationSession
        state/                          ReaderSessionProvider,
                                        readerSessionReducer, readerSelectors
        domain/
          geometry/pageGeometry.ts
          layout/pagedOffsets.ts, readerItems.ts, stripLayout.ts
          navigation/tapZones.ts, tapCommands.ts
          modes.ts  overlayLayout.ts  overlayTextFit.ts
        data/                           loadChapterPages, readerProgress,
                                        readerPageSession
        index.ts  README.md

      translation/
        screens/                        TranslationSettingsScreen,
                                        TranslationQueueScreen
        components/                     PretranslateDialog, TranslationQueuePanel,
                                        UsageMeter
        hooks/                          useTranslationQueue,
                                        useTranslationUsage
        domain/                         types, languages, translationSlots,
                                        modelPolicy, usagePolicy
        engines/
          TranslationEngine.ts
          gemini/                       client, models, usage, errors
          freeGoogle/client.ts
        pipeline/                       preparePage, translatePage, fallback
        jobs/                           pretranslateQueue, workQueue,
                                        runtimeLock, queueEvents
        cache/translationCache.ts
        state/TranslationQueueProvider.tsx
        index.ts  README.md

      vision/
        components/                     ModelPackList, ModelStatus
        hooks/useVisionModels.ts
        domain/                         detectionTypes, modelManifest
        detection/                      yolo, yoloUtils, classes
        segmentation/                   mangaBubbleSeg, masks
        ocr/
          runtime/onnxRuntime.ts
          models/                       modelStore, ocrModels
          detector/paddleDetEngine.ts
          recognizer/paddleRecEngine.ts
          pageOcr.ts  localOcr.ts
        index.ts  README.md

      manga/
        screens/MangaDetailScreen.tsx
        components/
          header/                       MangaHeader, MangaMeta, TagChip
          chapters/                     ChapterList, ChapterRow,
                                        ChapterFilterSheet, ChapterGroupHeader
          actions/                      ChapterActionsSheet, MangaShareButton
        hooks/                          useMangaPage, useChapterList,
                                        useChapterFilters, useChapterReadState
        domain/                         types, chapterSort, chapterGroup,
                                        chapterDate, chapterMatch
        data/                           loadMangaPage, loadChapters
        index.ts  README.md

      library/
        screens/                        LibraryScreen, HistoryScreen
        components/
          cards/                        LibraryCard, LibraryGrid
          filters/                      LibraryFilterSheet, LibrarySelector
          history/                      HistoryList, HistoryRow
          membership/                   AddToLibraryButton, LibraryPickerSheet
        hooks/                          useLibraries, useLibraryCards,
                                        useHistory, useLibraryFilters
        domain/                         libraryFilters, librarySort, progress
        tracking/readerTracking.ts
        sync/                           catalogSync, librarySync,
                                        providerAdapters
        index.ts  README.md

      downloads/
        screens/                        DownloadsScreen, DownloadManagerScreen
        components/
          buttons/                      DownloadButton, SeriesDownloadButton,
                                        ReaderDownloadButton
          queue/                        DownloadProgressPanel, QueueControls
          sheets/                       DownloadSheetHost, DownloadConfirmSheet
          recovery/RecoveryPanel.tsx
        hooks/                          useDownloads, useDownloadQueue,
                                        useDownloadStatus, useDownloadFolder
        queue/                          scheduler, queueState, networkPolicy,
                                        types
        storage/                        archive, pageFiles, storage, naming,
                                        zipFallback
        metadata/                       metadata, catalogMetadata, recovery
        offline/                        offline, readerPageSession,
                                        readerPageSessionForChapter
        adapters/nativeDownloader.ts
        state/DownloadsProvider.tsx
        index.ts  README.md

      extensions/
        screens/                        BrowseExtensionsScreen,
                                        ExtensionSourceScreen
        components/
          browse/                       SourceListRow, ExtensionCatalogRow,
                                        RepoIntro
          install/                      InstallButton, TermsModal,
                                        UninstallConfirm
          filters/                      ExtensionFilterSheet,
                                        FilterCategoryPage, FilterSummary
          migration/                    MigrationList, MissingExtensionRow
        hooks/                          useExtensionCatalog,
                                        useInstalledExtensions, useRepoCatalog,
                                        useExtensionFilters, useExtensionInstall
        catalog/                        repo, catalog, filters
        install/                        installer, apkVerifier, installPermission
        host/                           registry, native, migration
        adapters/chapterSource.ts
        state/ExtensionRegistryProvider.tsx
        index.ts  README.md

      settings/
        screens/                        SettingsHomeScreen,
                                        DownloadsSettingsScreen,
                                        StorageSettingsScreen,
                                        QueueSettingsScreen,
                                        TranslationSettingsScreen,
                                        OcrModelsSettingsScreen, AboutScreen
        components/
          layout/                       SettingsPage, SettingsSection
          rows/                         SettingsRow, ToggleRow, SliderRow,
                                        ActionRow
        sections/
          downloads/DownloadsSection.tsx
          storage/StorageSection.tsx
          queue/QueueSection.tsx
          translation/TranslationSection.tsx
          ocr/OcrModelsSection.tsx
          about/AboutSection.tsx
        hooks/useAppSettings.ts
        data/                           backup, storageUsage
        index.ts  README.md

    platform/
      native/
        contracts/                      extensionHost, downloader, avif,
                                        updater, subsampling
        bridges/                        extensionHost, downloader, avif, updater
        index.ts
      config-plugins/README.md

  tests/
    unit/
    contracts/
    integration/
  e2e/
  scripts/check-architecture.mjs
  plugins/                              canonical config plugins and Kotlin
  android/                              generated/native host; never sole edit
```

## 4. Runtime context policy

React context is used for scope and dependency injection, not as a universal
state container.

### Allowed root providers

```text
GestureHandlerRootView
  AppServicesProvider            stable ports and controllers
    AppBootstrapGate             database/startup states
      OverlayHostProvider        modal, sheet and toast host
        Stack
        DownloadSheetHost
```

`AppServicesProvider` may expose stable instances: download controller,
extension registry service, translation service, notification port, image and
storage adapters. Its value must be memoized; do not rebuild services every
render.

Feature-scoped providers:

- `ReaderSessionProvider` inside the reader screen.
- `TranslationQueueProvider` around translation queue UI.
- `DownloadsProvider` only where a screen needs the queue controller.
- `ExtensionRegistryProvider` only where a screen needs catalog/install state.

Do **not** put current page, scroll offset, zoom scale, download progress,
extension registry snapshots, translation queue snapshots or rapidly changing
settings in a root context value. Use `useSyncExternalStore` over the existing
subscriptions:

```ts
useSyncExternalStore(subscribeDownloads, getDownloadSnapshot);
useSyncExternalStore(subscribeSettings, getSettingsSnapshot);
useSyncExternalStore(subscribeExtensionRegistry, getExtensionSnapshot);
```

This prevents whole-app re-renders during reader scrolling and download
progress. Context values must be stable.

### Shared reusable components

Generic UI belongs in `src/shared/ui`. A component belongs there only if its
props and behavior know nothing about manga, chapters, the reader or downloads.
Domain-aware components stay inside their feature.

## 5. Import rules and enforcement

```text
app/  ->  features/  ->  shared/ + core/ + platform/
                         ^ no reverse imports
```

1. `app/` imports feature public entry points and shared/core utilities.
2. A feature imports its own modules, `@shared/*`, `@core/*` and declared ports.
3. Cross-feature imports use `@features/<name>` only, never a deep path.
4. `shared/` and `core/` never import `app/` or `features/`.
5. `platform/` owns native contracts; feature adapters wrap them.
6. No feature imports generated `android/` files.
7. Do not import a barrel from inside its own feature; import the concrete
   module to avoid accidental cycles.
8. A feature's `index.ts` is its only public API.

CI checks:

- `npx tsc --noEmit --pretty false`
- `npx eslint ...`
- `npm run check:arch`
- `npx tsx --test ...` where applicable
- Android debug build for native-adjacent changes

During migration the checker may carry a small per-file allowlist. It must
shrink each phase and be deleted at the end of Phase 3.

## 6. File-level migration map

| Current path                                       | Destination                                                | Phase    |
| -------------------------------------------------- | ---------------------------------------------------------- | -------- |
| `app/reader/[id].tsx`                            | thin route + `features/reader/screens/ReaderScreen.tsx`  | 3        |
| `components/manga/ChapterMangaViewer.tsx`        | `features/manga/` screen/components/hooks                | 2        |
| `app/(tabs)/browse.tsx`                          | `features/extensions/screens/BrowseExtensionsScreen.tsx` | 2 (done) |
| `utils/reader/useReaderTranslation.ts`           | reader translation hook + translation pipeline             | 2/3      |
| `components/reader/ReaderTranslationPanel.tsx`   | reader translation panels                                  | 3        |
| `components/extensions/ExtensionFilterSheet.tsx` | extension filter components                                | 2 (done) |
| `services/downloader/scheduler.ts`               | `features/downloads/queue/scheduler.ts`                  | 2 (done) |
| `services/translation/pretranslateQueue.ts`      | `features/translation/jobs/pretranslateQueue.ts`         | 2 (done) |
| `services/db/**`                                 | `src/core/db/**`                                         | 2 (done) |
| `services/settings/settingsStore.ts`             | `src/core/settings/settingsStore.ts`                     | 2        |
| `services/images/**`                             | `src/core/images/**`                                     | 2        |
| `services/net/**`                                | `src/core/net/**`                                        | 2        |
| `components/common/Dialogs.tsx`                  | `src/shared/ui/overlays/`                                | 1        |
| `components/common/AppHeader.tsx`                | `src/shared/ui/layout/`                                  | 1        |
| `components/common/MenuSheet.tsx`                | `src/shared/ui/overlays/`                                | 1        |
| `constants/theme.ts`                             | `src/shared/theme/tokens.ts`                             | 1        |
| `utils/providerLabel.ts`                         | `src/features/library/domain/providerLabel.ts`           | 2        |
| `services/reader/legacyCacheCleanup.ts`          | `features/reader/data/legacyCacheCleanup.ts`             | 3        |

Do not move a file before its destination contract is defined.

### Verified placement matrix (2026-10-28)

`components/reader` is now deleted. Its last live imports were retargeted to
`@features/reader` implementation modules, and these confirmed-dead reader
compatibility files were removed: `utils/reader/pageGeometry.ts`,
`utils/reader/readerItems.ts` and `utils/reader/useReaderTranslation.ts`.
The remaining legacy inventory is intentionally small:

| Current path | Destination | Why | Risk / prerequisite |
| --- | --- | --- | --- |
| `components/onboarding/**` | `src/features/onboarding/**` | First-launch guide workflow, exit confirmation, visibility rules and guide data. | Done: `@features/onboarding` public API; library imports only the overlay. |
| `components/translation/PretranslateDialog.tsx` | `src/features/translation/components/PretranslateDialog.tsx` | Chapter pre-translate setup and queue handoff. | Done: manga passes the source-language options; translation owns the dialog and imports only its own engine/job modules. |
| `utils/providerLabel.ts` | `src/features/extensions/domain/providerLabel.ts` | Resolves an extension display name; it is not a generic utility. | Done: exported through `@features/extensions`; downloads and library use the public API. |
| `utils/reader/borderCrop.ts` | `src/features/reader/components/page/borderCrop.ts` | Used only by reader page image surfaces. | Done: reader page renderer imports the local module. |
| `utils/reader/chapterLabel.ts` | `src/features/reader/domain/navigation/chapterLabel.ts` | Reader-only chapter title/navigation labels. | Done: reader navigation and chrome hooks import it locally. |
| `utils/reader/readerBackground.ts` | `src/features/reader/domain/readerBackground.ts` | Reader presentation policy. | Done: reader screen imports the local domain module. |
| `utils/reader/readerChromeSettings.ts` | `src/features/reader/domain/readerChromeSettings.ts` | Maps reader chrome state to persisted settings. | Done: screen and settings bridge import the local domain module. |
| `utils/reader/readerIdentity.ts` | `src/core/catalog/readerIdentity.ts` | Canonical provider/chapter identity shared by reader and downloads. | Done: `ProviderId` now lives in `@core/catalog/providerId`; reader and downloads import the core identity module. |
| `utils/reader/loadChapterPages.ts` | `src/core/catalog/loadChapterPages.ts` | Extension page loading shared by reader and downloads; not reader presentation. | Done: reader and downloads import the core page loader; it uses the shared image-header registry. |
| `utils/reader/imageHeaders.ts` | `src/shared/net/imageHeaders.ts` | Process-wide extension image-header registry used by shared UI, reader, downloads, manga and extensions. | Done: moved to shared, so `MediaCards` can consume it without a `shared -> core` dependency. |
| `services/db/**` | `src/core/db/**` | Persistence and repositories are core data infrastructure. | Done: moved with schema, client, bootstrap, backup, repositories and migration assets; `drizzle.config.ts` and all callers use `@core/db`. |
| `services/images/**` | `src/core/images/**` | AVIF transcoding and image validation are core image infrastructure. | Update vision, downloads, reader and any test imports in the same batch. |
| `services/net/**` | `src/core/net/**` | Cookie-aware fetch policy is core networking. | Update vision and download storage imports. |
| `services/notifications/notifications.ts` | `src/core/platform/notifications.ts` | Platform notification policy behind shared ports. | Composition may import core; downloads must keep using the notification port, not the implementation. |
| `services/reader/legacyCacheCleanup.ts` | `src/core/storage/legacyReaderCacheCleanup.ts` | One-time storage cleanup, executed during bootstrap. | Composition calls it at startup; no UI ownership. |
| `services/deeplink/index.ts` | `src/shared/links/mangaLinks.ts` for URL builders; share-sheet side effects via composition/platform adapter | The share catalogue is consumed by manga and extension terms; site origin is also needed by updates. | Resolve the `isMatureProvider` dependency first so shared code does not import the extension registry directly. |
| `services/updates/github.ts` | `src/features/updates/data/github.ts` | Release discovery and version comparison for the updater UI. | Create `@features/updates`; settings imports only the public entry point. |
| `services/updates/index.ts` | `src/features/updates/services/updater.ts` | Orchestrates check/download/verify/install for the About surface. | Native install bridge moves to `src/platform/native/`; extension installer consumes only that bridge. |
| `services/updates/native.ts` | `src/platform/native/updater.ts` | Typed bridge to `MangoraDownloader` installer/hash calls. | Update extension installer and updates service imports; platform must not import features. |

Recommended execution order: images/net/notifications, then deeplink/updates.
The identity/page-loading, image-header and database ownership batches are
complete; `utils/reader`, `utils/providerLabel.ts` and `services/db` have been
removed.

## 7. Validation checklist

### Every PR

- [ ] Scope is one phase item and one ownership area.
- [ ] `git status --short` reviewed before and after.
- [ ] No reset, clean, checkout of unrelated work, or commit.
- [ ] TypeScript passes.
- [ ] ESLint passes for touched paths.
- [ ] `npm run check:arch` passes or the exception list shrinks.
- [ ] New/moved module has a public entry point or compatibility shim.
- [ ] Removed modules have a fresh import search.
- [ ] Documentation updated where behavior or paths changed.

### Reader-touching PRs

- [ ] Page loading uses the shared local cache URI.
- [ ] Translation overlays align after fit and chapter changes.
- [ ] Split/rotate and orientation changes keep overlays aligned.
- [ ] Restore anchoring works after app restart.
- [ ] Pinch, pan and page-turn gestures do not fight each other.
- [ ] Android debug build and on-device smoke test completed.

### Native-touching PRs

- [ ] Canonical source under `plugins/` edited first.
- [ ] Generated `android/` copy regenerated or explicitly reconciled.
- [ ] `DownloadModule.kt` drift documented and resolved.
- [ ] New Architecture/Fabric interop tested.
- [ ] No `SurfaceView` under an RN overlay.

## 8. Ownership and review

Proposed CODEOWNERS groups:

- reader: `src/features/reader/**`, `app/reader/**`
- translation: `src/features/translation/**`
- vision: `src/features/vision/**`
- manga/library: `src/features/manga/**`, `src/features/library/**`
- downloads: `src/features/downloads/**`
- extensions: `src/features/extensions/**`
- settings/platform: `src/features/settings/**`, `src/core/platform/**`
- data: `src/core/db/**`
- native: `plugins/**`, `android/**`
- shared UI: `src/shared/ui/**`
- QA/infra: `tests/**`, `e2e/**`, `scripts/**`, `.github/**`

A PR that changes a feature public API or shared contract needs the owning
reviewer plus one consumer reviewer. A feature-internal PR needs only the
owning reviewer.

## 9. Decision log

- **Feature-sliced, not layer-only.** Group by product capability, then separate
  UI/domain/data inside each feature.
- **Context for stable services, not hot state.** Avoid whole-app re-renders.
- **Core settings, feature settings UI.** Prevent UI imports from becoming
  data-layer dependencies.
- **Explicit feature entry points.** Replace the downloader mega-barrel and
  prevent implementation coupling.
- **Reader last.** It has the highest behavioral risk and strongest contracts.
- **Exactly two reader views: paged and strip.** Paged keeps independent page
  transforms; strip uses one custom virtualized world camera. Both own tap zones.
- **Native mirror stays canonical in `plugins/`.** Generated Android copies are
  outputs, not independent sources.
