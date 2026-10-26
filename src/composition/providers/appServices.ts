import { downloadSessions, refreshDownloadedMetadata } from "@features/downloads";
import { refreshExtensionRegistry } from "@features/extensions";
import { syncAllLibraries } from "@features/library";
import {
  initializeNotifications,
  translationNotificationCommands,
  translationNotifications,
} from "@/services/notifications/notifications";
import type { AppServices } from "@shared/contracts";

/** Stable service identities for the root provider. Hot state stays external. */
export const appServices: AppServices = Object.freeze({
  downloadSessions,
  notifications: { initialize: initializeNotifications },
  translationNotifications,
  translationNotificationCommands,
  extensionRegistry: { refresh: refreshExtensionRegistry },
  library: { syncAll: syncAllLibraries },
  downloadedMetadata: { refresh: refreshDownloadedMetadata },
});
