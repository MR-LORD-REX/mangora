# Settings, onboarding and updates

This page groups three smaller slices that shape the app shell without owning
the reader/catalog pipeline.

## Settings

`@features/settings` owns the settings landing screen, section pages and the
`useAppSettings` hook. Persisted values live in `@core/settings`; a screen never
introduces a second preference file or local duplicate of a persisted setting.

### Routes and sections

`app/(tabs)/settings.tsx` renders a landing list. Each card opens a dedicated
headerless stack page under `app/settings/`:

| Route | Section |
| --- | --- |
| `app/settings/display.tsx` | Display defaults, including extension-source card layout. |
| `app/settings/downloads.tsx` | Wi-Fi downloads and queue concurrency. |
| `app/settings/storage.tsx` | SAF root, backup/restore and storage usage. |
| `app/settings/queue.tsx` | Live/incomplete download jobs. |
| `app/settings/translation-queue.tsx` | Pre-translate jobs. |
| `app/settings/translation.tsx` | Gemini key/model, context and translated-page cache. |
| `app/settings/ocr-models.tsx` | PP-OCR model downloads/deletion. |
| `app/settings/about.tsx` | Version, update flow, links and content preferences. |

`SettingsPage` supplies the back/title/shell. Shared rows, toggles, sliders and
pills live under `components/primitives`; section components stay scoped to their
page.

### Settings contract

- `AppSettings` and `DEFAULT_SETTINGS` live in
  `src/core/settings/settingsSchema.ts`.
- `sanitizeSettings()` validates persisted JSON; add a rule there when adding a
  value that can be malformed.
- `updateSettings()` merges a patch, serializes writes and notifies external
  store subscribers.
- `useAppSettings()` is the React binding; do not read the JSON file or SQLite
  mirror directly from a screen.
- The file-backed settings store is primary; `app_settings` is a best-effort
  mirror and backup/restore source.

The extension-source card layout (`sourceCardLayout`: `grid2`, `grid4`, `list`)
is one persisted value used by both Settings → Display and the source header. A
view change must update that value rather than keep a page-local preference.

### Storage and backup

Settings → Data and storage owns the SAF root picker, database backup/restore and
storage-usage display. Backup is an SQLite snapshot, not a copy of downloaded
CBZ files. Restore replaces app tables and reloads settings from the DB mirror,
then asks for a restart. See
[persistence-and-storage](../runtime/persistence-and-storage.md).

## Onboarding

`@features/onboarding` is a data-driven first-launch guide overlay mounted over
the Library tab.

```text
onboarding/
  components/   overlay and exit confirmation
  data/         guide catalog and placeholder links
  domain/       visibility rules
  index.ts      public API
```

Guides have stable persisted ids. Appending a guide re-shows the overlay only to
users who have not seen that id. Never rename a shipped guide id; it is the key in
`onboardingSeenGuideIds`. `Close forever` sets the persisted opt-out; `Remind me
later` snoozes for the session only.

The guide catalog is not a second navigation system. A CTA may open a supported
guide/release link, but reader settings and feature routes remain the source of
truth.

## Updates

`@features/updates` owns the GitHub release feed and in-app APK update flow used
by Settings → About.

- `data/github.ts` reads published releases, normalizes versions and exposes
  `currentVersion`/`compareVersions`.
- `services/updater.ts` checks, downloads, verifies and installs an APK; it
  returns plain state so the About section can render each phase.
- Native permission/install/SHA calls are behind
  `@platform/native/updater`.
- The extension installer shares the platform installer bridge but does not depend
  on the updates feature.

The release version source is `app.json` → `expo.version`. `package.json` has its
own package version and is not the release tag authority. A release tag must be
`v<app.json version>` or the Android workflow stops in its version check.

The updater verifies the downloaded APK before install. If install permission is
missing, it opens the per-app settings screen and lets the user return/re-check;
declining should offer the website download path rather than looping. Prerelease
inclusion is controlled by `updateIncludePrereleases`.

## Content and age-restricted sources

`ageRestrictedSources` is a persisted safety setting. Share/deep-link flows must
respect it so an unopened external link does not land on an adult source by
default. `safeMode` hides providers marked mature in discovery. Keep this policy
in the shared link/navigation layer, not duplicated in every provider adapter.

## Validation

```powershell
npx tsx --test src/features/settings/settingsContract.test.ts
npm run check
npx eslint src/features/settings src/features/onboarding src/features/updates
```

Device checks: settings persistence across restart, backup/restore, storage root
re-pick, updater permission flow, onboarding seen/snooze/close-forever and
downloaded/translation queue badges.

## Related reading

- [Settings persistence](../runtime/persistence-and-storage.md)
- [Build and release](../operations/build-and-release.md)
- [Navigation](../runtime/navigation.md)
- [Data model](../contracts/data-model.md)