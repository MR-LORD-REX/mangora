# Native and network

Mangora's native surface exists for capabilities that React Native cannot provide
safely or efficiently: the extension host, SAF/ZIP operations, a foreground
download service, AVIF transcoding, a tiled image view, ONNX Runtime and the
updater/installer bridge.

## Network flow

```text
extension module (native)
  -> platform/extensions JSON facade
  -> core/catalog adapter
  -> manga/library/download/reader
```

Extension requests are made by the extension host, so its OkHttp client inherits
cookies, Cloudflare handling, user-agent and source interceptors. Page-image URLs
are registered with `@shared/net/imageHeaders` so remote cover/page images get the
same headers at the React Native image layer.

Do not add a direct `fetch()` in a screen for an extension image. A second path
would bypass headers, cookies, decryption and AVIF handling. Local reader pages
are file URIs and do not need network headers.

Other network boundaries:

- repository/catalog fetch: extensions feature;
- GitHub release metadata/APK: updates feature;
- Google/Gemini translation: translation engines;
- model downloads: vision model store;
- extension pages: native host via the platform facade.

Failures should be isolated to the feature that made the request. A failed
background refresh must not stop the app from rendering cached data.

## Native bridge rules

- A JS bridge returns typed plain data; parse JSON at the platform edge.
- Opaque ids remain strings.
- Every optional native module has a clear `hasNativeX()` capability check and a
  safe no-op/error path for Expo Go or an unlinked dev build.
- Long-running native work reports progress through a small number of events or a
  snapshot; do not stream per-frame data into JS during pinch/fling.
- Never import a generated `android/` source path from JavaScript.

## Image decoding and AVIF

Android's normal image pipeline cannot decode every AVIF page. `src/core/images/avif.ts`
calls the native `MangoraAvif` transcoder once per local source and caches a PNG
under `trapp-avif`. `decode.ts` validates that a file is non-empty and actually
decodable. Downloads and reader processing use the same check.

If the native AVIF module is missing, the app fails with a clear message instead
of showing a blank page. Do not silently skip image validation in a download.

## Tiled reader image

The long-strip reader uses the native `SubsamplingScaleImageView` surface for
large cached pages. The current design deliberately disables native pan/zoom;
`ZoomablePage` owns gestures and the translation overlay is a sibling. Re-enabling
native gestures without moving the overlay into the same transform will cause
drift.

The canonical Kotlin is `plugins/android/subsampling/`; the config plugin copies
it into the generated Android tree. The JS surface is
`features/reader/components/page/SubsamplingStripImage.tsx`.

## Foreground download service

`MangoraDownloader` provides SAF/zip helpers and starts a data-sync foreground
service. The service keeps the JS queue alive while backgrounded and exposes
Pause/Resume/Cancel actions. `src/features/downloads/adapters/nativeDownloader.ts`
is the feature-owned bridge; `plugins/android/downloader/` is canonical.

The notification implementation and the download queue intentionally use ports
so the queue does not import `expo-notifications` or the extension host.

## Extension host

`MangoraExtensions` hosts Mihon/Keiyoushi-compatible extension code. Its shims
under `plugins/android/extensionhost/eu/kanade/tachiyomi/` provide the API surface
and network behavior expected by extensions. Canonical sources live there; the
generated Android copy must stay in sync via `plugins/withExtensionHost.js`.

Do not copy Mihon branding/assets. Porting behavior is allowed under the
repository's license/attribution rules; preserve notices. Never modify the
reference checkout under `_ref/mihon`.

## Network policy and privacy

- Extension browsing/content requests go to extension-selected endpoints.
- OCR inference stays on device; translation sends recognized text only when the
  user selects a translation engine.
- Gemini key validation/translation sends the key to Google; never log it.
- Model downloads and updater requests use HTTPS endpoints configured in the
  feature.
- Extension image headers may include cookies/source secrets; keep them in the
  header registry and do not print request headers in diagnostics.

## Related reading

- [Native config plugins](../native/config-plugins.md)
- [Native modules](../native/native-modules.md)
- [Downloads feature](../features/downloads.md)
- [Persistence and storage](persistence-and-storage.md)