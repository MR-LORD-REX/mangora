# Shared ports and contracts

Ports are the seams that let features collaborate without importing each other.
A port describes a capability; the composition root or the owning feature supplies
an implementation. Keep ports small, typed and free of product UI.

## Contract inventory

| Contract | File | Consumers | Implementation |
| --- | --- | --- | --- |
| `AppServices` | `src/shared/contracts/appServices.ts` | Root provider, startup, composition | `src/composition/providers/appServices.ts` |
| `DownloadSessionPort` | `downloadSessionPort.ts` | Reader, translation queue | `features/downloads/sessions` |
| `DownloadNotificationPort` | `downloadNotificationPort.ts` | Downloads queue | Notification/core adapter |
| `TranslationNotificationPort` | `translationNotificationPort.ts` | Translation queue | `src/core/platform/notifications.ts` |
| `TranslationEngine` | `translationEngine.ts` | Settings, translation engines, reader | Settings value type |
| `ChapterSourceModule` and viewer rows | `chapterSource.ts` | Manga, downloads, reader handoff | Manga source adapters |
| `BubbleMask` | `bubbleMask.ts` | Vision, translation, reader overlay | Segmentation output |

`src/shared/contracts/index.ts` is the public type barrel. Import contracts from
there unless a file intentionally needs the narrower module.

## AppServices

`AppServices` is an identity-stable dependency bundle, not a state store:

```ts
interface AppServices {
  downloadSessions: DownloadSessionPort;
  notifications: AppNotificationService;
  translationNotifications: TranslationNotificationPort;
  translationNotificationCommands: TranslationNotificationCommandPort;
  extensionRegistry: AppExtensionRegistryService;
  library: AppLibraryService;
  downloadedMetadata: AppDownloadedMetadataService;
}
```

It is created once and frozen. If a proposed field changes frequently or belongs
to one screen, use a feature hook/external store instead. See
[state-and-providers](../runtime/state-and-providers.md).

## Chapter and provider identity

`ChapterMeta`, `ChapterSortField`, `ChapterSourceModule`, `ChapterViewerData`,
`LibraryMangaInput`, `OpenChapterContext`, `ProgressMap` and the other viewer
types define the manga/download/reader handoff. They deliberately avoid importing
a feature's internal model.

Canonical identity rules:

- provider key: `ext:<sourceId>`;
- canonical manga id: `canonicalId(provider, providerMangaId)`;
- canonical chapter id: `canonicalId(mangaId, providerChapterId)`;
- opaque extension ids are decoded/encoded only by the identity helpers;
- never derive an id from a title.

`src/core/catalog/readerIdentity.ts` is the route-to-provider decoder;
`src/core/catalog/identity.ts` builds canonical ids. DB rows and download rows
use these canonical values.

## Download session port

```ts
interface DownloadSessionPort {
  openChapter(chapterId: string): Promise<DownloadPageSession>;
  cleanupPages(pages: string[]): Promise<void>;
}
```

The returned pages are local file URIs. The reader and translation pipeline use
those exact pages for display, detection and OCR. A second fetch path would
bypass extension headers, cookies, decryption, AVIF transcoding and download
session cleanup. If the archive is cold, the adapter extracts it into a temporary
session and owns cleanup.

## Notification ports

Download and translation notifications are separate because they have different
lifecycle owners:

- the foreground download service owns live progress; `DownloadNotificationPort`
  provides the completion summary hook;
- `expo-notifications` owns permission, channels/categories and action routing
  for translation jobs.

The translation queue receives command handlers through composition; it must not
import the notification implementation.

## Translation engine port

`TranslationEngine` is a small settings-facing discriminator (`free`/`ai` in the
current UI). Provider request/response types stay in the translation feature; a
new cloud backend should implement the same engine-neutral page-batch contract
without leaking HTTP details into reader components.

## Adding a port

1. Put the interface and named types in `src/shared/contracts/`.
2. Keep it capability-focused, not a generic repository or state bag.
3. Add the implementation in the owning feature/core module.
4. Wire it in composition only if more than one feature consumes it.
5. Document the failure/no-native behavior.
6. Add the contract to the generated API inventory and this table.

Do not put a feature-specific implementation in `shared` merely to avoid adding a
provider. `shared` must remain product-agnostic.

## Related reading

- [Boundaries](../boundaries.md)
- [Data model](data-model.md)
- [Startup and composition](../runtime/startup-and-composition.md)
- [Native and network](../runtime/native-and-network.md)