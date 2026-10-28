# Build and release

Mangora's release version comes from `app.json` → `expo.version`. The app is an
Expo development build with custom Android modules; Expo Go is not a substitute
for native testing.

## Prerequisites

- Node.js 20 and npm (CI uses Node 20).
- Java 17 for Android builds.
- Android SDK/platform tools and, for a clean native build, the configured NDK.
- A development device or emulator for the reader/native paths.
- Project-local dependency installs; do not use a global package manager.

## Local checks

From the app repository root:

```powershell
npm ci
npm run check
npx expo export --platform android
```

`npm run check` runs `check:types`, `check:arch` and all feature tests. For a
touched area, also run focused ESLint:

```powershell
npx eslint src/features/reader src/shared
```

## Development build

```powershell
npx expo start --dev-client
```

From `android/`, after the native project is generated/refreshed:

```powershell
$env:NODE_ENV='development'
.\gradlew.bat :app:assembleDebug -PreactNativeArchitectures=arm64-v8a --console=plain
```

After reinstall/reboot, ensure Metro is reachable:

```powershell
adb reverse tcp:8081 tcp:8081
```

Do not use PowerShell `>` redirection for `adb exec-out screencap -p`; it corrupts
the PNG. Capture to `/sdcard`, pull it, then remove it.

## Release build

The committed `android/` project is the current build path. From `android/`:

```powershell
.\gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --console=plain
```

The release workflow also builds `armeabi-v7a`. Validate a 32-bit APK on a real
32-bit device before treating it as supported.

### Clean-build warning

Do not combine Gradle `clean` and `assembleRelease` in one invocation. Clean can
delete subproject codegen JNI outputs after they were generated. If CMake reports
missing codegen directories, regenerate the React Native module codegen tasks
before assembling. See the repository `workspace.md` notes (local-only) for the
exact recovery sequence.

## GitHub workflows

| Workflow | Trigger | What it enforces |
| --- | --- | --- |
| `pull-request.yml` | Pull request / manual | `npm run check`, then `expo export --platform android`. |
| `android-release.yml` | `v*` tag or manual | Tag must equal `v<app.json expo.version>`; build each ABI in a matrix; publish available APKs. |
| `virustotal-release-scan.yml` | Published release / manual / successful release run | Scan APKs, update security reports and README, append links to release notes. |

The release workflow has `contents: write` and uses `softprops/action-gh-release`.
A manual run builds test artifacts but does not publish a GitHub release because
the publish job is guarded on a tag ref. A failed ABI does not block publishing a
successful ABI, but the release should not be described as complete without both
variants.

## Versioning

Keep these in sync:

- `app.json` `expo.version` - release version authority;
- Git tag `v<version>`;
- release notes under `releases/v<version>.md` when present;
- `package.json` version is package metadata and is currently older; do not use it
  as the tag authority.

The website reads release metadata separately; it must not infer the app version
from an arbitrary package file.

## Signing

`android/app/build.gradle` reads `MANGORA_KEYSTORE_*` environment values if
provided. If the keystore secret is absent, CI warns and falls back to debug
signing. A debug-signed artifact is useful for testing but is not a production
release.

## Generated documentation

After a release or commit that changes source imports/public exports, regenerate:

```powershell
npm run docs:graph
npm run docs:check
npm run docs:test
```

Commit the generated `docs/architecture/generated/*.json` snapshot as part of the
release/documentation change, or upload it as a release artifact for the website
build. See [documentation-and-graph](documentation-and-graph.md).

## Device validation

A release is not validated by a successful Gradle build. At minimum, check:

- startup/migrations on a fresh and existing database;
- extension install and source browse;
- library add/remove, reading progress/history restore;
- paged and strip reader gestures, zoom and chapter navigation;
- downloads (SAF picker, archive, foreground actions, offline read);
- OCR model install and translation overlays;
- updater permission/install path on a test build.

Use [validation-and-qa](validation-and-qa.md) for the detailed checklist.

## Related reading

- [Validation and QA](validation-and-qa.md)
- [Documentation and graph](documentation-and-graph.md)
- [Config plugins](../native/config-plugins.md)
- [Public README](../../../README.md)
