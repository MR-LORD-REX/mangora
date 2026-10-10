const {
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const INSTALL_PERMISSION = "android.permission.REQUEST_INSTALL_PACKAGES";
/** Must match the authority used by DownloadModule.installApk(). */
const AUTHORITY_SUFFIX = ".mangora.updates";
const PATH_RESOURCE = "@xml/mangora_updates_paths";

/** The FileProvider roots the updater writes its downloaded APK under. */
const PATHS_XML = `<?xml version="1.0" encoding="utf-8"?>
<!-- FileProvider roots for the in-app updater (plan S14.4). The APK is
     downloaded into <cache>/updates/ by expo-file-system. -->
<paths xmlns:android="http://schemas.android.com/apk/res/android">
  <cache-path name="updates" path="updates/" />
  <files-path name="updates_files" path="updates/" />
</paths>
`;

function withUpdaterResource(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const resDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml",
      );
      fs.mkdirSync(resDir, { recursive: true });
      fs.writeFileSync(path.join(resDir, "mangora_updates_paths.xml"), PATHS_XML);
      return config;
    },
  ]);
}

/**
 * Wires the in-app updater into a freshly prebuilt android/ folder: the
 * REQUEST_INSTALL_PACKAGES permission and the FileProvider that hands a
 * downloaded APK to the system installer (plan S14.4). Without this,
 * `expo prebuild --clean` would drop both.
 */
function withUpdater(config) {
  config = withUpdaterResource(config);

  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] ?? [];
    const hasPermission = manifest["uses-permission"].some(
      (entry) => entry.$ && entry.$["android:name"] === INSTALL_PERMISSION,
    );
    if (!hasPermission) {
      manifest["uses-permission"].push({
        $: { "android:name": INSTALL_PERMISSION },
      });
    }

    const application = manifest.application?.[0];
    if (application) {
      application.provider = application.provider ?? [];
      const hasProvider = application.provider.some(
        (entry) =>
          entry.$ &&
          typeof entry.$["android:authorities"] === "string" &&
          entry.$["android:authorities"].endsWith(AUTHORITY_SUFFIX),
      );
      if (!hasProvider) {
        application.provider.push({
          $: {
            "android:name": "androidx.core.content.FileProvider",
            "android:authorities": "${applicationId}" + AUTHORITY_SUFFIX,
            "android:exported": "false",
            "android:grantUriPermissions": "true",
          },
          "meta-data": [
            {
              $: {
                "android:name": "android.support.FILE_PROVIDER_PATHS",
                "android:resource": PATH_RESOURCE,
              },
            },
          ],
        });
      }
    }

    return config;
  });
}

module.exports = createRunOncePlugin(withUpdater, "with-updater", "1.0.0");