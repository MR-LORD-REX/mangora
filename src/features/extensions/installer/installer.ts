/**
 * installer.ts
 * ---------------------------------------------------------------------------
 * Downloads an extension APK from the user-supplied repository, verifies its
 * package/version/signing certificate, and hands it to the system installer.
 * APKs stay under <cache>/updates/extensions, which the existing FileProvider
 * already exposes.
 * ---------------------------------------------------------------------------
 */

import { Directory, File, Paths } from "expo-file-system";
import { createDownloadResumable } from "expo-file-system/legacy";

import {
  canRequestPackageInstalls,
  installApk,
  openInstallPermissionSettings,
} from "@platform/native/updater";
import { inspectExtensionApk, type InspectedExtensionApk } from "@platform/extensions";
import type { ExtensionCatalogEntry } from "@platform/extensions/types";

export interface ExtensionDownloadProgress {
  written: number;
  total: number;
}

function extensionDirectory(): Directory {
  const dir = new Directory(Paths.cache, "updates", "extensions");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export async function downloadExtensionApk(
  extension: ExtensionCatalogEntry,
  onProgress?: (progress: ExtensionDownloadProgress) => void,
): Promise<File> {
  const directory = extensionDirectory();
  const safeName = extension.packageName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const target = new File(
    directory,
    `${safeName}-${extension.versionCode}.apk`,
  );
  if (target.exists) target.delete();

  const resumable = createDownloadResumable(
    extension.resources.apkUrl,
    target.uri,
    { headers: { "User-Agent": "Mangora-Android" } },
    (data: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => {
      onProgress?.({
        written: Number(data?.totalBytesWritten ?? 0),
        total: Number(data?.totalBytesExpectedToWrite ?? 0),
      });
    },
  );

  const result = await resumable.downloadAsync();
  if (!result || (result.status !== 200 && result.status !== 206)) {
    throw new Error(`Download failed (HTTP ${result?.status ?? "?"}).`);
  }
  if (!target.exists || target.size <= 0) {
    throw new Error("The downloaded extension APK is empty.");
  }
  return target;
}

export interface VerifiedExtensionApk {
  file: File;
  inspected: InspectedExtensionApk;
}

export async function verifyExtensionApk(
  file: File,
  extension: ExtensionCatalogEntry,
): Promise<VerifiedExtensionApk> {
  const inspected = await inspectExtensionApk(file.uri);
  if (inspected.packageName !== extension.packageName) {
    throw new Error(
      `Package mismatch: expected ${extension.packageName}, got ${inspected.packageName}.`,
    );
  }
  if (String(inspected.versionCode) !== String(extension.versionCode)) {
    throw new Error(
      `Version mismatch: expected ${extension.versionCode}, got ${inspected.versionCode}.`,
    );
  }
  if (extension.signingKey) {
    if (!inspected.signatureSha256) {
      throw new Error("Could not read the APK signing certificate.");
    }
    if (
      inspected.signatureSha256.toLowerCase() !==
      extension.signingKey.toLowerCase()
    ) {
      throw new Error(
        "Signing certificate does not match the repository. Install blocked.",
      );
    }
  }
  return { file, inspected };
}

export async function installExtension(file: File): Promise<void> {
  await installApk(file.uri);
}

export async function extensionInstallPermission(): Promise<boolean> {
  return canRequestPackageInstalls();
}

export async function openExtensionInstallSettings(): Promise<void> {
  await openInstallPermissionSettings();
}