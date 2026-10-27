# Onboarding feature

Owner: first-launch guides, session snooze and guide completion state.

## Boundaries

- `OnboardingOverlay` is mounted by the library screen through
  `@features/onboarding`.
- `data/onboardingGuides.ts` is the content source. Guide ids are persisted
  settings keys; never rename a shipped id.
- `domain/onboardingState.ts` owns the visibility rules and session-only
  snooze. Persisted completion remains in `@core/settings`.
- The feature may import `@shared/*` and `@core/*`; it does not import library,
  reader or route code.

## Layout

```text
onboarding/
  components/   overlay and exit confirmation
  data/         guide catalog
  domain/       visibility rules
  index.ts      public API
```

## Validation

```powershell
npx tsc --noEmit --pretty false
npm run check:arch
npx eslint src/features/onboarding
```
