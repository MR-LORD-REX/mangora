/**
 * services/updates/index.ts
 * ---------------------------------------------------------------------------
 * In-app updater (plan S14.4). Checks GitHub releases against the running
 * version, downloads the APK to app-private storage, verifies it, and hands it
 * to the system installer through the DownloadModule FileProvider.
 *
 * The UI orchestrates the steps; this file owns the mechanics and returns
 * plain data so the screen can render each phase.
 * ---------------------------------------------------------------------------
 */

import { Directory, File, Paths } from "expo-file-system";
import { createDownloadResumable } from "expo-file-system/legacy";
import * as Linking from "expo-linking";

import { SITE_ORIGIN } from "@/services/deeplink";

import {
  canRequestPackageInstalls,
  hasNativeInstaller,
  installApk,
  openInstallPermissionSettings,
  sha256OfFile,
} from "./native";
import {
  compareVersions,
  currentVersion,
  fetchReleases,
  type AvailableUpdate,
} from "./github";

export type { AvailableUpdate } from "./github";
export { compareVersions, currentVersion } from "./github";

export interface UpdateCheck {
  currentVersion: string;
  /** Newest release the user is allowed to see, or null when none exist. */
  latest: AvailableUpdate | null;
  /** The release to install, or null when the app is already up to date. */
  update: AvailableUpdate | null;
}

/**
 * Compares the running version with the newest published release. Drafts are
 * ignored by the data layer; prereleases only count when `includePrereleases`
 * is on.
 */
export async function checkForUpdate(options?: {
  includePrereleases?: boolean;
}): Promise<UpdateCheck> {
  const running = currentVersion();
  const releases = await fetchReleases(options);
  const latest = releases[0] ?? null;
  if (!latest) return { currentVersion: running, latest: null, update: null };
  const hasUpdate =
    compareVersions(latest.version, running) > 0 && latest.apk != null;
  return {
    currentVersion: running,
    latest,
    update: hasUpdate ? latest : null,
  };
}

function updatesDirectory(): Directory {
  const directory = new Directory(Paths.cache, "updates");
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

export interface DownloadProgress {
  written: number;
  total: number;
}

export interface DownloadOutcome {
  file: File;
  /** True when the bytes matched the release digest (or its size fallback). */
  verified: boolean;
}

/** Downloads a release APK into <cache>/updates and verifies it. */
export async function downloadUpdate(
  update: AvailableUpdate,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<DownloadOutcome> {
  const asset = update.apk;
  if (!asset || !asset.url) {
    throw new Error("This release has no downloadable APK.");
  }

  const directory = updatesDirectory();
  const target = new File(
    directory,
    asset.name || `mangora-${update.version}.apk`,
  );
  if (target.exists) target.delete();

  const resumable = createDownloadResumable(
    asset.url,
    target.uri,
    { headers: { "User-Agent": "Mangora-Android" } },
    (data: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
      onProgress?.({
        written: Number(data?.totalBytesWritten ?? 0),
        total: Number(data?.totalBytesExpectedToWrite ?? asset.size ?? 0),
      });
    },
  );

  const result = await resumable.downloadAsync();
  if (!result || (result.status !== 200 && result.status !== 206)) {
    throw new Error(`Download failed (HTTP ${result?.status ?? "?"}).`);
  }
  if (!target.exists || target.size <= 0) {
    throw new Error("The downloaded update is empty.");
  }

  const verified = await verifyDownload(target, update);
  return { file: target, verified };
}

function parseDigest(digest: string | null): string | null {
  if (!digest) return null;
  const value = (digest.includes(":") ? digest.split(":").pop()! : digest)
    .trim()
    .toLowerCase();
  return /^[0-9a-f]{64}$/.test(value) ? value : null;
}

async function verifyDownload(
  file: File,
  update: AvailableUpdate,
): Promise<boolean> {
  const expected = parseDigest(update.apk?.digest ?? null);
  const sizeMatches = (size: number | null): boolean =>
    !update.apk?.size || Math.abs((size ?? 0) - update.apk.size) <= 1024;

  if (!expected) return sizeMatches(file.size);

  const actual = await sha256OfFile(file.uri);
  // No native hasher (non-Android): fall back to the size check.
  if (!actual) return sizeMatches(file.size);
  return actual === expected;
}

export type InstallPermissionState = "granted" | "denied" | "unsupported";

export async function installPermissionState(): Promise<InstallPermissionState> {
  if (!hasNativeInstaller()) return "unsupported";
  return (await canRequestPackageInstalls()) ? "granted" : "denied";
}

/** Opens the per-app "install unknown apps" settings screen. */
export async function openInstallSettings(): Promise<void> {
  await openInstallPermissionSettings();
}

/** Hands a verified APK to the system installer. */
export async function installUpdate(file: File): Promise<void> {
  await installApk(file.uri);
}

/** Fallback for builds that cannot install in-app (declined permission). */
export async function openDownloadPage(): Promise<void> {
  await Linking.openURL(`${SITE_ORIGIN}/download`).catch(() => {});
}