# User guide source

This directory is reserved for the user-facing guide rendered at `/android/docs`
on the Mangora website. It is intentionally separate from
[`architecture/`](../architecture/) so product instructions do not expose native
module names, database tables or internal import rules.

## Planned scope

| Page | Covers |
| --- | --- |
| Getting started | Install the app, understand the Android build, first launch and required permissions. |
| Extensions and sources | Add a repository, install a source, browse and update or remove an extension. |
| Library and history | Save manga, organise libraries, sort/filter and resume reading. |
| Reader | Paged versus long-strip reading, zoom, tap zones, auto-scroll, reading modes and orientation. |
| Downloads | Choose a storage folder, download chapters, read offline and recover interrupted downloads. |
| Translation | Enable translation, choose free or Gemini, install OCR models and understand network/privacy behavior. |
| Settings and updates | Display defaults, storage, backup/restore, updates and release channels. |
| Troubleshooting | Missing sources, permissions, download recovery, translation limits and how to report a problem. |

## Writing rules

- Write for someone using the installed app, not for a contributor reading code.
- Use the labels and controls visible in the UI; avoid internal feature names.
- Put screenshots and short clips beside the step they explain. Store image
  assets under `docs/appguide/assets/` and use descriptive alternative text.
- Do not promise a cloud service, content catalogue or translation quality that
  the app does not provide. Extensions supply content and can fail independently.
- Explain privacy at the point of use: on-device OCR, optional text sent to the
  selected translation engine, and the extension source's own network policy.
- Keep the reader guide aligned with
  [reader architecture](../architecture/features/reader.md) and the
  [device smoke checklist](../architecture/operations/validation-and-qa.md).
- Every procedure must be reproducible on a release build. If it needs a
  development build, label it as developer-only.

## Publication status

The route and page structure are planned in [`docs/plan.md`](../plan.md). Do not
treat this placeholder as a substitute for tested user instructions; add a page
only when the corresponding release behavior has been verified on a device.