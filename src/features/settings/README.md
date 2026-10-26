# Settings feature

Owner: settings screens, section composition and the React settings hook.

## Boundaries

- Persisted settings, schema validation, backup and storage accounting live in
  `@core/settings`.
- Routes under `app/settings/` are thin adapters that import screens from
  `@features/settings`.
- Feature sections import shared primitives and other features only through
  their public entry points.
- Hot settings state is read through `useAppSettings`, which wraps
  `useSyncExternalStore`; it is not placed in root React context.

## Layout

```text
settings/
  screens/       settings landing and dedicated section screens
  components/
    layout/      full-screen settings shell
    primitives/  rows, toggles, sliders and action pills
    sections/    about, downloads, OCR, queue, storage and translation
  hooks/         React binding for the core settings store
  index.ts       public route and hook API
```

## Validation

```powershell
npx tsc --noEmit --pretty false
npm run check:arch
npx eslint src/features/settings src/core/settings
npx tsx --test src/features/settings/settingsContract.test.ts
```
