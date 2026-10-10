const { createRunOncePlugin, withMainApplication } = require("@expo/config-plugins");

const PACKAGE_IMPORT =
  "import com.mangora.app.SubsamplingScaleImageViewPackage";
const PACKAGE_REGISTRATION = "              add(SubsamplingScaleImageViewPackage())";

/**
 * Registers the SubsamplingScaleImageView ReactPackage in MainApplication.kt
 * so `expo prebuild` keeps the tiled reader view wired up after regenerating
 * the android/ folder.
 */
function withSubsamplingScaleImageView(config) {
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
