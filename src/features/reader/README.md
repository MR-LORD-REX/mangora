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
domain/
  modes.ts
  legacyReadingModes.ts
  layout/pageGeometry.ts
  layout/readerItems.ts
  navigation/tapZones.ts
state/
  readerSessionReducer.ts
  ReaderSessionProvider.tsx
views/
  paged/PagedReader.tsx
  strip/
    StripReader.tsx
    stripCamera.ts
    stripCamera.test.ts
screens/ReaderScreen.tsx
index.ts
```

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
