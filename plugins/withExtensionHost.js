const {
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SOURCE_DIR = path.join(__dirname, "android", "extensionhost");
const TARGET_ROOT = path.join("app", "src", "main", "java");
const PACKAGE_IMPORT = "import com.mangora.app.extensions.ExtensionPackage";
const HOST_IMPORT = "import com.mangora.app.extensions.ExtensionHost";
const PACKAGE_REGISTRATION = "              add(ExtensionPackage())";
const HOST_INIT = "    ExtensionHost.initialize(this)";

const DEPENDENCIES = `
    // Mangora extension host: Tachiyomi/Keiyoushi source API 1.6 ABI.
    implementation "com.squareup.okhttp3:okhttp-jvm:5.5.0"
    implementation "com.squareup.okhttp3:okhttp-brotli:5.5.0"
    implementation "com.squareup.okhttp3:okhttp-zstd:5.5.0"
    implementation "com.squareup.okhttp3:okhttp-urlconnection:5.5.0"
    implementation "org.jsoup:jsoup:1.23.2"
    implementation "org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0"
    implementation "org.jetbrains.kotlinx:kotlinx-serialization-json-okio:1.9.0"
    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0"
    implementation "androidx.preference:preference-ktx:1.2.1"
    implementation "com.github.zhanghai.quickjs-java:quickjs-android:547f5b1597"
    implementation "com.android.tools.build:apksig:8.7.3"
`;

const PROGUARD = `
# Mangora extension host
-keep class com.mangora.app.extensions.** { *; }
-keep class eu.kanade.tachiyomi.** { *; }
-keep class uy.kohesive.injekt.** { *; }
-keep class okhttp3.** { *; }
-keep class org.jsoup.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.jsoup.**
`;

function copyRecursive(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

function withExtensionSources(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const target = path.join(
        config.modRequest.platformProjectRoot,
        TARGET_ROOT,
      );
      copyRecursive(SOURCE_DIR, target);
      return config;
    },
  ]);
}

function withExtensionGradle(config) {
  config = withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("withExtensionHost requires a Groovy app/build.gradle");
    }
    let contents = config.modResults.contents;
    if (!contents.includes("mangora_extension_host_packaging")) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `// mangora_extension_host_packaging
packagingOptions {
    resources {
        excludes += ["META-INF/versions/9/OSGI-INF/MANIFEST.MF", "META-INF/INDEX.LIST", "META-INF/DEPENDENCIES"]
    }
}

dependencies {`,
      );
    }
    if (!contents.includes("mangora_extension_host_dependencies")) {
      contents = contents.replace(
        /dependencies\s*\{/,
        `dependencies {\n    // mangora_extension_host_dependencies${DEPENDENCIES}`,
      );
    }
    if (!contents.includes("mangora_extension_host_resolution")) {
      contents = contents.replace(
        /apply plugin: "com.facebook.react"/,
        `apply plugin: "com.facebook.react"\n\n// mangora_extension_host_resolution\nconfigurations.all {\n    resolutionStrategy {\n        force "com.squareup.okhttp3:okhttp-jvm:5.5.0"\n        force "com.squareup.okhttp3:okhttp-urlconnection:5.5.0"\n        force "com.squareup.okhttp3:okhttp-brotli:5.5.0"\n        force "com.squareup.okhttp3:okhttp-zstd:5.5.0"\n        force "com.squareup.okhttp3:logging-interceptor:5.5.0"\n        dependencySubstitution {\n            substitute module("com.squareup.okhttp3:okhttp") using module("com.squareup.okhttp3:okhttp-jvm:5.5.0")\n            substitute module("com.squareup.okhttp3:okhttp-android") using module("com.squareup.okhttp3:okhttp-jvm:5.5.0")\n        }\n    }\n}`,
      );
    }
    config.modResults.contents = contents;
    return config;
  });

  return withDangerousMod(config, [
    "android",
    async (config) => {
      const proguard = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "proguard-rules.pro",
      );
      fs.mkdirSync(path.dirname(proguard), { recursive: true });
      const current = fs.existsSync(proguard) ? fs.readFileSync(proguard, "utf8") : "";
      if (!current.includes("Mangora extension host")) {
        fs.writeFileSync(proguard, current + PROGUARD);
      }
      return config;
    },
  ]);
}

function withExtensionManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] ?? [];
    const permission = "android.permission.QUERY_ALL_PACKAGES";
    const present = manifest["uses-permission"].some(
      (entry) => entry.$ && entry.$["android:name"] === permission,
    );
    if (!present) {
      manifest["uses-permission"].push({ $: { "android:name": permission } });
    }
    return config;
  });
}

function withExtensionApplication(config) {
  return withMainApplication(config, (config) => {
    if (config.modResults.language !== "kt") {
      throw new Error("withExtensionHost requires a Kotlin MainApplication");
    }
    let contents = config.modResults.contents;
    if (!contents.includes(HOST_IMPORT)) {
      contents = contents.replace(
        "import com.facebook.react.ReactPackage",
        `import com.facebook.react.ReactPackage\n${HOST_IMPORT}`,
      );
    }
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
    if (!contents.includes(HOST_INIT)) {
      contents = contents.replace(
        "    super.onCreate()",
        `    super.onCreate()\n${HOST_INIT}`,
      );
    }
    config.modResults.contents = contents;
    return config;
  });
}

function withExtensionHost(config) {
  config = withExtensionSources(config);
  config = withExtensionGradle(config);
  config = withExtensionManifest(config);
  config = withExtensionApplication(config);
  return config;
}

module.exports = createRunOncePlugin(
  withExtensionHost,
  "with-extension-host",
  "1.0.0",
);