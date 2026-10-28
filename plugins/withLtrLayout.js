const {
  createRunOncePlugin,
  withAndroidManifest,
} = require("@expo/config-plugins");

/**
 * Keep device-level layout direction LTR on every phone.
 *
 * Android's `supportsRtl` flag makes React Native mirror the whole surface on
 * Arabic and other RTL-locale devices. Mangora uses natural manga page geometry
 * and exposes reading direction explicitly through `readerPagedDirection`, so a
 * device-wide mirror would move translated overlays and absolute reader chrome
 * away from their source image. This flag only disables the automatic layout
 * mirror; text shaping and manual RTL reading remain untouched.
 */
function withLtrLayout(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    application.$ = {
      ...application.$,
      "android:supportsRtl": "false",
    };
    return config;
  });
}

module.exports = createRunOncePlugin(withLtrLayout, "with-ltr-layout", "1.0.0");
