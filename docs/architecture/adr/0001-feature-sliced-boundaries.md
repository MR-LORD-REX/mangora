# ADR 0001: Feature-sliced boundaries

- Status: Accepted
- Date: 2026-10-26

## Context

The original app concentrated screens, service calls and shared UI in broad
folders. A screen could import another feature's implementation, generated
native files, or a compatibility wrapper, which made ownership and review
unclear.

## Decision

Organize product code by feature under `src/features/<name>/`. Each feature
owns its domain, data adapters, hooks, components and screens behind an
`index.ts` public contract. `app/` contains route composition only.

Imports follow one direction: feature -> shared/core/platform, and app ->
composition/features. Cross-feature imports use only the public feature entry
point. `shared` and `core` never import a feature. No JavaScript imports a
generated file under `android/`.

## Consequences

- A feature owner can review and change implementation without coordinating
  every screen that uses it.
- Compatibility shims are temporary and must name their removal condition.
- The architecture checker, not reviewer memory, enforces the boundary.

## Validation

`npm run check:arch` must report no cycle, forbidden zone edge, cross-feature
deep import or generated-native import.
