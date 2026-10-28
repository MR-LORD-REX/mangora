# Extensions

Mangora has no built-in content providers. The extensions feature discovers
repositories, lists available/installed extensions, installs compatible APKs and
publishes the installed-source registry used by browse, library and reader.

## Responsibility split

| Layer | Owns |
| --- | --- |
| `@platform/extensions` | Typed native bridge and JSON parsing at the boundary. |
| `src/features/extensions/library/` | Repository fetch/cache, catalog parsing and missing-source detection. |
| `src/features/extensions/registry/` | In-memory installed extension/source snapshot. |
| `src/features/extensions/installer/` | APK download, package/signature verification and system install handoff. |
| `src/features/extensions/filters/` | Native filter schema, drafts, changed-only patches and summaries. |
| `src/features/extensions/screens/` | Browse and one-source catalogue composition. |

The platform facade parses every JSON response so opaque 64-bit source ids remain
strings. A numeric conversion at the boundary would corrupt provider identity.

## Repository and catalog flow

1. A user adds a repository URL in settings (`extensionRepos`).
2. `library/repo.ts` tries the candidate index URLs, parses the repository and
   caches it under app documents.
3. `library/catalogIndex.ts` normalizes/merges catalog entries; pure parsing is
   tested independently.
4. The browse screen shows available extensions, installed extensions and source
   discovery. A failed refresh can fall back to the last cached catalog and
   reports the provider error.
5. Installing an APK verifies package name, version code and signing certificate
   when the repository publishes one. Successful install refreshes the registry.

Do not bypass the native extension host or add a provider-specific HTTP client.
Cookie, Cloudflare, user-agent and browser-network behavior belongs behind the
host.

## Registry and identity

`registry/registry.ts` is the only in-memory source of installed sources. It
exposes:

- `refreshExtensionRegistry(force?)`;
- `getExtensionRegistrySnapshot()` and `subscribeExtensionRegistry()`;
- `extensionProviderFor(sourceId)` and `sourceIdFromProvider(provider)`;
- cached installed/source lookups.

Provider keys are `ext:<sourceId>`. Legacy provider strings remain readable in
old rows but are inert; do not add a built-in adapter for them. Missing sources
are surfaced through migration/recovery UI rather than silently reconstructed
from a title.

## Browse and filters

`BrowseExtensionsScreen` owns source tabs, installed/available lists, search and
migration. `ExtensionSourceScreen` renders one source's catalogue and keeps
its applied filter draft while the route is mounted.

The native filter tree is hierarchical. Keep the original path and option
order/index; do not substitute display/search indices. A filter applied from the
UI must send only values different from the native defaults. A schema signature
includes names, paths, types, option order and defaults; if it changes, discard
stale drafts rather than applying old indices.

The filter sheet supports wrapping choices, searchable pickers, tri-state
include/exclude and pinned selection summaries. Draft changes require Apply;
closing the sheet discards them. Do not create filter presets or remote
facet-count APIs without a native contract.

## Installation safety

Installation goes through `@platform/native/updater`/the extension installer:

- download to a temporary APK;
- verify package name and version against the catalog entry;
- verify signing certificate when present;
- ask the user for install permission if needed;
- hand the APK to Android's package installer.

Never install an APK solely because a repository listed it. The verification
step is the trust boundary. A failed check must block install with a clear error.

## Adding a provider-facing feature

Before adding an extension API call:

1. Add the typed method and result to `src/platform/extensions/types.ts` and the
   native facade.
2. Parse/validate JSON at the platform edge.
3. Add a feature adapter, not a screen-specific call.
4. Keep opaque ids as strings and record them exactly as returned.
5. Add a pure test for parsing/filter behavior and a device test for native
   execution.

The canonical native sources are under `plugins/android/extensionhost/` and are
copied by `plugins/withExtensionHost.js`. Do not edit only the generated
`android/` copy.

## Validation

```powershell
npx tsx --test src/features/extensions/domain/browseFilters.test.ts
npx tsx --test src/features/extensions/library/repo.test.ts
npx tsx --test src/features/extensions/filters/filters.test.ts
npm run check
npx eslint src/features/extensions src/platform/extensions
```

Device checks: add a repository, install/uninstall an extension, refresh the
registry, open a source, apply/reset filters, then open a manga and reader.
Test a missing source and a repository refresh failure as well.

## Related reading

- [Manga and library](library-and-manga.md)
- [Native modules](../native/native-modules.md)
- [Data model](../contracts/data-model.md)
- [Validation and QA](../operations/validation-and-qa.md)