# State and providers

React context has two jobs in Mangora: dependency scope and narrow feature
state. It is not the global application database. High-frequency values use
external stores so a download tick or reader scroll does not re-render unrelated
screens.

## The two kinds of state

| Kind | Examples | Owner |
| --- | --- | --- |
| Stable dependency/service | download session adapter, notification ports, registry refresh | `AppServicesProvider` |
| Feature-local state | reader current page/chrome/loading, a dialog draft | feature provider or hook |
| Hot shared snapshot | settings, download queue, translation queue, extension registry | external store + typed hook |
| Persistence | SQLite rows, settings JSON, SAF files | `src/core` or the owning feature |

A provider value should be memoized and contain identities that do not change
on every render. If a value changes on a timer or gesture frame, it does not
belong in the root context.

## Root provider

`src/shared/runtime/AppServicesProvider.tsx` exposes the frozen `AppServices`
object. `useAppServices()` fails loudly when used outside the provider; there is
no silent fallback.

`src/composition/providers/appServices.ts` is the composition root. It wires
download sessions, notifications, the extension registry, library sync and
downloaded-metadata refresh. Add a service only when multiple features need the
same identity-stable dependency. Otherwise keep it in the feature.

## Feature-scoped providers

| Provider | Scope | Why not global |
| --- | --- | --- |
| `ReaderSessionProvider` | `app/reader/[id].tsx` | Current page, chrome visibility and loading are reader-local and update frequently. |
| Translation queue surfaces | `@features/translation` / settings screens | Queue snapshots change often and are irrelevant elsewhere. |
| Download UI state | Downloads screens/host | Actions and controller scope stay near the queue consumers. |
| Extension registry consumers | Browse/install surfaces | Avoids rebuilding unrelated root consumers when the registry refreshes. |

A feature provider may consume a port from `AppServices`. It must not be
imported into `src/shared`, `src/core` or `src/platform`.

## External-store pattern

Use `useSyncExternalStore` for hot state or state that non-React code must
notify. The subscription and snapshot APIs are the transport; a feature hook is
the React adapter.

```ts
const settings = useSyncExternalStore(
  subscribeSettings,
  getSettingsSnapshot,
);
```

Rules:

1. `getSnapshot` returns the same object until the underlying data changes.
   Never allocate a new object on every call.
2. The subscribe function returns an unsubscribe closure.
3. A feature adapter wraps an existing store; it does not duplicate the state.
4. Keep store mutations in the owning module and expose narrow actions.
5. Test identity stability when adding a new snapshot.

Existing stores include the settings store, download queue, translation
pre-translate queue, extension registry and reader layout/chrome subscriptions.
The settings hook is `@features/settings/useAppSettings`; the download hooks live
under `features/downloads/hooks`; the translation queue exposes
`subscribePretranslate` and `getPretranslateSnapshot`.

## Reader-local state

`ReaderSessionProvider` owns:

- `currentPageIndex`;
- the active `ReaderChromeSettings`;
- header visibility;
- loading state.

It is a reducer-backed provider because actions are explicit and the state is
local to one reader route. Scroll offsets, page dimensions, display rows and
gesture refs stay in `useReaderViewportState` and related hooks so they can be
kept in refs/shared values rather than triggering a whole-screen rerender.

## Context rules

1. Provider values are memoized and contain stable references.
2. Context does not replace a reducer or a store.
3. Put a provider at the narrowest scope that can own the state.
4. Consumers use a typed hook, never `useContext` directly.
5. Missing-provider errors are explicit.
6. Do not store transient UI booleans or per-frame values in the root provider.
7. A provider must not import a lower-level feature; use a shared port instead.

## Shared UI boundary

`src/shared/ui` contains product-agnostic primitives: feedback, layout,
interaction, navigation, overlays and motion. A component that needs manga,
chapter, reader page or download types belongs to that feature, even if another
screen reuses it.

When two features need the same type, add a minimal contract under
`src/shared/contracts`; do not import one feature's internals or move product
policy into `shared`.

## Related reading

- [ADR 0003](../adr/0003-context-and-store-policy.md)
- [Startup and composition](startup-and-composition.md)
- [Shared ports](../contracts/shared-ports.md)
- [Reader feature](../features/reader.md)