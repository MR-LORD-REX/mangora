# Translation and vision

Translation is a pipeline across three feature slices. Vision finds and reads
text; translation turns recognized regions into translated slots; the reader
owns per-page presentation and optional translation controls. The same engine,
cache-key and quota policy is used by the reader and the pre-translate queue.

## Pipeline at a glance

```text
local reader page URI
  -> vision: decode/crop page
  -> YOLO detection + bubble segmentation
  -> PP-OCR text recognition
  -> translation: group text into slots
  -> Google or Gemini engine
  -> reader: render overlay in source-image coordinates
  -> SQLite translation cache
```

OCR/model inference stays on device. Optional translation sends recognized text
to the selected Google/Gemini endpoint. Extension network requests are separate
and depend on the installed source.

## Vision feature

`@features/vision` owns:

- YOLO text/bubble detection (`detection/`);
- Manga109 bubble segmentation (`segmentation/`);
- PP-OCR model registry/download/runtime (`ocr/models`, `ocr/recognizer`,
  `ocr/detector`, `ocr/runtime`);
- page decode/crop helpers shared by detection and OCR.

It does not translate, persist translations or render overlays. Consumers import
the public operations (`detectPageRegions`, `preparePaddleRegions`,
`recognizePageRegions`, decode helpers and model management) rather than engine
internals.

Model files are downloaded by the user for PP-OCR; bundled YOLO/segmentation
assets live under `assets/models`. Do not move model files into a feature without
checking `app.json`/Expo asset packaging. Cache cleanup must not delete user
models.

Coordinates stay in natural source-image space. A crop helper must not silently
switch to screen coordinates; the reader applies one transform to image and
overlay.

## Translation feature

`@features/translation` owns:

| Folder | Responsibility |
| --- | --- |
| `domain/` | Language mapping, engine-agnostic slots and page state types. |
| `engines/google/` | Free translation request/response adapter. |
| `engines/gemini/` | Gemini client, model catalogue, fallback and quota accounting. |
| `pipeline/` | Build slots from detection boxes and OCR text. |
| `jobs/` | Pre-translate queue and one-at-a-time runtime lock. |
| `components/` | Pre-translate dialog only. |

The public contract exposes language helpers, overlay geometry types, engine
adapters, region assembly, quota/lock controls and queue operations. Provider
HTTP details must not leak into screens.

Two engines:

- `free` - no API key; recognized text is sent to the free Google endpoint.
- `ai` - Gemini with the configured key/model, optional prior-page context and
  model fallback.

Translation modes in the reader are `off`, `single` and `auto`. Auto translates
the visible page and a look-ahead window; a page waits for its full OCR pass
before translation starts. The old auto-bubble mode is deliberately absent.

Gemini requests are rate-metered and usage is recorded in `translation_usage`.
A rate limit can try the next catalogue model once. Repeated automatic model
switches that fail persist `readerAutoModelSwitch = false` until the user turns it
back on. Stopping cancels queued work and ignores late results; network requests
are not transport-aborted in the current implementation.

## Pre-translate queue

`initPretranslateQueue(dependencies)` is called by composition only after
notifications initialize. It registers pause/resume/cancel handlers and restores
persisted jobs. Its dependencies are ports, not feature imports:

- `DownloadSessionPort` for chapter page files;
- `TranslationNotificationPort` and notification command port.

A job snapshots the active model, auto-switch state, context pages and
recognition batch at enqueue time. Before its first page it re-materializes the
chapter through the download session so a cold start or LRU eviction cannot leave
a stale file URI. Jobs clean up temporary extraction sessions when finished.

The runtime lock prevents a reader translation and a background pre-translate from
using the expensive OCR/translation pipeline at the same time.

## Reader integration

`useReaderTranslation` constructs one `ReaderTranslationPipeline` for the route.
It updates engine/config/page/current-index inputs and exposes snapshot plus
actions. The page overlay is owned by the reader feature and uses translation
slot types from the public translation contract.

Completed pages are cached in:

- `translation_pages` - canonical manga/chapter/page identity, languages, model,
  prompt version and image dimensions;
- `translation_regions` - region text and natural-pixel geometry.

A cache hit restores the overlay without repeating detection/OCR. The prompt
version is part of the identity so a prompt change can invalidate old geometry.

## Adding an engine

1. Implement against the engine-neutral request/response contract.
2. Keep HTTP/crypto/config resolution in `engines/`.
3. Add rate/quota behavior where it belongs, not in the reader component.
4. Preserve source/target language normalization and slot ordering.
5. Make failure states visible to the pipeline; do not throw raw provider text
   into UI.
6. Update the translation README, this page and the API surface docs.

Never send page images to a translation provider unless the privacy/product
contract explicitly changes. The current translation payload is recognized text
(plus optional prior-page context in AI mode).

## Adding an OCR/model change

- Keep model IDs stable and versioned in the model registry.
- Treat download/cancel/delete as external-store operations.
- Do not block the reader UI on a model download.
- Validate with a real page on device: ONNX runtime availability, image decode,
  bubble-mask alignment, line fitting and overlay geometry cannot be proven by
  TypeScript alone.
- Check third-party model licenses in `THIRD-PARTY.md` before redistribution.

## Validation

```powershell
npm run check
npx eslint src/features/translation src/features/vision src/features/reader
```

Device checks: download/delete an OCR model, translate a single page in both
engines, enable auto translation and scroll through a window, stop/restart,
rotate/split/crop, revisit a cached page and run a pre-translate job while the
reader is closed. Verify overlays remain aligned after each transform.

## Related reading

- [Reader](reader.md)
- [Downloads](downloads.md)
- [Data model](../contracts/data-model.md)
- [Third-party notices](../../../THIRD-PARTY.md)
