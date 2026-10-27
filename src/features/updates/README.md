# Updates feature

Owner: GitHub release discovery, version comparison and the in-app APK update
flow used by Settings -> About.

## Boundaries

- `data/github.ts` reads published releases and normalizes version tags.
- `services/updater.ts` checks, downloads, verifies and installs an APK. It
  returns plain data so the About section can render each phase.
- Native installer and SHA-256 calls live behind `@platform/native/updater`;
  this feature never imports generated Android files.
- Settings imports only `@features/updates`. The extension installer shares the
  platform bridge but does not depend on this feature.

## Verification

```powershell
npx tsc --noEmit --pretty false
npm run check:arch
npx eslint src/features/updates src/platform/native
```