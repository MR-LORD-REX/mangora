# Native modules

This page is the JS-facing contract for the Android modules. The canonical Kotlin
sources are under `plugins/`; the generated copies under `android/` are build
outputs.

## `MangoraExtensions`

**Role:** load installed Mihon/Keiyoushi extension modules, list sources and execute
source operations.

**JS facade:** `src/platform/extensions/` (`index.ts`, `types.ts`).

**Data boundary:** all JSON is parsed at this edge. Source, manga, chapter and page
ids remain strings. Returning a numeric id here would lose precision and break
identity matching.

**Main operations:** installed extension/source lists, repository/source catalog
calls, manga details/chapters, page lists, filters, image fetching and installation
inspection.

**Failure behavior:** the facade reports unavailable native capability; callers
show a clear install/build message. Do not fall back to a fake provider.

## `MangoraDownloader`

**Role:** Android-specific storage, archive, notification/service and update
operations.

**Feature facade:** `src/features/downloads/adapters/nativeDownloader.ts` for
queue/storage work; `src/platform/native/updater.ts` for installer/version work.

**Main operations:**

- network transport (`isWifiConnected`);
- SAF directory creation/listing and streaming writes;
- SAF document read/delete/rename;
- native ZIP page creation and extraction;
- foreground service start/update/stop with pause/resume/cancel actions;
- APK install permission/settings/install and SHA-256.

**Failure behavior:**

- `hasNativeDownloader()` gates the module.
- JS archive fallback exists for local zip creation.
- SAF extraction/streaming throws a clear "needs native download module" error.
- Updater calls no-op/false when the module is absent.

Do not use this module for extension page requests; the extension host owns those
headers and cookies.

## `MangoraAvif`

**Role:** transcode a local AVIF file to PNG because Android/React Native image
decoders cannot open it reliably.

**JS facade:** `src/core/images/avif.ts`; validation is in
`src/core/images/decode.ts`.

**Contract:** `transcodeToPng(sourcePath, destPath): Promise<string>`.

**Failure behavior:** if unavailable, the caller throws a development-build error
rather than displaying a blank image. Results are cached under `trapp-avif` and
keyed by source URI.

## `SubsamplingScaleImageViewPackage`

**Role:** register a React native view backed by
`SubsamplingScaleImageView` for tiled decoding of large strip pages.

**JS surface:** `src/features/reader/components/page/SubsamplingStripImage.tsx`.

**Contract:** the view receives a local image URI/dimensions and renders a tiled
bitmap surface. Native pan/zoom is disabled in the current design; the reader's
`ZoomablePage`/strip camera owns gestures.

**Failure behavior:** fall back to a normal React Native image when the view is
unavailable. Do not mount a native gesture owner above the translation overlay.

## `OnnxruntimePackage`

**Role:** register ONNX Runtime for local detection, segmentation and OCR model
inference.

**JS surface:** `@features/vision` runtime/engines and model store.

**Failure behavior:** `isYoloRuntimeAvailable()`/model checks surface a clear
capability state. The app should remain usable without OCR/translation.

## Notification integration

`expo-notifications` owns permission, Android channels/categories and the
"downloads finished" summary. The download foreground service owns live progress
notification actions. Translation notification actions are routed through the
translation command port; the queue must not import notification code directly.

## Native module checklist

When adding/changing a module:

- keep the canonical source under `plugins/` and updated config plugin wiring;
- add a typed facade and capability check;
- preserve string ids and JSON edge parsing;
- define missing-module and permission-denied behavior;
- add a device test for the native path;
- update this page, `native/config-plugins.md` and `THIRD-PARTY.md` when relevant.

## Related reading

- [Config plugins](config-plugins.md)
- [Native and network](../runtime/native-and-network.md)
- [Downloads](../features/downloads.md)
- [Translation and vision](../features/translation-and-vision.md)