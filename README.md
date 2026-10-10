<p align="center">
  <img src="assets/icons/logoWname.png" alt="Mangora" width="340" />
</p>

<h3 align="center">One library. Eight sources. Any language.</h3>

<p align="center">
  <img alt="Expo SDK 54" src="https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white">
  <img alt="React Native 0.81" src="https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=white">
  <img alt="Platform Android" src="https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white">
  <img alt="License Apache 2.0" src="https://img.shields.io/badge/License-Apache%202.0-blue">
</p>

---

Mangora is an Android manga and gallery reader that pulls **eight providers** into a single library, opens every chapter in **one shared reader**, and can **detect, read and translate** the text on any page.

Download a series once and it reads offline on a plane. Or open a chapter in a language you do not speak and let Mangora find the speech bubbles, OCR them, and repaint them in yours — on-device or through a cloud model, your choice.

Built with Expo and React Native, dark by default, and designed around a thumb.

---

## Why Mangora

- **Eight sources, one shelf.** MangaDex, MangaKatana, Manhwa18, MangaGeko, Comix, BrainRot, Philia Scans and NHentai. Track anything from anywhere in the same library.
- **A real reader, not a web view.** Four reading modes, tap zones, rotation lock, tiled decoding for 20,000-pixel strips, and per-source image handling.
- **Download once, read forever.** Chapters are stored as `.cbz` archives in a folder *you* pick. Full offline library, queue, and per-series management.
- **Translate in place.** YOLO finds the bubbles, OCR reads them, and the translated text is drawn back over the page — with adjustable text scale.
- **Runs on your device.** Local OCR through ExecuTorch, local translation, a local SQLite library. The cloud is optional, never required.
- **Privacy by default.** Your folder, your data, your API keys. No account, no telemetry.

---

## Features

### Library
- Unlimited named libraries, plus two system libraries: **Default** and **Downloads**.
- Grid and compact-list views, with sorting by date added, unread count or provider.
- Unread badges, in-progress markers (`at page N`), and completed chapters rendered faint so you can see where you left off.
- Add-to-library sheet with staged multi-library membership, and a source filter on every list.
- One-tap sync from the library menu — the grid itself never triggers a network call.

### Reader
- **Four reading modes:** vertical scroll, horizontal scroll, vertical paged, horizontal paged.
- **Fit and Original** page sizing, with native tiled decoding for very long strip pages.
- **Tap zones** for page turns, plus a page slider with immediate seek.
- Rotation lock, keep-screen-awake, and auto-scroll.
- Previous / next chapter navigation where the source supports it.
- Configurable background and chrome, with a per-provider accent colour.
- Progress and history saved per chapter, restored to the exact page on reopen.

### Downloads and offline
- Chapters are written as `.cbz` archives into a folder you choose once — the grant survives restarts.
- One global queue with per-source and per-page concurrency limits, pause / resume / cancel, and automatic retry.
- **Wi-Fi only** mode that pauses when the network drops and resumes by itself when it returns.
- A foreground service keeps downloads alive with a live notification showing chapter, pages, speed and ETA.
- Every downloaded series stays readable with no connection, with search, sort and scanlation-group filters intact.
- Per-series manager to delete a chapter or wipe an entire series, archive and all.

### OCR and translation
- **YOLO** region detection finds speech bubbles and messy text on a page.
- **OCR** runs either on-device (ExecuTorch) or through a cloud OCR endpoint — switchable in settings.
- **Three translation modes:**
  - `off` — read as-is.
  - `free` — every bubble is read and translated independently, so bubbles work in parallel.
  - `ai` — the page is read once and translated with a Gemini model, batched, with previous pages attached as story context.
- Translation overlays are drawn over the original art with adjustable text scale, and results are cached so a revisit is instant.

### Data and storage
- Library, chapters, progress, history, downloads and cached translations live in **SQLite** via Drizzle.
- **Backup and restore** the entire database to a single `.db` file in your chosen folder.
- Storage breakdown showing downloads, other device usage, and free space.

### First launch
- A swipeable onboarding overlay that walks through the Telegram channel, the reader, and AI translation setup — skippable for a session, or forever.

---

## Sources

| Source | Content | Notes |
| --- | --- | --- |
| **MangaDex** | Manga, multi-language | Official API, stable chapter IDs, full adjacent-chapter navigation |
| **MangaKatana** | Manga | URL-based identity, encoded through navigation |
| **MangaGeko** | Manga | Browse filters plus a `safe mode` toggle |
| **Comix** | Manga | Cloudflare-shielded; runs through an in-app browser bridge with signed API calls |
| **BrainRot** | Comics | WordPress/Madara archive, bridge-backed browse |
| **Philia Scans** | Comics | DRM-wrapped pages, decrypted natively on-device |
| **Manhwa18** | Manhwa | 18+ |
| **NHentai** | Galleries | 18+ — paste a code or a gallery URL to jump straight in |

Every source opens the same reader with the same controls; source-specific quirks stay in the service layer, never in the UI.

---

## Install

Mangora ships as an Android APK for **ARM64 (`arm64-v8a`)** devices running **Android 7.0 or newer**.

- **GitHub Releases** — grab the latest APK from the [releases page](https://github.com/MR-LORD-REX/mangora/releases).
- **Telegram** — beta builds and release announcements land in the [Mangora channel](https://t.me/MangoraApp).

> 32-bit ARM devices (`armeabi-v7a`) are not supported. The native OCR and on-device model runtimes have no 32-bit build.

---

## Screenshots

_Coming with the showcase site — library, reader, translation overlay, downloads queue._

---

## Community and links

| | |
| --- | --- |
| What's new | https://example.com/mangora/whats-new |
| Privacy policy | https://example.com/mangora/privacy |
| Telegram | https://t.me/MangoraApp |
| Reddit | https://www.reddit.com/r/mangora |
| GitHub | https://github.com/MR-LORD-REX/mangora |
| Discord | https://discord.gg/ZWfMtkRTFR |

These are the canonical destinations and match the `LINKS` table in the app (`components/settings/AboutSection.tsx`) and the onboarding overlay.

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

---

## Project structure

```
app/            Expo Router screens (tabs, provider routes, shared reader)
components/     UI grouped by feature (reader, downloader, library, sources...)
services/       Provider clients, database, downloader, OCR, translation
utils/          Reader geometry, identity, image headers, translation hook
constants/      Theme, provider accents, onboarding guides
plugins/        Expo config plugins (native module wiring)
android/        Generated Android project (Expo prebuild)
TR_API/         Optional FastAPI OCR bridge
```

Routes are file-based. Provider screens live outside the tab shell so a chapter can open full-screen from anywhere.

---

## Development

**Requirements:** Node 20+, JDK 17, Android SDK with an ARM64 emulator or device. A development build is required — Expo Go cannot run the native OCR and model runtimes.

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

`TR_API/` hosts a FastAPI service that fronts Gradio OCR Spaces so the app can talk to one plain HTTP JSON API instead of several. It is optional — the reader works fully with on-device OCR. See `TR_API/server/main.py` for the contract.

---

## License

Apache License 2.0 — see [LICENSE.txt](LICENSE.txt).

Mangora is a reader. It hosts no content and ships no provider data; every chapter is fetched live from the source you choose.