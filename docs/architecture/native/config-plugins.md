# Native config plugins

Mangora commits an Android project but treats canonical native additions as
sources under `plugins/`. Config plugins copy them into the generated `android/`
tree so a clean prebuild reproduces the same runtime.

## Plugin inventory

| Plugin | Canonical source/effect |
| --- | --- |
| `withExtensionHost.js` | `plugins/android/extensionhost/`; Kotlin/Java compatibility shims, OkHttp/JSoup/QuickJS dependencies, manifest visibility, ProGuard. |
| `withDownloadService.js` | `plugins/android/downloader/`; `MangoraDownloader`, SAF/ZIP helpers, foreground `DownloadService`, permissions, ReactPackage registration. |
| `withAvifDecoder.js` | `plugins/android/avifdecoder/`; `MangoraAvif` transcoder and package registration. |
| `withSubsamplingScaleImageView.js` | `plugins/android/subsampling/`; tiled image view package and `subsampling-scale-image-view` dependency. |
| `withOnnxruntimePackage.js` | Registers `OnnxruntimePackage` in `MainApplication`. |
| `withAppLinks.js` | HTTPS/deep-link intent filters and generated host allow-list. |
| `withUpdater.js` | Install permission, `FileProvider`, update paths resource and updater wiring. |
| `withLtrLayout.js` | Keeps `android:supportsRtl="false"` so device locales cannot mirror page/overlay geometry; reading direction comes from the reader setting. |

`app.json` lists the plugins. A plugin that mutates `MainApplication.kt` requires
the generated file to still be Kotlin (the plugins throw if it is not). A plugin
that mutates `app/build.gradle` expects Groovy.

## Source-of-truth workflow

1. Edit the canonical Kotlin/JS plugin under `plugins/`.
2. Update `app.json` only if the plugin is new or configuration changes.
3. Run a clean prebuild/build so the generated copy is refreshed.
4. Verify both the canonical source and the generated copy are present.
5. Build and test on a development/release device.

Do not edit only `android/app/src/main/java/...` as the final change. The next
prebuild can erase it. Do not copy a generated file back over the canonical source
without reviewing the diff.

## Extension host

The host is a compatibility layer for the Tachiyomi/Keiyoushi extension ABI. It
provides `Source`, `HttpSource`, network interceptors, Injekt shims and package
inspection. The Android dependencies and packaging exclusions are part of the
contract; removing them makes installed extensions fail to load.

Opaque ids originate here and are parsed as strings at the JS boundary. Do not
reinterpret a 64-bit source id as a JS number.

## Downloader and foreground service

The downloader plugin registers the service with `foregroundServiceType=dataSync`
and the required permissions. The service is what lets the queue continue while
the app is backgrounded. JS checks `hasNativeDownloader()` and provides a JS ZIP
fallback for local archive building, but SAF streaming/extraction requires the
native module.

The plugin also handles updater/installer helpers on the same `MangoraDownloader`
module. The JS facade is `src/platform/native/updater.ts`; download-specific SAF
calls are in `src/features/downloads/adapters/nativeDownloader.ts`.

## AVIF and tiled image plugins

Both copy Kotlin files and register a ReactPackage. The AVIF module is invoked by
`src/core/images/avif.ts`; the tiled image manager is consumed by the reader's
`SubsamplingStripImage`. Keep the native package name and JS module name in sync
or the capability check will report the feature missing.

## Build implications

- New Architecture is enabled; test a view manager against Fabric/legacy interop.
- Do not use a `SurfaceView` under an RN overlay (surface z-order can hide it).
- The app is portrait-locked in the manifest at the app level; reader orientation
  is handled deliberately by the Chrome/Expo orientation path.
- The Android build is memory/disk heavy (Skia, ONNX, Hermes, NDK). In CI, clean
  and assemble are separate operations; see [build-and-release](../operations/build-and-release.md).
- Release builds use the release keystore secrets; a missing keystore falls back to
  debug signing and must be called out as a release warning.

## Adding a native module

1. Add the canonical Kotlin source under the appropriate `plugins/android/` tree.
2. Add/update a config plugin that copies it and wires Gradle/manifest/package
   registration.
3. Add a typed JS facade under `src/platform` or the owning feature adapter.
4. Add a capability check and a safe missing-module path.
5. Document the module and its data contract here and in
   [native-modules.md](native-modules.md).
6. Validate with a clean prebuild, a native build, and an on-device test.

## Related reading

- [Native modules](native-modules.md)
- [Native and network](../runtime/native-and-network.md)
- [Build and release](../operations/build-and-release.md)
- [Third-party notices](../../../THIRD-PARTY.md)
