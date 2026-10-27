const {
  createRunOncePlugin,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(__dirname, "android", "subsampling");
const TARGET_SUBPATH = path.join(
  "app",
  "src",
  "main",
  "java",
  "com",
  "mangora",
  "app",
);
const DEPENDENCY =
  'implementation "com.davemorrissey.labs:subsampling-scale-image-view:3.10.0"';

const PACKAGE_IMPORT =
  "import com.mangora.app.SubsamplingScaleImageViewPackage";
const PACKAGE_REGISTRATION = "              add(SubsamplingScaleImageViewPackage())";

/**
 * Registers the SubsamplingScaleImageView ReactPackage in MainApplication.kt
 * so `expo prebuild` keeps the tiled reader view wired up after regenerating
 * the android/ folder.
 */
function withSubsamplingScaleImageView(config) {
  config = withDangerousMod(config, [
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

  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error(
        "withSubsamplingScaleImageView requires a Groovy build.gradle",
      );
    }
    let contents = config.modResults.contents;
    if (!contents.includes("com.davemorrissey.labs:subsampling-scale-image-view")) {
      contents = contents.replace(
        "dependencies {",
        `dependencies {\n    ${DEPENDENCY}`,
      );
    }
    config.modResults.contents = contents;
    return config;
  });

  return withMainApplication(config, (config) => {
    if (config.modResults.language !== "kt") {
      throw new Error(
        "withSubsamplingScaleImageView requires a Kotlin MainApplication",
      );
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
  withSubsamplingScaleImageView,
  "with-subsampling-scale-image-view",
  "1.0.0",
);
