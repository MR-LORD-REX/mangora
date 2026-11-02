<div align="center">

<img src="assets/icons/logoWname.png" alt="Mangora" width="340" />

### Read manga your way on Android

An Android reader with user-installed extensions, offline chapters, on-device OCR, and optional translation.

[**Website**](https://mangora-web.web.app) ·
[**Download APKs**](https://github.com/MR-LORD-REX/mangora/releases/latest) ·
[**All releases**](https://github.com/MR-LORD-REX/mangora/releases)

<br />

![Android](https://img.shields.io/badge/Platform-Android-3DDC84?logo=android&logoColor=white)
![Open source](https://img.shields.io/badge/Source-Open%20source-181717?logo=github&logoColor=white)
![Latest release](https://img.shields.io/github/v/release/MR-LORD-REX/mangora?label=Latest%20release)

</div>

---

## About

Mangora is a reader and translation tool. Add a compatible extension repository to browse its catalog, then read with Mangora's shared library, reader, and download tools. Mangora does not host or provide a built-in catalog of manga.

## Highlights

- **Flexible reader:** vertical scrolling and paged modes, zoom, rotation, and reading controls.
- **Library and history:** organize titles and keep track of chapters and reading progress.
- **Offline chapters:** save chapters as `.cbz` files to your device.
- **On device translations :** translate a manga page on demand or as you read.
- **AI translations:** Context aware translation with AI
- **Android builds:** APKs are available for 64-bit ARM (`arm64-v8a`) and 32-bit ARM (`armeabi-v7a`).

## Download

Get the latest APK from [GitHub Releases](https://github.com/MR-LORD-REX/mangora/releases/latest). Choose the build matching your device architecture. Android may ask you to allow installation from the browser or file manager.

## Security scans

<!-- latest-security-start -->
The [v0.0.7](https://github.com/MR-LORD-REX/mangora/releases/tag/v0.0.7) APKs were analyzed by VirusTotal. See each report for its detection results.

| Build | VirusTotal analysis | SHA-256 |
| --- | --- | --- |
| arm64-v8a | [View report](https://www.virustotal.com/gui/file/e0f104fe8260d7bc76f8db1e51e0dda6af996c46327cc6235ad9fd59f85632fe/detection) | `e0f104fe8260d7bc76f8db1e51e0dda6af996c46327cc6235ad9fd59f85632fe` |
| armeabi-v7a | [View report](https://www.virustotal.com/gui/file/8a5d7d7f0818fb480ba6834f652579efef7d49efbdfc4a6bbda80815317d6e06/detection) | `8a5d7d7f0818fb480ba6834f652579efef7d49efbdfc4a6bbda80815317d6e06` |
<!-- latest-security-end -->

## Privacy and third-party services

Your library and reading progress are stored on your device. Depending on the features and extensions you use, your device may connect directly to extension services, translation providers, GitHub, or model-download hosts. Translation sends recognized text to the selected translation provider; OCR itself runs on-device.

See the [Privacy Policy](https://mangora-web.web.app/privacy), [Terms](https://mangora-web.web.app/terms), and [Copyright policy](https://mangora-web.web.app/copyright) for details.

## Disclaimer

Mangora is not affiliated with extension repositories, extensions, or content providers. It does not host or distribute their content. You are responsible for choosing extensions and services you trust and for following their terms and applicable laws.

## Technology

Built with Expo, React Native, TypeScript, and native Android modules. On-device OCR and image processing use ONNX Runtime and Skia.

## License

See [LICENSE.txt](LICENSE.txt) and the notices for bundled third-party software and assets.
