# Translation and vision

Translation is a pipeline across three feature slices. Vision finds and reads
text; translation turns recognized regions into translated slots; the reader
owns per-page presentation and optional translation controls. The same engine,
cache-key and quota policy is used by the reader and the pre-translate queue.

## Pipeline at a glance

```text
local reader page URI
  -> vision: decode/crop page
  -> exactly one selected region detector
     (RT-DETR Comic v4 | Manga109 bubble segmentation)
  -> PP-OCR text recognition
  -> translation: group text into slots
  -> free Google or OpenAI-compatible engine
  -> reader: render overlay in source-image coordinates
  -> SQLite translation cache
```

OCR/model inference stays on device. Optional translation sends recognized text
to the selected translation endpoint. Extension network requests are separate
and depend on the installed source.

## Vision feature

`@features/vision` owns:

- two peer, mutually exclusive region detectors (`detection/`,
  `segmentation/`): RT-DETR Comic v4, the default, and Manga109 bubble
  segmentation;
- detector-independent roles (`bubble`, `text_in_bubble`, `free_text`)
  and optional bubble masks;
- PP-OCR model registry/download/runtime (`ocr/models`, `ocr/recognizer`,
  `ocr/detector`, `ocr/runtime`);
- downloadable detector registry/storage (`models/`);
- page decode/crop helpers shared by detection and OCR.

It does not translate, persist translations or render overlays. Consumers import
the public operations (`detectPageRegions`, `preparePaddleRegions`,
`recognizePageRegions`, decode helpers and model management) rather than engine
internals.

Both PP-OCR packs and region detectors are downloaded by the user. Region
detector files live under `<documents>/models/region/<detector-id>/`; OCR packs
live under `<documents>/ocr-models/<model-id>/`. The reader runs exactly one
detector per page and never silently falls back when the selected model is
missing. Downloads are size-verified; SHA-256 is recorded in the catalog but is
not yet enforced at runtime. Cache cleanup must not delete user models.

The region catalog contains RT-DETR Comic v4 and Manga109 segmentation. The
Manga109 file is pinned to the Mangora GitHub repository at commit
`c9877b414e0a0443aeeb4eb95e522b7fd9f8c290`; the legacy YOLO detector has been
removed. Persisted `legacy-yolo` values sanitize to RT-DETR.

Coordinates stay in natural source-image space. A crop helper must not silently
switch to screen coordinates; the reader applies one transform to image and
overlay.

Bubble geometry uses the per-edge midpoint of the bubble box and its paired text
box for both OCR cropping and translated-text rendering. Free text keeps the
detected box. A mask-only detector supplies no text box, so its bubble crop is
used for OCR first; after OCR, the final paste box is moved to the midpoint of
the bubble and recognized text extent before rendering.

## Translation feature

`@features/translation` owns:

| Folder | Responsibility |
| --- | --- |
| `domain/` | Language mapping, engine-agnostic slots and page state types. |
| `engines/google/` | Free translation request/response adapter. |
| `engines/openai/` | OpenAI-compatible chat-completions adapter and usage mapping. |
| `engines/shared/` | Strict prompt, batch validation and model fallback. |
| `pipeline/` | Build slots from detection boxes and OCR text. |
| `jobs/` | Serial pre-translate queue and reader-priority vision coordinator. |
| `components/` | Pre-translate dialog only. |

The public contract exposes language helpers, overlay geometry types, engine
adapters, region assembly, quota/lock controls and queue operations. Provider
HTTP details must not leak into screens.

Two engines:

- `free` - no API key; recognized text is sent to the free Google endpoint.
- `openai` - sends recognized text to the OpenAI-compatible endpoint configured
  in Settings > Translation. Gemini is only the default endpoint, not a second
  transport.

The adapter is Mangora's fetch-based `openaiClient`, not the official Node SDK.
It posts to `${baseUrl}/chat/completions`, adds Bearer auth when a key is
present, reuses the shared strict JSON prompt/validator, and retries a `400`/`422`
response once without `response_format` for local servers that reject JSON mode.
Loopback and private-LAN endpoints may be keyless; public endpoints require a
key. HTTP endpoints are supported with a visible warning and Android cleartext
traffic enabled. The reader, batch runner and pre-translate dialog share one
provider readiness check.

Translation modes in the reader are `off`, `single` and `auto`. Auto translates
the visible page and a look-ahead window; a page waits for its full OCR pass
before translation starts. The old auto-bubble mode is deliberately absent.

AI requests are usage-metered and recorded in `translation_usage`. Provider and
endpoint identity are stored with each row, so endpoints do not consume each
other's counters by sharing a model name. The Metrics tab shows Gemini
used/limit values only for Gemini's hosted endpoint; other endpoints show only
RPM/TPM/RPD use with no assumed limits. A rate limit can try the next configured
model once. Repeated automatic model switches that fail persist
`readerAutoModelSwitch = false` until the user turns it back on. Stopping cancels
queued work and ignores late results; network requests are not
transport-aborted in the current implementation.

AI context is selected by page position, never OCR completion order. The reader
uses in-memory pages and hydrates missing prior pages from the translation cache,
so restarting mid-chapter does not lose context. All OpenAI-compatible requests
share the same strict prompt: history is context only, and every current-batch
region must be returned exactly once.

## Pre-translate queue

`initPretranslateQueue(dependencies)` starts alongside notification setup. It
restores jobs before accepting pause/resume/cancel commands. Its dependencies
are ports, not feature imports:

- `DownloadSessionPort` for chapter page files;
- `TranslationNotificationPort` and notification command port.

A job snapshots the provider endpoint, requested translation model, region detector, auto-switch
state, context pages and recognition batch at enqueue time. Before its first
page it re-materializes the
chapter through the download session so a cold start or LRU eviction cannot leave
a stale file URI. Jobs clean up temporary extraction sessions when finished.

The pre-translate dialog exposes both the translation engine and a detection
model selector. A detector that is not downloaded blocks queueing with a direct
link to Settings > Models.

The reader checks the page cache before asking for expensive compute. Cache hits
restore overlays while another chapter is being pre-translated. Cache misses
share one vision permit with the background job; reader detection/OCR takes
priority after the current vision operation settles. Network translation can
proceed while the other caller owns the vision permit. A synchronous SQLite
transaction writes each page row and its regions atomically.

The queue keeps one chapter active. Pause and cancellation take effect at safe
await boundaries, including before a cache write. Notification actions carry a
job ID so an old notification cannot control a later chapter. Running and
paused notifications expose only applicable actions; terminal jobs replace the
live notification with an action-free summary. The JS queue pauses off foreground
and resumes on return.

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
