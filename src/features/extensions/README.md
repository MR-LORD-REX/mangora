# Extensions feature

Import from `@features/extensions` outside this folder. Internal files import
concrete sibling modules to keep the facade out of internal cycles.

## Boundaries

- `@platform/extensions` is the only native host adapter. It parses every JSON
  response at the edge so opaque 64-bit source ids remain strings.
- Repositories, filters and install state belong here, not in routes.
- `app/(tabs)/browse.tsx` and `app/extensions/source/[sourceId].tsx` are thin
  route adapters. Navigation is injected as a callback from the route layer.
- Shared media cards resolve registered image headers through
  `@shared/net/imageHeaders`; do not replace them with bare URIs for extension
  covers.
- `domain/providerLabel.ts` is exported through this feature's public entry
  point for library and downloads labels.

## Layout

- `screens/` composes feature state with browse/source presentation.
- `components/browse/` contains source rows, catalog rows, repository intro and
  empty states.
- `domain/` contains pure filtering, grouping and install-label rules plus tests.
- `hooks/` owns browse data lifecycle and the registry snapshot adapter.
- `library/` loads repositories, persists catalog metadata and detects missing
  sources.
- `installer/` downloads, verifies and launches APK installation.
- `registry/` is the in-memory installed-source source of truth.

## Verification

```powershell
npx tsx --test src/features/extensions/domain/browseFilters.test.ts src/features/extensions/library/repo.test.ts src/features/extensions/filters/filters.test.ts
npm run check:arch
```
