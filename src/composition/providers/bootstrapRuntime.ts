/**
 * App startup tasks, separated from the root route so navigation stays a
 * presentation concern and startup order is testable in one place.
 */

import { initializeDatabase } from "@/services/db/bootstrap";
import {
  clearAbandonedDownloadedPageSessions,
  initDownloadScheduler,
} from "@features/downloads";
import { removeLegacyReaderPageCache } from "@/services/reader/legacyCacheCleanup";
import { initPretranslateQueue } from "@features/translation";
import { clearAbandonedOcrPageSources } from "@features/vision";
import type { AppServices } from "@shared/contracts";
/** Foreground metadata refreshes are throttled to this interval. */
const METADATA_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

let lastMetadataRefresh = Date.now();

/** Opens the database and clears page artifacts abandoned by a crash. */
export async function startAppRuntime(): Promise<void> {
  await initializeDatabase();
  await Promise.all([
    clearAbandonedDownloadedPageSessions(),
    clearAbandonedOcrPageSources(),
    removeLegacyReaderPageCache(),
  ]);
  await initDownloadScheduler().catch((error) => {
    console.warn("Download queue failed to start:", error);
  });
}

/** Runs the one-time background work that is allowed to fail independently. */
export function startBackgroundServices(services: AppServices): void {
  void services.extensionRegistry.refresh().catch((error) => {
    console.warn("Extension registry refresh failed:", error);
  });
  services.library.syncAll().catch((error) => {
    console.warn("Startup library sync failed:", error);
  });
  void services.downloadedMetadata.refresh();
  void services.notifications
    .initialize()
    .then(() =>
      initPretranslateQueue({
        downloads: services.downloadSessions,
        notifications: services.translationNotifications,
        notificationCommands: services.translationNotificationCommands,
      }),
    )
    .catch((error) => {
      console.warn("Translation queue failed to start:", error);
    });
}

/** Refreshes downloaded metadata on foreground at most once per interval. */
export function refreshDownloadedMetadataOnForeground(
  services: AppServices,
): void {
  const now = Date.now();
  if (now - lastMetadataRefresh < METADATA_REFRESH_INTERVAL_MS) return;
  lastMetadataRefresh = now;
  void services.downloadedMetadata.refresh();
}
