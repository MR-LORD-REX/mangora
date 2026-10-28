# QA index

The canonical validation runbook is
[Validation and QA](../architecture/operations/validation-and-qa.md). It contains
the static, native-build, reader, download, extension and release checklists.

Device-specific procedures belong in that architecture page so there is one
release gate, not a second copy that silently drifts. Add supporting fixtures,
captures or issue-specific repro notes here only when they add evidence that the
canonical checklist does not carry.

For documentation changes, also run:

```powershell
npm run docs:graph
npm run docs:check
npm run docs:links
npm run check
```
