# Library feature

Import from `@features/library` outside this folder. Internal files import
concrete sibling modules so the public facade never becomes part of a dependency
chain.

## Boundaries

- Membership, cards, filters, library synchronization and reader/history
  tracking belong here.
- Downloaded-only cards are mapped from `@features/downloads`; downloads never
  import this feature.
- Catalog refresh adapters live in `@core/catalog` because downloads and
  library both need them.
- Routes inject navigation callbacks. This feature does not import route or
  composition modules.

## Layout

```text
library/
  screens/       library grid composition
  components/
    cards/       library cards
    filters/     provider and sort controls
    membership/  create, bulk-delete and add-to-library dialogs
  hooks/         screen lifecycle and membership actions
  domain/        pure card mapping and filter rules
  sync/          library membership synchronization
  tracking/      reader open and chapter read-state persistence
  index.ts        public contract
```

## Validation

```powershell
npx tsx --test src/features/library/domain/libraryCards.test.ts
npx tsc --noEmit --pretty false
npm run check:arch
npx eslint src/features/library
```
