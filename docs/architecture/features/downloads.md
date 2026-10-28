# Downloads

Downloads owns the catalog of saved chapters, the global queue, SAF archive
storage, metadata recovery and the offline page-session port used by the reader
and translation queue.

## Layout

```text
src/features/downloads/
  adapters/     MangoraDownloader native bridge and JS archive fallback
  catalog/      downloaded rows, identity, candidates and offline targets
  components/   buttons, progress panel, sheets and loading states
  hooks/        React bindings to the external download store
  metadata/     metadata.json catalog, refresh and recovery
  offline/      downloaded-only reader and page-session lifecycle
  queue/        scheduler, page resolution and serialisable job types
  sessions/     DownloadSessionPort adapter
  storage/      SAF folder/archive/page layout below the shared root
  screens/      download manager and downloaded-series views
  index.ts      public API
```

Internal files import concrete siblings; they do not import their own
`@features/downloads` facade.

## Storage contract

The picked SAF root belongs to `src/core/storage/root.ts` because database backups
share the same grant. The downloads feature owns only the subfolder policy:

```text
<root>/downloads/<provider>/<manga title>/<chapter> ~ <index> ~ <group>.cbz
```

`safeSegment()` in `src/core/storage/naming.ts` sanitizes every visible path
segment. It removes characters that Android or `java.net.URI` reject, including
brackets that appear in many manga titles. Do not construct a path in a component
or a second storage module.

A finished download is validated before it becomes a completed row:

- every expected page is present, non-empty and decodable;
- the CBZ opens and contains the expected numbered image entries;
- no unexpected archive paths are present;
- pages can be extracted and decoded from a temporary location;
- only then are metadata and the completed DB row written.

If metadata writing fails after a valid archive exists, keep the completed
download and report a warning; do not throw away a valid file.

## Queue

`scheduler.ts` is the single app-wide queue. It starts in `startAppRuntime()` and
uses settings for:

- chapters per source concurrency;
- pages per chapter concurrency;
- Wi-Fi-only policy.

Progress is mirrored into SQLite and the Android foreground notification. The
queue is an external store (`subscribeDownloads` / `getDownloadSnapshot`) because
ticks are frequent. Do not copy queue snapshots into `AppServicesProvider` or a
root context.

A completed chapter leaves the live queue immediately, but its `downloads` row
remains for the Downloads library and offline reader. Failed/paused/incomplete
jobs remain visible in queue surfaces.

The Android foreground `dataSync` service keeps the process alive while the app
is backgrounded. Notification actions pause/resume/cancel the queue. Every native
call should retain the JS fallback where one exists; extraction/streaming writes
that cannot work without the native module must fail with a clear message.

## Page resolution

`queue/chapterPages.ts` resolves extension pages once and fetches images through
the extension-aware path, so cookies, Cloudflare handling, AVIF transcoding and
headers apply exactly as they do to the reader. Never add a second image fetch
path.

Each page is written to the download cache, validated and then archived. The
page-session adapter exposes one local page URI per page. That URI is the shared
input to display, detection, OCR and translation.

## Metadata and recovery

`downloads/metadata/metadata.json` is a versioned, atomic index below the SAF
root. SQLite is the fast operational index; the JSON is recoverable metadata and
never replaces checking the archive itself.

Recovery compares metadata, SQLite rows and actual archives. Report missing or
corrupt chapters rather than silently marking them complete. `Delete downloads`
and `Recover downloads` are Settings/Download-manager actions with explicit user
confirmation; do not run destructive recovery during startup.

## Offline reading and translation

`DownloadSessionPort` (`sessions/index.ts`) opens a completed chapter and returns
page URIs plus a cleanup function. If cached page files are absent, the session
extracts the CBZ to a temp directory and owns cleanup. Startup clears only
abandoned sessions from a previous process.

`offlineReader.ts` builds the reader route snapshot for a download, preserving
the provider identity and display metadata. The reader can therefore open the
same chapter from history, the manga page or the downloaded view.

## UI surfaces

- Download buttons on manga/chapter views use the public downloads components.
- The download sheet host is mounted once at the root layout.
- The Downloads tab/manager groups downloaded series by source.
- Settings → Downloads owns policy; Settings → Queue shows failed/incomplete
  jobs, retry and cancellation.
- Storage usage and folder selection belong to Settings → Data and storage, not
  to a download row.

## Validation

```powershell
npx tsx --test src/features/downloads/catalog/offlineReader.test.ts
npm run check
npx eslint src/features/downloads
```

Device tests are mandatory for SAF folder selection, archive writing, service
notification actions, offline extraction/read, download cancellation and
recovery after a missing archive. Static checks cannot prove Android provider or
ZIP behavior.

## Related reading

- [Persistence and storage](../runtime/persistence-and-storage.md)
- [Reader](reader.md)
- [Translation and vision](translation-and-vision.md)
- [Native modules](../native/native-modules.md)