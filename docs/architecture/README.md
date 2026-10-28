# Architecture

This directory is the developer guide for the Mangora Android app. It explains
the current system, its ownership boundaries and the contracts that must remain
stable when features change. It is not a release log or a file-by-file catalogue.

## Reading paths

| If you need to... | Start with |
| --- | --- |
| Understand the app in ten minutes | [Overview](overview.md) |
| Find the owner of a capability | [System map](system-map.md) |
| Know where code belongs and what may import what | [Boundaries](boundaries.md) |
| Trace startup, providers, routes or storage | [Runtime](runtime/startup-and-composition.md) |
| Change a product capability | [Features](features/reader.md) |
| Add or consume a cross-feature port | [Contracts](contracts/shared-ports.md) |
| Work on Kotlin or an Expo config plugin | [Native](native/config-plugins.md) |
| Build, release, test or publish docs | [Operations](operations/build-and-release.md) |
| Understand a long-lived decision | [Architecture decision records](adr/README.md) |
| Explore imports and public exports | [Dependency graph](graph/README.md) |

## System in one view

```text
Expo Router routes
  -> feature screens and feature-owned state
    -> shared ports / core services
      -> platform bridge
        -> native Android capability or network endpoint
```

`src/features/*` is the product surface. `src/shared/*` contains generic
primitives and contracts. `src/core/*` owns persistence, settings, image and
network policy. `src/platform/*` owns typed native bridges. `src/composition/*`
is the only place that wires features together. `app/*` contains route adapters
only.

The generated dependency graph and API surface are committed under
[`generated/`](generated/); regenerate them with `npm run docs:graph` and verify
them with `npm run docs:check`, and validate navigation with
`npm run docs:links`. The graph is the machine-readable inventory; the prose
pages explain intent and invariants.

## What belongs here

Add a page when a contributor would otherwise have to reverse-engineer a
cross-cutting contract from source. Keep feature-local details in the feature's
own `README.md` and device procedures in
[validation and QA](operations/validation-and-qa.md). Do not duplicate release
notes or turn this tree into a second changelog.

Before opening a documentation pull request, run the checks in the
[documentation operations guide](operations/documentation-and-graph.md) and
follow the [documentation home](../README.md) for the wider docs layout.
