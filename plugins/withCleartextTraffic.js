const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Allow user-configured translation endpoints on local HTTP servers.
 *
 * Android 9+ blocks cleartext traffic by default. Mangora already warns in
 * Settings when an http:// endpoint is entered; this plugin applies the
 * platform permission through the canonical prebuild path as well as the
 * generated manifest used by the current checked-in Android project.
 */
function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) {
      throw new Error("withCleartextTraffic: Android application node not found.");
    }
    application.$ = {
      ...application.$,
      "android:usesCleartextTraffic": "true",
    };
    return config;
  });
}

module.exports = withCleartextTraffic;
module.exports.default = withCleartextTraffic;
