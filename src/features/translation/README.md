# Translation

Owner: translation pipeline and translation settings surfaces.

## Public API

Import from `@features/translation` only. The entry point exposes language
helpers, overlay geometry types, Gemini/Google engine adapters, the page-region
pipeline, quota tracking, the app-wide translation lock and the pre-translate
queue.

## Boundaries

- `domain/` has pure language and overlay contracts. It imports shared ports and
  geometry only.
- `engines/` owns provider request/response shapes. Provider HTTP details never
  leak into screens.
- `pipeline/` turns vision detections plus OCR items into translatable slots.
- `jobs/` owns the one-at-a-time pre-translate scheduler and its runtime lock.
- The feature reads persisted settings through `@core/settings`.
- Downloaded pages and notifications arrive through `DownloadSessionPort` and
  `TranslationNotificationPort`; the queue never imports the downloader barrel
  or notification implementation.
- Translation cache rows live in `services/db/repositories/translationRepository`
  during the current migration and import only shared contracts and core model
  IDs.

## Initialization

`initPretranslateQueue(dependencies)` is called once by
`src/composition/providers/bootstrapRuntime.ts` after notification setup. It
registers the pause/resume/cancel notification command handlers and restores
persisted jobs. Do not import the queue from the notification module.

## Validation

- `npx tsc --noEmit --pretty false`
- `npm run check:arch`
- `npx eslint src/features/translation`
