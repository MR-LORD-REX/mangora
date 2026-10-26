# Runtime Context and Store Policy

React context is used for dependency scope, not as a global state bucket.
Mangora has several high-frequency data sources: reader scroll position, zoom,
download progress, extension catalogue snapshots and the translation queue.
Putting these in one root context would re-render the whole app on every page
frame or progress tick.

## Provider tree

```text
GestureHandlerRootView
  AppServicesProvider          stable ports, controllers and adapters
    AppBootstrapGate           database loading/ready/error
      OverlayHostProvider      modal, sheet and toast ownership
        Stack
        DownloadSheetHost      feature host mounted once
```

`AppServicesProvider` exposes identity-stable services:

- downloaded-page session port
- notification initialization and translation notification ports
- extension registry refresh
- library synchronization
- downloaded metadata refresh

Feature-specific controllers and hot snapshots stay behind their public
feature entry points or external-store hooks.

The provider value is memoized. It must not contain changing progress values,
current reader pages or transient UI booleans.

## Feature-scoped providers

| Provider | Scope | Why it is not global |
| --- | --- | --- |
| `ReaderSessionProvider` | Reader screen | Active page, chrome visibility/settings and loading are reader-local and change rapidly |
| `TranslationQueueProvider` | Translation queue surfaces | Queue snapshots update frequently and are irrelevant elsewhere |
| `DownloadsProvider` | Screens needing queue actions | Keeps controller scope small; progress is read through an external store |
| `ExtensionRegistryProvider` | Browse/install surfaces | Avoids rebuilding catalogue consumers at the root |

Feature providers may depend on ports from `AppServicesProvider`. They must not
be imported by `src/shared`, `src/core` or `src/platform`.

## Hot state: external stores

Use `useSyncExternalStore` for state that changes often or must notify outside
React:

```ts
const downloads = useSyncExternalStore(
  subscribeDownloads,
  getDownloadSnapshot,
);
const settings = useSyncExternalStore(
  subscribeSettings,
  getSettingsSnapshot,
);
```

The subscription must return a stable snapshot object until the underlying data
actually changes. Do not create a new object in `getSnapshot`; it can cause an
infinite render loop.

The downloads queue already exposes this shape through `subscribeDownloads` and
`getDownloadSnapshot`. Its React binding is `useDownloadJob` /
`useDownloadStatuses` in `features/downloads/hooks`; add a `useSyncExternalStore`
adapter when a surface needs the whole snapshot without duplicating queue state.

Existing subscription APIs remain the transport during migration. A feature
store adapter should wrap them rather than duplicate their state:

- `subscribeSettings`
- `subscribeDownloads`
- extension registry subscriptions
- translation queue events
- reader layout and chrome subscriptions

When a feature needs a settings value, read it through the core settings store
or a typed hook. Do not add reader or download state to `AppServicesProvider`.

## Context rules

1. Provider values are memoized and contain stable service identities.
2. Context is not a replacement for a reducer or external store.
3. A provider lives at the narrowest scope that can own its state.
4. Consumers use a typed hook, never `useContext` directly.
5. Missing-provider errors are explicit; do not silently create fallback state.
6. Context must not carry functions recreated every render without a documented
   reason.

## Shared UI boundary

`src/shared/ui` contains only product-agnostic components. `Button`, `Modal`,
`TextField`, `EmptyState` and `AppHeader` may live there. `ChapterRow`,
`DownloadButton`, `MangaCard` and reader overlays belong to their feature even if
another screen currently reuses them.

When a component starts needing manga, chapter, reader or download types, move
it into the owning feature or create a generic contract in `src/shared/ui`.
