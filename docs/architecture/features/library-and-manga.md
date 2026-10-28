# Library and manga

The library and manga slices share the catalog and reading history, but they own
different surfaces. Library owns saved membership and cards; manga owns the
shared detail/chapter browser used after a source result is opened.

## Library feature

```text
src/features/library/
  screens/       library grid
  components/    cards, filters, membership dialogs
  hooks/         screen lifecycle and membership actions
  domain/        pure card mapping and filter rules
  sync/          library membership synchronization
  tracking/      reader-open and read-state persistence
  index.ts       public API
```

Responsibilities:

- map catalog rows and downloaded-only rows into library cards;
- add/remove a manga from one or more named libraries;
- filter by provider and sort by date/unread/provider;
- refresh tracked manga with bounded concurrency;
- record an opened chapter and update progress/history.

The `Downloads` library is a virtual/system collection backed by downloaded
rows. It is never user-editable. Downloaded-only cards are mapped through the
downloads public API; downloads must not import library.

## Manga feature

```text
src/features/manga/
  screens/       detail view and chapter list
  components/    hero/metadata and chapter rows
  hooks/         loading, progress, filters, downloads
  domain/        grouping, sorting, search, date and formatting rules
  sources/       extension source adapter
  index.ts       public API
```

The manga route parses `slug`, `provider`, optional `thumbnailUrl` and
`downloadsOnly`. It passes those values to `MangaScreen`; the screen does not
construct provider ids from the display title.

`downloadsOnly` skips network loading and shows only downloaded chapters while
preserving search/sort/group filters. Opening a downloaded chapter records
history/progress exactly like an online chapter.

## Provider identity and adapters

`src/core/catalog` owns the provider-neutral sync path:

- `canonicalId()` builds canonical DB ids;
- `providerAdapters.ts` resolves an `ext:<sourceId>` adapter;
- `catalogSync.ts` upserts one manga/chapter snapshot and deduplicates in-flight
  syncs;
- `loadChapterPages.ts` resolves extension pages and registers image headers.

The manga source adapter maps native extension results into
`ChapterSourceModule` contracts. Extension ids are opaque: `manga.url` and
`chapter.url` are passed back unchanged. Do not URL-decode/re-encode manually
outside the identity helpers, and do not build an id from a title.

## Sync policy

Library data is refreshed:

- once at startup after the database is ready;
- when the Library screen is focused/opened;
- when the user chooses Update library from the library menu.

The sync should upsert new metadata/chapters, preserve progress/history and
isolate errors per provider/manga. Use the bounded concurrency and existing
catalog adapter instead of adding a screen-specific fetch loop.

## Reading state

`reading_progress` has one row per chapter. `reading_history` stores the latest
reader route snapshot and display metadata for a manga/chapter. A history row
contains the exact reader params so it can reopen the same provider identity.
The reader updates progress on visible-page changes and on unmount.

Do not delete downloaded rows when clearing history. Do not mark a downloaded
chapter completed merely because its archive exists.

## UI and navigation

Routes inject navigation callbacks. The library can open a manga detail or a
download-only manga screen; the manga screen can open the shared reader. A
feature must not import `app/` or `@composition/*`.

When adding a card action, keep the decision in domain/hooks and the button in
components. Confirmation dialogs belong to the feature that owns the mutation,
not to a shared global dialog.

## Validation

```powershell
npx tsx --test src/features/library/domain/libraryCards.test.ts
npx tsx --test src/features/manga/domain/*.test.ts
npm run check
npx eslint src/features/library src/features/manga
```

On-device checks: add/remove from multiple libraries, filter/sort, reopen a
library card, downloaded-only view, reader progress/history, and a chapter whose
extension is missing.

## Related reading

- [Extensions](extensions.md)
- [Reader](reader.md)
- [Data model](../contracts/data-model.md)
- [Catalog sync](../contracts/shared-ports.md)