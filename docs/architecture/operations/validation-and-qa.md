# Validation and QA

Mangora has three validation layers: static checks, native build checks and
on-device interaction checks. They answer different questions and none is a
substitute for the others.

## Static checks

From `TrApp`:

```powershell
npm run check
```

This runs:

- `tsc --noEmit` (`check:types`);
- the architecture checker (`check:arch`);
- all `*.test.ts` files under `src/features` through `scripts/run-tests.mjs`.

Focused commands:

```powershell
npx eslint src/features/reader src/features/downloads
npx tsx --test src/features/reader/views/strip/stripCamera.test.ts
npx tsx --test src/features/extensions/domain/browseFilters.test.ts
npx tsx --test src/features/settings/settingsContract.test.ts
npm run docs:graph
npm run docs:check
npm run docs:test
npm run docs:links
```

Do not add a test runner dependency without checking the existing `tsx`/Node test
setup. Tests are discovered by `scripts/run-tests.mjs`; name feature tests
`*.test.ts`.

## Build checks

A TypeScript pass does not prove native linkage. For native changes:

- refresh the generated Android project from `plugins/`;
- build a development or release APK;
- verify the module is registered and the JS capability check is true;
- test a clean install and an update/restore path.

Use the release workflow for CI parity:

```powershell
npx expo export --platform android --output-dir "$env:TEMP\android-export"
```

The PR workflow runs `npm run check` and the Android export. The release workflow
builds both ABIs and is the authority for tagged artifacts.

## Reader device smoke test

Run this after any reader, zoom, scroll, overlay or orientation change:

**Open and restore**
- [ ] Open a chapter from a source, library, history and downloaded view.
- [ ] Close/reopen the reader and confirm the saved source page is restored.
- [ ] Open a chapter whose extension/source is missing; show a clear error, not a
  crash or blank screen.

**Paged**
- [ ] Swipe/tap forward and backward (LTR and RTL).
- [ ] Pinch/zoom, pan, double-tap and zoom out; page-turn and reset behavior.
- [ ] Split wide pages and rotate wide pages to fit; verify overlay alignment.
- [ ] Crop borders; verify image and translation remain aligned.
- [ ] Change orientation and keep the current page.

**Strip**
- [ ] Scroll, fling and stop; no jitter or page-window gaps.
- [ ] Tap zones and long press select the visible page.
- [ ] Zoom in/out, then pan; the camera is the only vertical owner.
- [ ] Resize/rotate and continue reading; auto-scroll still follows the correct
  offset and can be started again.
- [ ] Start/pause auto-scroll, change speed, zoom and resume.

**Chrome and panels**
- [ ] Header/footer show/hide without swallowing page taps.
- [ ] Config and translation sheets slide from the bottom, tabs switch without
  replaying an animation or blanking, and dropdowns remain interactive.
- [ ] Page actions, chapter navigation and reading-mode changes work.

**Downloads/images**
- [ ] SAF folder pick/re-pick, archive download, foreground notification actions.
- [ ] Offline open/extraction and cleanup after leaving the reader.
- [ ] AVIF page decode and tiled long-strip rendering.

**Translation**
- [ ] Single-page and auto translation with both engines.
- [ ] Overlay remains aligned after zoom, crop, split, rotate and orientation.
- [ ] Cached translation restores on revisit; stop cancels work.
- [ ] Pre-translate queue pause/resume/cancel and cold-start materialization.

## Download/storage smoke test

- [ ] Pick a folder with a space/bracket-heavy manga title.
- [ ] Download one chapter and a series selection.
- [ ] Confirm the CBZ exists under the expected SAF layout.
- [ ] Kill/background the app and verify the foreground service state.
- [ ] Cancel a page/chapter; no temporary pages remain.
- [ ] Recover metadata when `metadata.json` is missing/out of date.
- [ ] Delete a download; verify the row/archive/page cache behavior.
- [ ] Back up and restore; confirm library/progress/settings/history return and
  downloaded archives remain on disk.
- [ ] Confirm a refused notification permission does not block downloads.

## Extension smoke test

- [ ] Add a repository with a cached/failing response.
- [ ] Install, update and uninstall an extension; registry refreshes.
- [ ] Verify package/version/signature mismatch blocks install.
- [ ] Browse/search/filter a source; reset filters and reopen the source.
- [ ] Open manga detail and reader; opaque ids survive route round trips.
- [ ] Verify a missing source appears in migration/recovery UI.

## Release checklist

- [ ] `app.json` version matches the tag `v<version>`.
- [ ] `npm run check` passes.
- [ ] docs graph regenerated and `npm run docs:check` passes.
- [ ] Both ABI builds produced APKs (or the release explicitly notes a missing
  architecture).
- [ ] APK signing certificate is the release key, not the debug fallback.
- [ ] VirusTotal/security artifact step completed when configured.
- [ ] Release notes and website release metadata point at the same version.
- [ ] Device smoke test performed on a build made from the release source.

## When a check fails

Fix the root cause or document why the check is not applicable. Do not bypass the
architecture checker, weaken a test to pass, or hide a native capability failure
behind an empty UI. If an unrelated failure exists, isolate it from the change and
report it rather than rewriting the failing subsystem.

## Related reading

- [Build and release](build-and-release.md)
- [Reader](../features/reader.md)
- [Downloads](../features/downloads.md)
- [Boundaries](../boundaries.md)
