# Reader device smoke test

Use this checklist for any PR that changes reader presentation, gestures,
caching, translation overlays or native reader code. Static checks do not
prove touch or image behavior.

## Setup

- Device/emulator: Android, portrait and landscape supported.
- App package: `com.mangora.app`.
- Build with the canonical native sources under `plugins/`; do not hand-edit
  only the generated files under `android/`.
- Debug install: start Metro with `npx expo start --dev-client`, then run
  `adb reverse tcp:8081 tcp:8081` after install or reboot.
- Capture failures with `adb logcat -s ReactNativeJS:V` and note the exact
  source/page and reading mode.

## Baseline

- [ ] Open a network chapter from at least one extension source.
- [ ] Open the same chapter after downloading it.
- [ ] Paged vertical and paged horizontal LTR/RTL reach the same source pages.
- [ ] Strip webtoon and gapless strip show a continuous column with the chosen
  page gap.
- [ ] Header, footer and sheets are above the page and receive taps first.

## Paged view

- [ ] Swipe/tap previous and next at the edges and in the middle toggle zone.
- [ ] Original-fit pinch zoom, two-finger pan, double-tap zoom and zoom reset
  work without fighting the pager.
- [ ] Split wide pages show the correct half order in LTR and RTL.
- [ ] Rotate wide pages fits the page without losing the visible source page.
- [ ] Orientation change preserves the current source page and overlay
  alignment.
- [ ] Long-press opens page actions only when the setting is enabled.

## Strip view

- [ ] Ordinary one-finger vertical scrolling works.
- [ ] Tap `previous`/`next` moves by roughly 75% of the viewport, including a
  page taller than the screen; content is not skipped.
- [ ] Tap `toggle` opens the reader chrome and does not turn the page.
- [ ] Long-press resolves the source page under the finger and opens actions.
- [ ] Pinch keeps the content under the focal point anchored, including near
  the top and bottom edges.
- [ ] While zoomed, one-finger pan is owned by the camera; the list does not
  also scroll.
- [ ] Pan clamps at left/right and at the first/last page without blank space.
- [ ] Zooming back to 1x restores normal list scrolling and the same visible
  source page.
- [ ] Only the current page and its bounded neighbors are mounted while
  scrolling a long chapter.
- [ ] Tap zones work at 1x and while zoomed.

## Translation and overlays

- [ ] Translation regions stay on the source artwork after fit, crop, split,
  rotate, zoom and chapter changes.
- [ ] Hide-translated and page-status toggles do not shift the image.
- [ ] OCR/translation run only against the shared local reader-cache URI.

## Restore and transitions

- [ ] Close and reopen the reader; saved page and normalized position restore.
- [ ] Previous/next chapter transition keeps the expected page and overlay
  alignment.
- [ ] Reopen a downloaded chapter without network and reach the same page.

## Evidence

Record the PR number, commit SHA, device model/Android version, reading modes
tested, pass/fail per section, and links to screenshots or logcat snippets.
Do not mark reader work complete if any baseline or affected section is
unverified.
