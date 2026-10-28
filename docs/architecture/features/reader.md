# Reader

The reader is the most constrained feature in Mangora. It has two presentation
views, one shared page identity model, one image path for display/OCR/translation
and a release gate that includes device testing.

## Two views, not many

`readingMode` in settings has three user-visible choices:

- `pagedHorizontal` - one viewport-sized page slot at a time, LTR or RTL;
- `webtoon` - continuous vertical strip with a gap;
- `continuousVertical` - continuous vertical strip with no gap.

`ReaderViewMode` collapses the two strip variants to `strip`; the difference is
layout/gap policy. `PagedReader` is a `FlatList`. `StripReader` is a custom
virtualized `ScrollView` with stable world offsets and a bounded mounted-page
window.

## Layout

```text
src/features/reader/
  screens/ReaderScreen.tsx          session composer
  blocks/                           display row/chrome renderers
  components/chrome/                header, footer and chrome stack
  components/overlays/              translation, tap preview, single-page FAB
  components/page/                  page image, zoom, masks and text fitting
  components/panels/                config, mode, rotation and translation sheets
  domain/
    layout/                         geometry, display items, offsets, slices
    navigation/                     tap zones and chapter direction
    scroll/                         auto-scroll rules
  hooks/                            loading, viewport, gestures, settings, progress
  state/                            reader session reducer/provider
  translation/                     OCR/translation pipeline and page state
  views/paged/                      FlatList presentation
  views/strip/                      strip camera, window and ScrollView
  views/ReaderViewport/             paged/strip branch and viewport overlays
```

`ReaderScreen` composes the session; it does not own every gesture and loader.
`useReaderViewportState` owns body sizing, page dimensions, display rows,
prefetch state and offsets. `useReaderViewportControls` owns list refs, scroll
jumps, paged anchoring, tap handlers and auto-scroll. Loading, progress,
history, downloads and translation live in their dedicated hooks. Large prop
contracts stay in `.types.ts` files beside their consumers.

## Page identity and view layout

`ReaderDisplayItem` is a presentation row, not a source page:

- `url` - the source page image URL;
- `pageIndex` - the original source page index used by progress/history/OCR;
- `half` - `left`/`right` for a split wide page;
- `slice` - a viewport window for a tall paged image;
- `gapAfter` - whether the webtoon gap belongs after this row.

A source page can produce two rows (wide-page split) or multiple rows (tall-page
slices). Progress, translation state and cache keys stay keyed to the original
page URL/index. Do not make a presentation slice into a new source page.

Split and rotate are exclusive: rotate wins when both are enabled. Long-strip
pages always use fit-width geometry; their heights are derived from natural
dimensions so a late load does not reflow the whole strip.

`domain/layout/pageOffsets.ts` is the single owner of row geometry and prefix
offsets. Scroll tracking, paged jumps and FlatList layout all consume that table.
If you need a new offset rule, change it there and add a focused test.

## Gestures and tap zones

- Paged mode uses the page slot's FlatList for horizontal/vertical paging and
  `ZoomablePage` for page-local pinch/pan.
- Strip mode mounts inert page rows. `StripReader` owns one strip camera and the
  viewport tap surface.
- Tap zones are non-interactive overlays; header/footer/sheets receive touches
  first.
- In strip mode, a page-turn tap moves a viewport fraction, not a whole page.
  While zoomed, camera pan is the only vertical pan owner.
- `resolveTapZoneAction` and `tapZoneRectsFor` are pure functions in
  `domain/navigation/tapZones.ts`; invert and RTL rules belong there.
- Device locale never controls page direction. The app layout stays LTR and
  `readerPagedDirection` is the explicit reading-direction switch; see ADR 0004.
- Do not reintroduce a second `ScrollView`/gesture owner in a page row. The
  current single-camera contract is recorded in ADR 0002.

## Image path and overlays

The local reader-cache URI is the one image used by display, detection, OCR and
translation. A downloaded chapter is resolved through `DownloadSessionPort`; a
warm reader-cache entry is reused before asking the extension for pages.

For large Android strip pages, `SubsamplingStripImage` renders the local file
with the native tiled `SubsamplingScaleImageView`. AVIF pages are transcoded to a
cached PNG by `src/core/images/avif.ts` before any decoder sees them.

Translation geometry is stored in natural source-image coordinates. The image
transform, crop/rotate/split geometry and overlay must use the same transform;
placing a second transform on the overlay causes drift.

## Loading, progress and chapters

`useReaderChapterPages` resolves pages (download/local cache or extension),
reports adjacent chapter ids when available and resets the viewport on a chapter
change. `useReaderSessionLedger`/`useReaderPageStatus` persist progress/history.
The reader updates progress on visible-page changes and on unmount, and restores
the saved source page.

Page images are prefetched with a bounded window. The first pages load
immediately; later mounted cells can retain geometry while waiting for their
image slot. Do not make the FlatList load every page just to get dimensions.

## Auto-scroll

Auto-scroll is a reader control, not a global timer. Keep its state in the
reader viewport controls and use the current camera/offset after resize or zoom.
A resize invalidates stale offset math; re-derive the target from the current
layout instead of caching a pre-zoom coordinate. Do not add a second scrolling
loop in a strip page or the chrome.

The reader has had regressions where the loop survived a resize but used stale
bounds. When changing this area, test: start, pause, zoom in/out, rotate/resize,
chapter change, and resume. A passing TypeScript check is not enough.

## Settings and chrome

`ReaderChromeSettings` is defined in `src/core/settings/readerChrome.ts`; the
settings panel maps it to persisted `AppSettings`. `camera` and UI state that is
local to one route belongs in `ReaderSessionProvider`, not the settings store.

The config/translation panels share the panel sheet motion and primitive
components. Panel state (open/closed, active tab, drafts) is local to the
reader. Do not add a global overlay for a reader-only sheet.

## Native image surface

`plugins/android/subsampling/` is canonical. The config plugin copies it into
the generated Android project and registers the React package. The native view
is a non-interactive tiled bitmap surface in the current design: `ZoomablePage`
owns gestures. Re-enabling native pan/zoom without moving the overlay to the
same transform will misalign translations.

## Validation

Static checks:

```powershell
npm run check
npx eslint src/features/reader
npx tsx --test src/features/reader/views/strip/stripCamera.test.ts
```

Reader changes also require the on-device smoke test in
[operations/validation-and-qa.md](../operations/validation-and-qa.md). Test
paged/strip switching, tap zones, pinch/pan, split/rotate, crop, orientation,
progress restore, chapter navigation, downloads and translation alignment.

## Related decisions and pages

- [ADR 0002](../adr/0002-reader-two-view-contract.md)
- [Reader device validation](../operations/validation-and-qa.md)
- [Downloads](downloads.md)
- [Translation and vision](translation-and-vision.md)
- [Settings and storage](../runtime/persistence-and-storage.md)
