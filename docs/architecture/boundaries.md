# Boundaries and import rules

Mangora uses a feature-sliced architecture. The goal is not a perfect diagram;
it is to make ownership obvious and to keep a local change from accidentally
coupling unrelated screens, persistence and native bridges.

## Zone contract

```text
app
  -> composition, feature public entry points, shared, core, platform

composition
  -> feature public entry points, shared, core, platform

feature
  -> own implementation, shared, core, platform
  -> another feature only through @features/<name>

core
  -> shared, platform, other core modules

platform
  -> shared, other platform modules

shared
  -> third-party packages, other shared modules
```

`app/` is route composition, not a business-logic layer. A route may parse
params, inject navigation callbacks and render a feature screen. It must not
load catalog data or contain reader/download/translation rules.

`composition` is the one place that may wire several features together. It
creates stable service objects and startup policy. It must not become a global
state store or a second feature layer.

A feature owns its implementation. Internal files import concrete siblings.
Cross-feature callers use only `@features/<name>`, which resolves to the
feature's `index.ts`. A feature never imports `@composition/*`.

## What the checker enforces

`npm run check:arch` runs `scripts/check-architecture.mjs` over `src/` and
`app/`. It uses the TypeScript compiler API, so multi-line imports, type-only
imports, re-exports and dynamic imports are included.

The checker rejects:

- import cycles;
- app/composition imports of a feature deep file instead of its `index.ts`;
- cross-feature deep imports;
- `shared` to `core` and `shared` to `features` edges;
- `core` to `features` edges;
- `platform` to `core` or `features` edges;
- features importing composition;
- imports of removed compatibility paths;
- imports of generated `android/` files or paths.

It warns about unresolved local imports and legacy-zone edges. Treat a new
warning as a design problem, not as noise.

The checker is intentionally stricter than a runtime bundler. If a new
cross-feature dependency looks harmless, first ask whether the shared behaviour
belongs in `src/shared/contracts`, `src/core` or the owning feature. Do not
weaken the checker to make a shortcut pass.

## Feature anatomy

Use only the folders that contain code. Empty scaffolding is not architecture.

```text
src/features/<feature>/
  screens/       route-level composition
  components/    feature-owned presentation, grouped by task
  hooks/         React lifecycle and external-store bindings
  state/         feature-scoped providers, reducers and store adapters
  domain/        pure types, rules, geometry and validation
  data/          feature-specific loading and persistence
  adapters/      implementations of shared ports
  index.ts       the only public contract
  README.md      local ownership and validation notes
```

Domain code should be pure and testable without React or native modules. A hook
may coordinate a domain function and a port, but business rules do not belong in
a component. Screens compose; blocks/renderers can keep a large JSX surface out
of a screen when they have one clear job.

## Adding or moving a feature

1. Define the public types and contracts before moving UI.
2. Create `index.ts` with the smallest consumer-facing surface.
3. Move leaf domain/data modules first, then hooks, then components/screens.
4. Update one caller at a time and keep the old import temporarily only if it is
   a real compatibility shim with a named removal condition.
5. Remove the shim and the old tree once the final caller moves.
6. Add focused tests for pure rules and a README note for device-only checks.
7. Run `npm run check` and `npm run docs:graph`.

Do not add a new top-level zone for a single feature. The zone map is intentionally
small. New product behaviour normally belongs inside an existing feature; new
cross-feature primitives belong in `shared` or `core` only when they are genuinely
product-agnostic.

## Shared versus feature-owned

| Put it in | When |
| --- | --- |
| `src/shared/ui` | Generic button, dialog, skeleton, header or motion primitive with no manga/download/reader knowledge |
| `src/shared/contracts` | A port or cross-feature type shared by implementations |
| `src/shared/geometry` | Coordinate and box math reusable by more than one feature |
| `src/core` | Persistence, settings, catalog identity/sync, storage, image decode or device policy |
| `src/platform` | A typed native bridge with no product policy |
| `src/features/<name>` | Anything that needs the feature's domain types or product decisions |

If a component begins to require manga, chapter, reader page or download types,
it belongs to that feature even if two screens currently reuse it. If a type is
needed by two features, create a minimal shared contract rather than importing
one feature's internals.

## Compatibility shims

A shim is temporary. It must state which caller it serves and what removes it.
Shims are not an alternate public API and must not become the default import for
new code. The old `components/reader`, `utils/reader`, `services/*` and
`components/*` trees have already been removed; do not reintroduce them.

## Related reading

- [ADR 0001](adr/0001-feature-sliced-boundaries.md) - why the slices exist.
- [System map](system-map.md) - concrete feature entry points.
- [Contracts](contracts/shared-ports.md) - ports that avoid feature-to-feature
  dependencies.
- [Operations/validation](operations/validation-and-qa.md) - static and device
  validation.