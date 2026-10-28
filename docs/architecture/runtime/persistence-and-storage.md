# Persistence and storage

Mangora has four persistence layers. Each has a different recovery and ownership
model.

| Layer | Location | Primary use |
| --- | --- | --- |
| SQLite | app data (`trapp.db`) | Library, catalog, progress, downloads, translation cache and settings mirror |
| Settings JSON | app documents `trapp-settings/settings.json` | User preferences; primary settings source |
| SAF downloads/backup | user-picked folder | `.cbz` archives, local cover snapshots, metadata index and DB backups |
| App cache | cache directory | Extracted pages, AVIF PNGs, OCR crops, temporary download artifacts |

## SQLite

`src/core/db/client.ts` opens `trapp.db` with foreign keys enabled and Drizzle
attached. `src/core/db/bootstrap.ts` is idempotent: it runs migrations, seeds the
system `Default` and `Downloads` libraries, then mirrors the file-backed settings
into `app_settings` when the mirror is missing.

Repositories under `src/core/db/repositories/` are the database API. Screens
should not import the Drizzle client directly. The schema and inferred types are
in `src/core/db/schema.ts`; migrations are bundled in `src/core/db/migrations.ts`.

The current tables are documented in [data-model.md](../contracts/data-model.md).
The important rule is that `manga.id` and `chapter.id` are canonical
provider-qualified identities, while provider ids remain opaque strings.

## Settings

`src/core/settings/settingsStore.ts` is the authoritative settings store:

- reads `trapp-settings/settings.json` once;
- caches the sanitized value in memory;
- serializes writes through a promise queue;
- notifies external-store subscribers;
- mirrors JSON into `app_settings` best-effort.

The JSON file is the primary source. If the mirror write fails, the setting
still persists to the file and the app continues. `reloadSettingsFromMirror()`
exists for backup restore, where the database is replaced under the running app.

`AppSettings` lives in `settingsSchema.ts`. Add a setting in one place with a
default and a sanitizer rule; do not create a second ad-hoc preference store.

## SAF storage root

`src/core/storage/root.ts` owns the one persisted Android Storage Access
Framework (SAF) root. Downloads and database backups share it. The root is
validated on read; a revoked grant is dropped and the user is asked to pick it
again.

```text
<root>/
  downloads/<provider>/<manga title>/<chapter> ~ <index> ~ <group>.cbz
  downloads/metadata/metadata.json
  backup/mangora-YYYYMMDD-HHmmss.db
```

`src/core/storage/naming.ts` owns safe path segments. It removes filesystem and
URI-hostile characters so titles such as `[Artist] Title` do not break Java URI
handling. Do not build filenames in a screen or native caller.

`src/core/storage/saf.ts` provides the cross-platform/native facade. The native
downloader is required for streaming writes, archive extraction and provider
operations that `expo-file-system` cannot perform on `content://` URIs.

## Downloads

The `downloads` table is the fast operational index and the source of truth for
queue state. A completed row also points at:

- `fileUri` - the `.cbz` in the picked SAF tree;
- `fileName`/`folderUri`;
- `pagesDirUri` - temporary/per-page app-cache files used by offline reading.

`downloads/metadata/metadata.json` is a versioned, atomic recoverable index. It
does not replace validating the archive itself. Recovery compares the index,
SQLite rows and actual archive contents; missing or corrupt archives are
reported instead of being silently marked complete.

The download scheduler starts at app runtime. It uses one global queue, a
foreground Android data-sync service for progress/actions, and the completion
notification port. A completed job leaves the live queue but its row remains for
offline browsing.

## Reader page sessions

`DownloadSessionPort` converts a completed download into page URIs and a cleanup
callback. The reader uses the same local page URI for:

- display;
- YOLO detection;
- OCR crops;
- translation overlays;
- AVIF transcoding when required.

When no cached page files exist, `readerPageSession.ts` extracts the CBZ into a
session-scoped temp directory. Startup clears only abandoned sessions from a
previous process; it must never clear an active reader's session.

## Translation persistence

Completed translated pages are cached in `translation_pages` and
`translation_regions`, keyed by canonical manga id, page key, source/target
language and prompt version. Gemini usage is recorded in `translation_usage`.
The cache stores page dimensions and geometry in natural source-image
coordinates, not viewport coordinates.

## Backup and restore

`src/core/db/backup.ts` serializes the live SQLite database. Restore replaces all
app tables while leaving the schema migration ledger under the running app's
control, then reloads settings from the `app_settings` mirror. The UI asks for a
restart after a restore so every screen reads the restored state.

A backup contains app data, not the user's downloaded CBZ files. Do not describe
it as a full device backup.

## Cache cleanup

- Startup removes abandoned download-page sessions, abandoned OCR crops and the
  legacy reader page cache.
- The settings toggle for clearing reader cache on start is separate from deleting
  downloaded chapters or translation/OCR models.
- AVIF transcodes live under `trapp-avif`; they are safe to regenerate.
- Never delete a live `pagesDirUri` or a user's SAF archive during cache cleanup.

## Related reading

- [Data model](../contracts/data-model.md)
- [Downloads feature](../features/downloads.md)
- [Native modules](../native/native-modules.md)
- [Validation and QA](../operations/validation-and-qa.md)
