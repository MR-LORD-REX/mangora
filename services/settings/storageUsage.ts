/**
 * storageUsage.ts
 * ---------------------------------------------------------------------------
 * Numbers behind Settings -> Data and storage: device capacity, space used by
 * the device and the share that belongs to downloaded chapters.
 * ---------------------------------------------------------------------------
 */

import { Paths } from "expo-file-system";

import { sumDownloadedBytes } from "@/services/db/repositories/downloadRepository";

export interface StorageUsage {
  totalBytes: number;
  freeBytes: number;
  deviceUsedBytes: number;
  /** Bytes of finished chapter archives recorded in the database. */
  downloadBytes: number;
}

export async function getStorageUsage(): Promise<StorageUsage> {
  const totalBytes = Math.max(0, Paths.totalDiskSpace || 0);
  const freeBytes = Math.max(0, Paths.availableDiskSpace || 0);
  const deviceUsedBytes = Math.max(0, totalBytes - freeBytes);
  let downloadBytes = 0;
  try {
    downloadBytes = await sumDownloadedBytes();
  } catch (error) {
    console.warn("Could not sum downloaded bytes:", error);
  }
  return { totalBytes, freeBytes, deviceUsedBytes, downloadBytes };
}

/** "1.4 GB" style label used across the storage UI. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}