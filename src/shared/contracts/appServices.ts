import type { DownloadSessionPort } from "./downloadSessionPort";
import type {
  TranslationNotificationCommandPort,
  TranslationNotificationPort,
} from "./translationNotificationPort";

export interface AppNotificationService {
  initialize(): Promise<boolean>;
}

export interface AppExtensionRegistryService {
  refresh(force?: boolean): Promise<void>;
}

export interface AppLibraryService {
  syncAll(): Promise<void>;
}

export interface AppDownloadedMetadataService {
  refresh(): Promise<number>;
}

/** Identity-stable application services exposed through root React context. */
export interface AppServices {
  downloadSessions: DownloadSessionPort;
  notifications: AppNotificationService;
  translationNotifications: TranslationNotificationPort;
  translationNotificationCommands: TranslationNotificationCommandPort;
  extensionRegistry: AppExtensionRegistryService;
  library: AppLibraryService;
  downloadedMetadata: AppDownloadedMetadataService;
}
