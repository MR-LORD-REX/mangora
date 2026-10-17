<p align="center">
  <img src="assets/icons/logoWname.png" alt="Mangora" width="340" />
</p>

<h3 align="center">One library. Your sources. Any language.</h3>

<p align="center">
  <img alt="Expo SDK 54" src="https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white">
  <img alt="React Native 0.81" src="https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=white">
  <img alt="Platform Android" src="https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white">
  <img alt="License Apache 2.0" src="https://img.shields.io/badge/License-Apache%202.0-blue">
</p>

---

Mangora is an Android manga reader. It hosts user-installed **Mihon/Keiyoushi extensions**, opens every source through one shared manga page and one shared reader, and can detect, OCR and translate the text on any page.

Mangora ships no provider catalogue and no hard-coded repository. The user supplies a repository `index.json` URL; Browse lists that repository's extensions, installs the selected APK through Android, and loads the installed sources through the native extension host.

---

## Why Mangora

- **One source contract.** Every installed extension uses `ChapterMangaViewer`, the same manga page, chapter list, filters and reader.
- **A real reader, not a web view.** Four reading modes, tap zones, rotation lock, tiled decoding for long strips, and offline page files.
- **Download once, read forever.** Chapters are stored as `.cbz` archives in a folder the user picks, with a queue, retries and a foreground service.
- **Translate in place.** YOLO finds text regions, OCR reads them, and translations are painted back over the page.
- **On-device by default.** Local OCR through ExecuTorch, local SQLite library, optional cloud OCR/translation.
- **Reader/translator positioning.** No bundled catalogue, no default source list, no provider APIs compiled into the app.

---

## Extension Flow

1. Open **Browse**.
2. Paste a Mihon-compatible repository link.
3. Browse or search the repository catalogue; filter by language and content rating.
4. Download an extension APK and approve Android's unknown-source install.
5. Accept the terms once, then install.
6. Open the installed source, pick a manga, read a chapter in the shared reader.

Browse has three views:

- **Sources** - installed and active extensions.
- **Extensions** - every extension in the configured repository, with install/update actions.
- **Migrate** - library/history/download records whose extension is no longer installed.

Search and filter apply to the active view.

---

## Features

### Library
- Unlimited named libraries plus system **Default** and **Downloads** libraries.
- Grid and compact-list views, sorting by date added, unread count or source.
- Unread badges, in-progress markers, and source filters built from installed extensions.
- Add-to-library staging with multi-library membership.

### Reader
- **Four reading modes:** vertical scroll, horizontal scroll, vertical paged, horizontal paged.
- Fit and Original page sizing, tiled decoding for very long strips.
- Tap zones, page slider, rotation lock, keep-screen-awake and auto-scroll.
- Previous/next chapter navigation where the extension provides it.
- Progress and history restored to the exact page.

### Downloads and offline
- Chapters written as `.cbz` archives into a user-selected folder.
- One global queue with per-source and per-page concurrency, pause/resume/cancel and retries.
- Wi-Fi-only mode, foreground download service, and a live notification.
- Downloaded manga stay readable offline with search, sort and group filters.

### OCR and translation
- **YOLO** region detection for speech bubbles and page text.
- **OCR** on-device through ExecuTorch or through a cloud endpoint.
- Translation modes: off, per-bubble, and page-batched AI translation with story context.
- Translation overlays drawn over the original art, with cached results.

### Data and storage
- Library, chapters, progress, history, downloads and translation cache in SQLite via Drizzle.
- Backup and restore to a single `.db` file.
- Storage breakdown for downloads and free space.

---

## Install

Mangora ships as an Android APK for **ARM64 (`arm64-v8a`)** devices running **Android 7.0 or newer**.

- **GitHub Releases** - [releases page](https://github.com/MR-LORD-REX/mangora/releases)
- **Telegram** - [Mangora channel](https://t.me/MangoraApp)

32-bit ARM devices (`armeabi-v7a`) are not supported because the native OCR and model runtimes have no 32-bit build.

---

## Community and links

| | |
| --- | --- |
| What's new | https://mangora-web.web.app/whats-new |
| Privacy policy | https://mangora-web.web.app/privacy |
| Telegram | https://t.me/MangoraApp |
| Reddit | https://www.reddit.com/r/mangora |
| GitHub | https://github.com/MR-LORD-REX/mangora |
| Discord | https://discord.gg/ZWfMtkRTFR |

These match the `LINKS` table in the app (`components/settings/AboutSection.tsx`) and the onboarding overlay.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Expo SDK 54, React Native 0.81, React 19 |
| Navigation | Expo Router 6 (file-based routes, typed routes) |
| Language | TypeScript |
| Styling | React Native styles + NativeWind |
| Database | Expo SQLite with Drizzle ORM |
| Graphics | React Native Skia, Reanimated, Gesture Handler |
| Detection | ONNX Runtime (YOLO) |
| On-device OCR | react-native-executorch |
| Translation | Google Gemini (bring your own key) |
| Downloads | Native Kotlin foreground service + SAF storage |
| Extensions | Native Mihon/Keiyoushi source-api 1.6 host |

---

## Project structure

```text
app/            Expo Router screens (tabs, extension source, shared manga/reader)
components/     UI grouped by feature (reader, downloader, library, extensions)
services/       Extension host, database, downloader, OCR, translation
utils/          Reader geometry, identity, headers, translation hook
constants/      Theme and onboarding guides
plugins/        Expo config plugins and the extension host source of truth
android/        Generated Android project (Expo prebuild)
TR_API/         Optional FastAPI OCR bridge
```

All extension sources route through `app/manga/[slug].tsx` and `app/reader/[id].tsx`. There are no per-provider screens or provider services.

---

## Development

**Requirements:** Node 20+, JDK 17, Android SDK with an ARM64 emulator or device. A development build is required; Expo Go cannot run the native OCR and model runtimes.

```bash
npm install
npx expo run:android      # development build
npx expo start            # Metro, once a dev build is installed
npx tsc --noEmit          # typecheck
npx eslint .              # lint
```

**Release APK (single ABI):**

```bash
cd android
./gradlew.bat clean :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

Release builds are produced by `.github/workflows/android-release.yml` on a `v*` tag that matches `expo.version` in `app.json`.

---

## Optional: cloud OCR bridge

`TR_API/` hosts a FastAPI service that fronts Gradio OCR Spaces so the app can talk to one plain HTTP JSON API instead of several. It is optional; the reader works fully with on-device OCR. See `TR_API/server/main.py` for the contract.

---

## License

Apache License 2.0 - see [LICENSE.txt](LICENSE.txt).

Mangora is a reader and translator. It hosts no content and ships no sources. Every page is fetched from an extension the user installed.