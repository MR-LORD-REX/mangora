<p align="center">
  <img src="assets/icons/logoWname.png" alt="Mangora" width="340" />
</p>

<h3 align="center">One library. Any source. Any language.</h3>

<p align="center">
  <img alt="Expo SDK 54" src="https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white">
  <img alt="React Native 0.81" src="https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=white">
  <img alt="Platform Android" src="https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-Pending-orange">
</p>

---

Mangora is an Android manga reader and on-device translator. It provides a unified library, a full-featured reader, and a real-time translation pipeline that detects text regions, runs OCR, and paints translated overlays directly over the original art — no external service required by default.

Mangora contains no hosted content, no bundled catalogue, and no hardcoded source URLs. All reading material is accessed by the user through sources they configure themselves. The app is a presentation and translation layer only.

---

## Features

### Library

- Unlimited named libraries with a system **Default** and a system **Downloads** library.
- Grid and compact-list views with sorting by date added, unread count, or source.
- Unread badges, in-progress chapter markers, and per-source filtering.
- Multi-library membership — the same title can belong to any number of libraries simultaneously.
- Title search, provider filter, and three sort orders (date added, unread count, source).

### Reader

- **Four reading modes:** vertical scroll, horizontal scroll, vertical paged, horizontal paged.
- Fit and Original page sizing; tiled subsampling decoding for very long strip pages.
- Configurable tap zones, page slider, orientation lock, keep-screen-awake, and auto-scroll.
- Previous and next chapter navigation with progress restored to the exact page on every return.
- Configurable reader background and chrome visibility.

### Downloads and Offline Reading

- Chapters are stored as standard `.cbz` archives in a user-selected folder (Android SAF).
- A single global queue with configurable per-source concurrency (1–5) and per-page concurrency (1–10).
- Wi-Fi-only mode; the queue polls and resumes automatically when connectivity returns.
- Foreground download service with a persistent notification carrying Pause, Resume, and Cancel actions.
- Downloaded titles remain fully readable offline with all search, sort, and group filters intact.
- A live download queue in Settings shows only active, failed, or paused jobs — completed jobs leave the queue automatically.

### OCR and Text Detection

- **YOLO-based region detection** locates speech bubbles and freeform text regions on any page.
- **On-device OCR** via ExecuTorch — no account or API key needed for supported languages.
- **Cloud OCR** via an optional self-hosted FastAPI bridge for additional language coverage.
- Supported language families: English, Latin scripts (French, German, Spanish, Italian, Portuguese, Dutch, Polish, Turkish, Indonesian, Malay, Filipino, Vietnamese), Japanese, Korean, Simplified Chinese, Russian.
- Language selection is automatic based on the source's declared language; no manual model selection required.

### Translation

- **Three translation modes:**
  - **Off** — reader only, no OCR or translation performed.
  - **Per-bubble** — each detected region is OCRed and translated independently; regions process concurrently.
  - **AI (Gemini)** — the full page is OCRed in one pass, results are batched into Gemini requests, and previous pages can be attached as story context for coherent multi-page translation.
- Translated overlays are drawn directly over the original art at the original region coordinates.
- Completed translation results are cached in SQLite; revisiting a page restores results instantly without re-running detection or OCR.
- Gemini model, batch size, context page count, and request frequency are all configurable.
- Bring your own Gemini API key — validated before saving, never transmitted to any Mangora server.

### Data and Storage

- Library, chapters, reading progress, history, downloads, and translation cache stored locally in SQLite via Drizzle ORM.
- One-tap database backup to a `.db` file in a user-chosen folder; restore from any prior backup with a full table rebuild.
- Storage usage breakdown showing downloads, other app data, and free device space.
- Translation cache can be cleared independently from the library.

---

## Install

Mangora ships as an Android APK for **ARM64 (`arm64-v8a`)** devices running **Android 7.0 (API 24) or newer**.

| Channel | Link |
|---|---|
| GitHub Releases | [github.com/MR-LORD-REX/mangora/releases](https://github.com/MR-LORD-REX/mangora/releases) |
| Telegram | [t.me/MangoraApp](https://t.me/MangoraApp) |

> **32-bit ARM (`armeabi-v7a`) is not supported.** The on-device OCR and object detection runtimes do not publish 32-bit native builds.

---

## Community

| | |
|---|---|
| What's new | https://mangora-web.web.app/whats-new |
| Privacy policy | https://mangora-web.web.app/privacy |
| Telegram | https://t.me/MangoraApp |
| Reddit | https://www.reddit.com/r/mangora |
| GitHub | https://github.com/MR-LORD-REX/mangora |
| Discord | https://discord.gg/ZWfMtkRTFR |

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo SDK 54, React Native 0.81, React 19 |
| Navigation | Expo Router 6 — file-based, typed routes |
| Language | TypeScript |
| Styling | React Native StyleSheet + NativeWind |
| Database | Expo SQLite + Drizzle ORM |
| Graphics | React Native Skia, Reanimated, Gesture Handler |
| Text detection | ONNX Runtime (YOLO) |
| On-device OCR | react-native-executorch (ExecuTorch) |
| Translation | Google Gemini — user-supplied API key |
| Downloads | Native Kotlin foreground service + Android SAF |

---

## Project Structure

```text
app/            Expo Router screens (tabs, manga viewer, reader)
components/     Feature-grouped UI (reader, downloader, library, settings)
services/       Database, downloader, OCR, translation, settings, updates
utils/          Reader geometry, page identity, image headers, translation hook
constants/      Theme and onboarding guide definitions
plugins/        Expo config plugins (download service, app links, updater)
android/        Generated Android project
```

---

## Development

**Requirements:** Node 20+, JDK 17, Android SDK, ARM64 emulator or physical device.
Expo Go cannot run this project — a development build is required for the native OCR and detection runtimes.

```bash
npm install
npx expo run:android      # install and launch a development build
npx expo start            # start Metro (once a dev build is on-device)
npx tsc --noEmit          # type-check
npx eslint .              # lint
```

**Release APK:**

```bash
cd android
./gradlew clean :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
```

CI release builds run via `.github/workflows/android-release.yml` on any `v*` tag that matches `expo.version` in `app.json`.

---

<!-- ## Optional: Cloud OCR Bridge

`TR_API/` is a self-hostable FastAPI service that proxies one or more Gradio-based OCR models behind a single JSON API. It is entirely optional — the reader operates fully with on-device OCR. See `TR_API/server/main.py` for the endpoint contract. -->

---

## Legal

### Content

Mangora does not host, store, distribute, index, or link to any manga, comic, or other copyrighted material. The app renders pages fetched by sources that the user installs and configures independently. Mangora has no knowledge of or control over the content those sources provide.

If you are a rights holder and believe content accessible through a source configured by a user infringes your copyright, your claim is against that source, not against this application. Mangora cannot be used to serve DMCA notices on behalf of third-party source operators.

### License

> **License is currently being finalized.** The project incorporates a YOLO-based object detection model whose license terms are under review. A full open-source license will be applied once that review is complete. Until then, the source is made available for inspection only — redistribution and commercial use are not permitted without explicit written permission.

Current dependency licenses of note:

| Dependency | License |
|---|---|
| React Native | MIT |
| Expo SDK | MIT |
| Drizzle ORM | Apache 2.0 |
| React Native Skia | MIT |
| react-native-executorch | BSD-style (Meta) |
| ONNX Runtime | MIT |

A complete third-party license manifest is available in `android/app/src/main/assets/` after a build.

---

*Mangora is a reader and translator. It contains no content.*