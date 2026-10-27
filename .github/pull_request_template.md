## Scope

- Owning feature:
- Phase item:
- PRs this depends on:

## What changed

## Import and ownership check

- [ ] The change stays inside the owning feature except for its public
  `index.ts` contract.
- [ ] No cross-feature deep import, generated `android/` import or new cycle.
- [ ] New files have one responsibility and no dead compatibility shim.
- [ ] `npm run check` passes.

## Reader or native impact

- [ ] Not a reader/native change.
- [ ] Reader change: attach the completed
  [reader device smoke test](../docs/qa/reader-device-smoke.md).
- [ ] Native change: canonical source under `plugins/` updated first, generated
  copy reconciled, and New Architecture behavior checked.

## Evidence

- Static checks:
- Device/build:
- Screenshots or logcat:
