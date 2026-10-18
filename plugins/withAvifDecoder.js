const {
  createRunOncePlugin,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(__dirname, "android", "avifdecoder");
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
  'implementation "org.aomedia.avif.android:avif:1.1.1.14d8e3c4"';
const PACKAGE_IMPORT = "import com.mangora.app.AvifPackage";
const PACKAGE_REGISTRATION = "              add(AvifPackage())";

/** Copies the AVIF transcoder Kotlin sources into the generated android project. */
function withAvifSources(config) {
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
 * Keeps the AVIF transcoder (reader / YOLO / OCR support for AVIF pages)
 * wired into a freshly prebuilt android/ folder.
 */
function withAvifDecoder(config) {
  config = withAvifSources(config);

  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("withAvifDecoder requires a Groovy build.gradle");
    }
    let contents = config.modResults.contents;
    if (!contents.includes("org.aomedia.avif.android:avif")) {
      contents = contents.replace(
        "dependencies {",
        `dependencies {\n    // AVIF decoder (libavif/AOM) for page images the platform cannot decode.\n    ${DEPENDENCY}`,
      );
    }
    config.modResults.contents = contents;
    return config;
  });

  return withMainApplication(config, (config) => {
    if (config.modResults.language !== "kt") {
      throw new Error("withAvifDecoder requires a Kotlin MainApplication");
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
  withAvifDecoder,
  "with-avif-decoder",
  "1.0.0",
);
