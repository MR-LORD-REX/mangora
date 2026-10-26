# Manga feature

Import from `@features/manga` outside this folder. Internal modules import
concrete siblings; the public entry point is reserved for routes and other
features.

## Boundaries

- `app/manga/[slug].tsx` only parses route params and renders `MangaScreen`.
- Provider-specific loading lives in `sources/`; opaque manga and chapter ids
  are never reconstructed from titles.
- Chapter grouping, sorting, filtering and date/search rules are pure domain
  code with focused tests.
- Reader opening preserves the `ChapterSourceModule` contract and records
  history through `@features/library`.
- Shared viewer data contracts live in `@shared/contracts/chapterSource` so
  downloads can consume row shapes without importing this feature.

## Layout

```text
manga/
  screens/          detail and chapter-list composition
  components/
    chapters/       list rows, filters and chapter actions
    detail/         hero, metadata, tags and synopsis
  hooks/            loading, progress, filtering and download state
  domain/           grouping, sorting, search and formatting
  sources/          provider adapters behind ChapterSourceModule
  index.ts           public contract
```

## Validation

```powershell
npx tsc --noEmit --pretty false
npm run check:arch
npx eslint src/features/manga
npx tsx --test src/features/manga/domain/*.test.ts
```
