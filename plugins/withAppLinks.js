const {
  createRunOncePlugin,
  withAndroidManifest,
} = require("@expo/config-plugins");

/** Host and paths the app claims as verified Android App Links (plan S14.2). */
const HOST = "mangora-web.web.app";
const PATHS = ["/manga", "/oneshot"];

/**
 * Adds an auto-verified https App Link intent-filter to MainActivity for
 * `https://mangora-web.web.app/manga/*` and `/oneshot/*`, so a shared series
 * link opens straight in the app when it is installed and verified (the
 * website /manga/:id landing covers the not-installed case). The `mangora://`
 * scheme filter is left untouched.
 */
function withAppLinks(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    const activities = application.activity ?? [];
    const main = activities.find(
      (activity) => activity.$ && activity.$["android:name"] === ".MainActivity",
    );
    if (!main) return config;

    main["intent-filter"] = main["intent-filter"] ?? [];
    const present = main["intent-filter"].some((filter) =>
      (filter.data ?? []).some(
        (data) => data.$ && data.$["android:host"] === HOST,
      ),
    );
    if (present) return config;

    main["intent-filter"].push({
      $: { "android:autoVerify": "true" },
      action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
      category: [
        { $: { "android:name": "android.intent.category.DEFAULT" } },
        { $: { "android:name": "android.intent.category.BROWSABLE" } },
      ],
      data: PATHS.map((prefix) => ({
        $: {
          "android:scheme": "https",
          "android:host": HOST,
          "android:pathPrefix": prefix,
        },
      })),
    });

    return config;
  });
}

module.exports = createRunOncePlugin(withAppLinks, "with-app-links", "1.0.0");