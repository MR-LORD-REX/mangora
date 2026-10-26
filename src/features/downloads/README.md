# Downloads

Owner: download catalog, queue, archive storage, recovery and offline reader
sessions.

## Public API

Import from `@features/downloads` only. The entry point exposes the download
catalog, identity helpers, queue controls, storage-folder policy, recovery,
offline reading, page sessions and download UI components.

Files inside this feature import concrete sibling modules. Do not import
`@features/downloads` from inside `downloads`; that hides cycles and makes the
facade part of every dependency chain.

## Layout

```text
downloads/
  adapters/     native ZIP/foreground-service bridge and JS fallback
  catalog/      stored download rows, canonical identity, candidate mapping
  components/   buttons, queue panel, sheets and user-facing request flows
  hooks/        React bindings for live queue state
  metadata/     metadata.json catalog, refresh and recovery
  offline/      downloaded-only viewer and page-session lifecycle
  queue/        scheduler, page resolution and serialisable queue types
  sessions/     DownloadSessionPort adapter for reader and translation
  storage/      archive/page/cache layout below the picked root
  index.ts      public contract
```

## Storage boundary

The user-picked SAF root belongs to `@core/storage/root` because database
backups share the same grant. This feature owns only the `downloads/`
subfolder, archive naming and page cache. Never import this feature from core
storage, settings backup or reader cleanup.

One local page-cache URI supplies display, OCR and translation. Do not add a
second image-fetch path; provider headers, decryption and AVIF transcoding live
behind the existing page loader.

## Runtime state

The queue is an external store (`subscribeDownloads` + `getDownloadSnapshot`)
because progress changes frequently. Stable dependencies such as the session
adapter are passed by composition. Do not wrap every job tick in React context.

## Validation

```powershell
npx tsc --noEmit --pretty false
npm run check:arch
npx eslint src/features/downloads
```

On-device checks are required for folder picking, archive extraction, offline
reading and foreground-service behaviour. Static checks do not prove SAF grant
or native ZIP behaviour.