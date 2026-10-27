# Reader feature

The reader has exactly two presentation views:

- `paged`: independent page slots, current `FlatList` behavior and per-page
  zoom.
- `strip`: one strip-wide world camera with a custom virtual list; chunks are
  mounting windows only and never own zoom or pan.

Both views use the same tap-zone resolver. Tap zones are a non-interactive
overlay; header, footer and sheets remain above the viewport and receive
touches first. Paged page slots own their press/zoom gestures. Strip page rows
are inert; a viewport tap surface owns both views' tap and long-press handling.

## Layout

```text
components/
  chrome/                 ReaderHeader, ReaderBottomBar, ReaderChromeStack
  overlays/               translation badge/overlay, tap preview, single-page FAB
  page/                   ReaderPage, ZoomablePage, tiled image, text fitting
  panels/                 config, reading-mode, rotation, translation panels
domain/
  modes.ts
  legacyReadingModes.ts
  layout/pageGeometry.ts
  layout/readerItems.ts
  navigation/chapterDirection.ts
  navigation/tapZones.ts
  scroll/autoScroll.ts
hooks/
  usePagedDisplayAnchor.ts
  usePagedTap.ts
  useReaderAutoScroll.ts
  useReaderChapterPages.ts
  useReaderDisplayIndex.ts
  useReaderDownloadState.ts
  useReaderPageDims.ts
  useReaderSessionLedger.ts
  useReaderSettings.ts
state/
  readerSessionReducer.ts
  ReaderSessionProvider.tsx
views/
  ReaderViewport/
    ReaderViewport.tsx
    ReaderViewport.types.ts
  paged/PagedReader.tsx
  strip/
    StripReader.tsx
    stripCamera.ts
    stripCamera.test.ts
screens/
  ReaderScreen.tsx
  readerChapterNavigation.ts
translation/
  scanOcr.ts
  translateWorkers.ts
  readerTranslationPipeline.ts
  cache.ts
  pageState.ts
  types.ts
  useReaderTranslation.ts
index.ts
```

`ReaderScreen` composes the reader session, settings and gesture wiring; page
loading, restore/progress persistence, download metadata and translation now
live in their hooks and `translation/`. `ReaderViewport` owns the paged/strip
presentation branch and viewport overlays. Further screen decomposition and
legacy-shim removal remain Phase 3 work. `ReaderChromeStack.types.ts` and
`useReaderSettings.types.ts` keep large prop/state contracts out of the component and hook implementation files.

`ReaderSessionProvider` owns active page, chrome visibility/settings and
loading state. The route at `app/reader/[id].tsx` only parses route params,
provides navigation callbacks and composes the feature screen.

Paged mode uses the normal React Native `FlatList`. Strip mode uses a custom
virtualized `ScrollView`: only the pages intersecting the viewport plus a
bounded overscan window are mounted, while all pages retain stable world
offsets. The strip viewport owns one camera, viewport tap coordinates and
long-press resolution; camera helpers in `stripCamera.ts` keep scale/pan
math pure and tested. Worklets read only Reanimated shared values, never JS
refs. While zoomed, camera pan is the only vertical pan owner. Page-turn taps
move by 90% of the viewport, divided by the current camera scale, so a tall
webtoon page is never skipped.

Legacy paths under `components/reader` and `utils/reader` remain compatibility
re-exports until the on-device paging, zoom, split/rotate, orientation,
restore and translation-alignment checklist passes.

The required release gate is
[`docs/qa/reader-device-smoke.md`](../../../docs/qa/reader-device-smoke.md).
Static checks (`npm run check`) do not prove gesture, overlay or restore
behavior. The view-model decision is recorded in
[ADR 0002](../../../docs/architecture/adr/0002-reader-two-view-contract.md).
