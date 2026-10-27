# Architecture decision records

ADRs record decisions that affect more than one feature or are expensive to
reverse. Keep each record short and update the status when the decision is
superseded. Do not use an ADR for an implementation detail local to one file.

## Index

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-feature-sliced-boundaries.md) | Accepted | Feature-sliced zones and one-way imports |
| [0002](0002-reader-two-view-contract.md) | Accepted | Paged and strip reader views with one strip camera |
| [0003](0003-context-and-store-policy.md) | Accepted | Context for stable scope; external stores for hot state |

## Format

Each record contains context, decision, consequences and validation. A
superseding ADR links back to the old record; old records stay in the tree for
history.
