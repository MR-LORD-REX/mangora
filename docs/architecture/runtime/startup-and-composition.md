# Startup and composition

The root layout is deliberately small. Startup policy lives in composition so a
navigation file never owns database or queue lifecycle.

## Provider tree

```text
GestureHandlerRootView
  ThemeProvider (React Navigation dark theme)
    MotionProvider (reduced-motion preference)
      AppServicesProvider (stable AppServices object)
        AppBootstrapGate (loading | ready | error)
          OverlayHostProvider
            Stack
            DownloadSheetHost
```

The source of truth is `app/_layout.tsx`. The only feature mounted at the root
is `DownloadSheetHost`; other feature overlays are registered through the
overlay host from their own scope.

## Stable services

`appServices` is frozen in
`src/composition/providers/appServices.ts` and implements `AppServices` from
`src/shared/contracts/appServices.ts`:

- `downloadSessions` - `DownloadSessionPort` adapter for reader/translation.
- `notifications` - notification permission/init.
- `translationNotifications` and `translationNotificationCommands` - event and
  pause/resume/cancel ports.
- `extensionRegistry.refresh(force?)`.
- `library.syncAll()`.
- `downloadedMetadata.refresh()`.

These are identities, not snapshots. Do not add reader position, download
progress, a selected tab, a dialog boolean or another frequently changing value
to this provider. See [state-and-providers.md](state-and-providers.md).

## Startup sequence

`AppBootstrapGate` calls `initialize()` once on mount. `initialize()` is also
the retry action after a database error.

`startAppRuntime()`:

1. Opens SQLite, runs Drizzle migrations and seeds the system libraries.
2. Clears abandoned downloaded-page extraction sessions.
3. Clears abandoned OCR page sources.
4. Removes the legacy reader page cache.
5. Starts the download scheduler with the downloads-finished notifier.

Only after the runtime is ready does `startBackgroundServices(services)` run.
Its work is intentionally independent and best-effort:

- refresh the extension registry;
- sync all libraries;
- refresh downloaded metadata;
- initialize notifications, then start the pre-translate queue with
  `downloadSessions` and translation notification ports.

The extension/library/metadata calls are not allowed to block rendering. A
failure is logged and the app remains usable. A database failure is different:
the gate shows the error state with a Retry button and the routes do not mount.

`refreshDownloadedMetadataOnForeground(services)` is registered after the gate
reaches ready. It refreshes at most once per 30 minutes. The timer is a
module-level throttle in `bootstrapRuntime.ts`, so it survives route changes but
not a process restart.

## Why this order exists

- The database must exist before any repository or library sync runs.
- The download scheduler relies on the catalog and settings stores.
- The translation queue needs notification handlers and the download-session
  port already in place.
- Startup cleanup must not delete a live downloaded-page extraction. It only
  removes sessions abandoned by a previous process.
- Hiding the splash is tied to leaving the `loading` state, including the error
  state, so the user sees the retry UI rather than a stuck splash.

## Adding startup work

Ask these questions before adding a step:

1. Is it required before routes can render? If not, do not put it in
   `startAppRuntime()`.
2. Does it need a stable feature service? Pass it through `AppServices` rather
   than importing feature internals into composition.
3. Can it fail independently? Catch and log it; never turn a background failure
   into a permanently unavailable app.
4. Is it idempotent? Retry and remount must be safe.
5. Does it touch a native module? Provide a safe no-op or clear error path for
   Expo Go and an unlinked development build.

## Startup files

| File | Responsibility |
| --- | --- |
| `app/_layout.tsx` | Root provider tree and stack. |
| `src/composition/providers/AppBootstrapGate.tsx` | Loading/ready/error state, splash and app-state listener. |
| `src/composition/providers/bootstrapRuntime.ts` | Ordered startup/background operations and foreground throttle. |
| `src/composition/providers/appServices.ts` | Frozen service composition. |
| `src/shared/runtime/AppServicesProvider.tsx` | Context and typed hook. |
| `src/shared/runtime/OverlayHostProvider.tsx` | Root overlay registry. |

## Related reading

- [State and providers](state-and-providers.md)
- [Navigation](navigation.md)
- [Native and network](native-and-network.md)
- [ADR 0003](../adr/0003-context-and-store-policy.md)