const { createRunOncePlugin, withMainApplication } = require("@expo/config-plugins");

const PACKAGE_IMPORT = "import ai.onnxruntime.reactnative.OnnxruntimePackage";
const PACKAGE_REGISTRATION = "              add(OnnxruntimePackage())";

function withOnnxruntimePackage(config) {
  return withMainApplication(config, (config) => {
    if (config.modResults.language !== "kt") {
      throw new Error("withOnnxruntimePackage requires a Kotlin MainApplication");
    }

    let contents = config.modResults.contents;
    if (!contents.includes(PACKAGE_IMPORT)) {
      contents = contents.replace(
        "import android.content.res.Configuration",
        `import android.content.res.Configuration\n\n${PACKAGE_IMPORT}`,
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
  withOnnxruntimePackage,
  "with-onnxruntime-package",
  "1.0.0",
);
