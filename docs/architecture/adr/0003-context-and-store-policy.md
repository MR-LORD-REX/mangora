# ADR 0003: Context for scope, stores for hot state

- Status: Accepted
- Date: 2026-10-26

## Context

A React context provider is useful for dependency scope, but placing changing
reader position, zoom, download progress or translation queue snapshots at the
root would re-render unrelated screens on every update.

## Decision

Use context for stable service identities and narrow feature scope:

- `AppServicesProvider` for identity-stable ports and controllers.
- `ReaderSessionProvider` inside the reader route for active page, chrome and
  loading state.
- Feature-scoped providers for queue/dialog hosts where appropriate.

Use external-store hooks (`useSyncExternalStore`) for high-frequency state that
must notify UI or non-React code. Providers never become a global state bucket.

## Consequences

- Reader state stays local to the reader and is released when the route exits.
- Consumers use typed hooks, not `useContext` directly.
- Provider values are memoized and contain stable references.

## Validation

Review provider scope and snapshot stability when adding state. Confirm no
feature imports a provider into `shared`, `core` or `platform`.
