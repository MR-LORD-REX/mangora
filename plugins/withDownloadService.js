const {
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const DOWNLOAD_PERMISSIONS = [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
  "android.permission.POST_NOTIFICATIONS",
];

const SERVICE_NAME = ".DownloadService";
const PACKAGE_IMPORT = "import com.mangora.app.DownloadPackage";
const PACKAGE_REGISTRATION = "              add(DownloadPackage())";

/** Where the downloader's Kotlin sources live and where they are installed. */
const SOURCE_DIR = path.join(__dirname, "android", "downloader");
const TARGET_SUBPATH = path.join(
  "app",
  "src",
  "main",
  "java",
  "com",
  "mangora",
  "app",
);

/**
 * Copies the downloader's Kotlin sources into the generated android project.
 * Without this, `expo prebuild --clean` would delete them, because the android
 * folder is otherwise fully generated.
 */
function withDownloadSources(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const targetDir = path.join(
        config.modRequest.platformProjectRoot,
        TARGET_SUBPATH,
      );
      fs.mkdirSync(targetDir, { recursive: true });
      for (const file of fs.readdirSync(SOURCE_DIR)) {
        if (!file.endsWith(".kt")) continue;
        fs.copyFileSync(
          path.join(SOURCE_DIR, file),
          path.join(targetDir, file),
        );
      }
      return config;
    },
  ]);
}

/**
 * Keeps the chapter downloader wired into a freshly prebuilt android/ folder:
 * the Kotlin sources, the data-sync foreground service (which keeps background
 * downloads alive), its permissions, and the ReactPackage that exposes the
 * native helpers.
 */
function withDownloadService(config) {
  config = withDownloadSources(config);

  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] ?? [];
    for (const permission of DOWNLOAD_PERMISSIONS) {
      const present = manifest["uses-permission"].some(
        (entry) => entry.$ && entry.$["android:name"] === permission,
      );
      if (!present) {
        manifest["uses-permission"].push({ $: { "android:name": permission } });
      }
    }

    const application = manifest.application?.[0];
    if (application) {
      application.service = application.service ?? [];
      const present = application.service.some(
        (entry) => entry.$ && entry.$["android:name"] === SERVICE_NAME,
      );
      if (!present) {
        application.service.push({
          $: {
            "android:name": SERVICE_NAME,
            "android:exported": "false",
            "android:foregroundServiceType": "dataSync",
          },
        });
      }
    }

    return config;
  });

  return withMainApplication(config, (config) => {
    if (config.modResults.language !== "kt") {
      throw new Error("withDownloadService requires a Kotlin MainApplication");
    }

    let contents = config.modResults.contents;
    if (!contents.includes(PACKAGE_IMPORT)) {
      contents = contents.replace(
        "import com.facebook.react.ReactPackage",
        `import com.facebook.react.ReactPackage\n${PACKAGE_IMPORT}`,
      );
    }
    if (!contents.includes(PACKAGE_REGISTRATION)) {
      contents = contents.replace(
        "            PackageList(this).packages.apply {",
        `            PackageList(this).packages.apply {\n${PACKAGE_REGISTRATION}`,
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = createRunOncePlugin(
  withDownloadService,
  "with-download-service",
  "1.1.0",
);