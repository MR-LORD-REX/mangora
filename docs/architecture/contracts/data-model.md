# Data model

`src/core/db/schema.ts` is the authority. This page explains the tables and the
invariants that are not obvious from column names. Migrations live in
`src/core/db/migrations.ts`; repositories live beside the schema.

## Identity model

```text
provider:providerMangaId                 canonical manga id
  -> manga.id
provider-chapter identity
  -> chapter.id
```

For extension providers, the provider key is `ext:<sourceId>`. The manga and
chapter provider ids are opaque strings returned by the extension; the app does
not reconstruct them from display titles. Legacy provider strings remain readable
so old rows do not crash, but new extension loading only accepts `ext:`.

`manga` enforces uniqueness on `(provider, providerMangaId)`.
`chapters` enforces uniqueness on `(mangaId, providerChapterId)`.
`downloads` uses the canonical chapter id as its primary key.

## Core tables

### `libraries`
A named collection. `Default` and `Downloads` are seeded idempotently. They are
system-owned; rename/delete refuse them. Names are unique.

### `manga`
Provider-qualified title snapshot and sync status. Stores title, thumbnail,
description, added time, last sync time/error and timestamps.

### `library_manga`
Many-to-many membership join. Composite primary key
`(libraryId, mangaId)`, cascade cleanup and indexes for both lookup directions.
Pinned is per-library membership state.

### `chapters`
Provider chapter metadata: title, number, scanlation group, group key, volume,
language, page count, publication/sync times and timestamps. A chapter never
exists without its manga.

### `reading_progress`
One row per chapter. Status is `unread | reading | completed`; stores last page
index/count and timestamps. This is the quick progress lookup for library and
manga rows.

### `reading_history`
Latest route snapshot and display metadata for a chapter/manga. Stores the exact
reader params so history can reopen the same provider identity; a unique chapter
index keeps one latest entry. Deleting history is independent of deleting
library membership or downloads.

### `app_settings`
A mirrored JSON document of the file-backed settings store. It exists for backup
and recovery and is best-effort. The file under `trapp-settings/` remains primary
during normal operation.

### `translation_pages`
One cached translated page keyed by canonical manga id, page key, source/target
language and prompt version. Also stores model, image dimensions and timestamps.
A different prompt version deliberately creates a new identity.

### `translation_regions`
Text and natural-source-pixel geometry for each page region, cascading from
`translation_pages`. Geometry is JSON because the bubble/paste/erase shapes are
feature-owned.

### `translation_usage`
One Gemini attempt per row: model, occurrence, success, input/output tokens and
error code. It is the source of truth for RPM/TPM/RPD meters.

### `downloads`
One downloaded chapter/gallery archive. The row is both queue state and offline
catalog state:

- canonical chapter id is the primary key;
- provider metadata and display snapshots make the offline view independent of
  a live extension response;
- `status` is `queued | running | paused | failed | completed`;
- `fileUri`/`fileName`/`folderUri` point into the picked SAF tree;
- `pagesDirUri` points at per-page app-cache files used by offline reading;
- `thumbnailPath` is a local cover snapshot for offline strips.

A completed row must point at a validated archive. Do not mark a row completed
from an HTTP success alone.

### `download_folders`
The one persisted SAF root and its `downloads/` child, with grant/update times.
This is storage metadata; the actual folder grant is checked on read and dropped
when revoked.

## Relationship summary

```text
libraries 1---* library_manga *---1 manga
manga     1---* chapters
chapters  1---1 reading_progress
manga     1---* reading_history  (chapter may be null after cleanup)
chapters  1---* downloads      (canonical chapter id is the queue key)
manga     1---* translation_pages
translation_pages 1---* translation_regions
downloads 1---* download_folders (conceptually one configured root)
```

The schema does not put a foreign key on every operational identity because
offline/download rows need to survive a missing extension metadata row. Preserve
that recovery behavior when adding constraints.

## Adding or changing a table

1. Update `src/core/db/schema.ts` and exported row types.
2. Add a new numbered migration in `src/core/db/migrations.ts`; never edit an
   already-shipped migration to change production data semantics.
3. Update the repository and its tests.
4. Update this page and the generated API inventory.
5. Test on an existing database as well as a fresh install.
6. Check backup/restore, because it copies every app table.

## Settings are not a table dump

Do not add a column for every setting to `app_settings`; it stores the JSON mirror.
Settings belong in `settingsSchema.ts` with a default and sanitizer. Reader-local
state belongs in `ReaderSessionProvider`, not the database.

## Related reading

- [Persistence and storage](../runtime/persistence-and-storage.md)
- [Shared ports](shared-ports.md)
- [Downloads feature](../features/downloads.md)
- [Translation and vision](../features/translation-and-vision.md)