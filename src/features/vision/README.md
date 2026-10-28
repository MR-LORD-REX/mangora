# Vision

Owner: vision / on-device inference (assign a GitHub handle in `CODEOWNERS`).

## Responsibility

This feature turns one decodable page image into text regions and localized
text boxes:

- YOLO text detection (`clean_text`, `messy_text`, `text_bubble`)
- Manga109 speech-bubble segmentation and page-space masks
- PP-OCR model registry, download state, line detection and recognition
- page decoding/cropping helpers used by both detection and OCR

It does not translate text, persist translations or render reader overlays.

## Public API

Consumers import only `@features/vision`. The barrel intentionally exposes
detection/OCR results and model-management operations, not internal engine
classes. Translation and reader code should depend on:

- `detectPageRegions`
- `preparePaddleRegions`
- `recognizePageRegions`
- `ensureDecodablePageUri` and its release function
- `DetectionResult`, `Detection`, `OcrTextItem`, `OcrRegion`

## Boundaries

- May import `@shared/*`, `@core/*` and platform-neutral packages.
- Must not import translation, reader or download features.
- Page pixels stay in natural source-image coordinates.
- Model files remain under `assets/models`; this feature owns their runtime
  contract but not app asset publishing.

## Validation

Vision changes need a TypeScript check plus an on-device run against a real
page when model loading, decoders or coordinates change. Static checks cannot
prove ONNX runtime availability or bubble-mask alignment.

## Contributor checklist

- Add implementation under `detection/`, `segmentation/` or `ocr/`; do not add
  another top-level service mirror.
- Export only the stable consumer surface from `index.ts`.
- Keep `@shared/geometry` as the coordinate vocabulary (`Box`, `Point`) and
  `@shared/contracts/bubbleMask` as the mask contract.
- Do not import translation, reader, downloads or extension internals.
- Update the owning page under `docs/architecture/` and the architecture test if
  a new public operation is added.
