# Translation

Owner: translation pipeline and translation settings surfaces.

## Public API

Import from `@features/translation` only. The entry point exposes language
helpers, overlay geometry types, the free Google adapter, the
OpenAI-compatible adapter, provider resolution, the strict batch
prompt/validator, the page-region pipeline, provider-aware usage tracking, the
reader-priority vision coordinator and the pre-translate queue. Provider readiness is
exported so the reader, pretranslate and batch runner cannot drift on
key/model/keyless-LAN rules.

## Boundaries

- `domain/` has pure language and overlay contracts. It imports shared ports and
  geometry only.
- `engines/` owns provider request/response shapes. Provider HTTP details never
  leak into screens.
- `pipeline/` turns vision detections plus OCR items into translatable slots.
- `jobs/` owns the serial pre-translate scheduler and shared vision permit.
- The engines are `free` and `openai` only. Gemini is the default base URL for
  the OpenAI-compatible engine, not a separate transport.
- Resumed pretranslate jobs restore cached prior-page context for the
  OpenAI-compatible engine.
- A queued chapter yields expensive detection/OCR work to reader pages. The
  reader checks its SQLite cache before requesting the vision permit.
- Pause and cancel are keyed to the active job, even while a page is in flight.
  The job checkpoints at stage boundaries and cancelled jobs are removed only
  after their current operation settles.
- A job freezes provider endpoint and requested model identity; the API key may
  still be rotated in Settings. The actual fallback model remains row metadata.
- The feature reads persisted settings through `@core/settings`.
- Downloaded pages and notifications arrive through `DownloadSessionPort` and
  `TranslationNotificationPort`; the queue never imports the downloader barrel
  or notification implementation.
- Translation cache rows live in `@core/db/repositories/translationRepository`
  during the current migration and import only shared contracts and core model
  IDs.

## Initialization

`initPretranslateQueue(dependencies)` starts alongside notification setup in
`src/composition/providers/bootstrapRuntime.ts`. It restores persisted jobs
before accepting commands and registers handlers keyed by job ID. Notification
presentation follows queue state, replaces live progress with an action-free
completion or failure summary, and clears after cancellation.
Background execution still pauses until the app returns to the foreground.
Do not import the queue from the notification module.

## Validation

- `npx tsc --noEmit --pretty false`
- `npm run check:arch`
- `npx eslint src/features/translation`
