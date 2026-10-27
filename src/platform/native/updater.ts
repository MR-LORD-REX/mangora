/**
 * src/platform/native/updater.ts
 * ---------------------------------------------------------------------------
 * Typed bridge to the updater helpers on the `MangoraDownloader` Android
 * module (android/app/src/main/java/com/mangora/app/DownloadModule.kt). Every
 * call degrades to a safe no-op / false when the native module is missing
 * (Expo Go, iOS, a non-rebuilt dev client).
 * ---------------------------------------------------------------------------
 */

import { NativeModules, Platform } from "react-native";

interface MangoraUpdaterModule {
  canRequestPackageInstalls(): Promise<boolean>;
  openInstallPermissionSettings(): Promise<boolean>;
  installApk(path: string): Promise<boolean>;
  sha256OfFile(path: string): Promise<string>;
}

const nativeModule = NativeModules.MangoraDownloader as
  | MangoraUpdaterModule
  | undefined;

/** True when the in-app installer is linked into this build. */
export function hasNativeInstaller(): boolean {
  return (
    Platform.OS === "android" &&
    nativeModule != null &&
    typeof nativeModule.installApk === "function"
  );
}

/** True when the app may install packages (API 26+). */
export async function canRequestPackageInstalls(): Promise<boolean> {
  if (!hasNativeInstaller()) return false;
  try {
    return await nativeModule!.canRequestPackageInstalls();
  } catch {
    return false;
  }
}

/** Opens the per-app "install unknown apps" settings screen. */
export async function openInstallPermissionSettings(): Promise<void> {
  if (!hasNativeInstaller()) return;
  try {
    await nativeModule!.openInstallPermissionSettings();
  } catch {
    // The user can still enable it manually from system settings.
  }
}

/** Hands a downloaded APK to the system installer (update-in-place). */
export async function installApk(path: string): Promise<boolean> {
  if (!hasNativeInstaller()) {
    throw new Error("This build cannot install packages in-app.");
  }
  return nativeModule!.installApk(path);
}

/** Streaming SHA-256 hex digest, or null when the native module is absent. */
export async function sha256OfFile(path: string): Promise<string | null> {
  if (!hasNativeInstaller()) return null;
  try {
    return (await nativeModule!.sha256OfFile(path)).toLowerCase();
  } catch {
    return null;
  }
}