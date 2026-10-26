/**
 * Public API for downloads.
 *
 * Cross-feature consumers import this module only. Files inside the feature
 * import their concrete sibling module (for example `../queue/scheduler`) so
 * the feature does not depend on its own facade.
 */

export {
  getDownloadedChapter,
  getDownloadStatusMap,
  isChapterDownloaded,
  isDownloadConfirmSuppressed,
  listDownloadedManga,
  listDownloads,
  listDownloadsForManga,
  suppressDownloadConfirmForToday,
} from "./catalog/catalog";
export type { DownloadedMangaSummary } from "./catalog/catalog";
export {
  downloadTarget,
  encodeProviderParam,
  readerTarget,
} from "./catalog/identity";
export type {
  DownloadCandidate,
  DownloadTarget,
  DownloadTargetInput,
} from "./catalog/identity";
export type { DownloadContext } from "./components/buttons/DownloadButtons";
export { candidateFromRow, candidatesFromRows } from "./catalog/candidates";
export { offlineReaderTarget } from "./catalog/offlineReader";
export type { OfflineReaderTarget } from "./catalog/offlineReader";

export {
  cancelPendingDownloads,
  enqueueDownloads,
  getDownloadJob,
  getDownloadSnapshot,
  initDownloadScheduler,
  isNetworkConnected,
  isNetworkWifi,
  isQueuePaused,
  pauseAllDownloads,
  removeDownload,
  resumeAllDownloads,
  retryDownload,
  retryFailedDownloads,
  subscribeDownloads,
} from "./queue/scheduler";
export type {
  DownloadJob,
  DownloadSnapshot,
  DownloadStatus,
} from "./queue/types";
export type {
  EnqueueChapterInput,
  RemoveDownloadResult,
} from "./queue/scheduler";

export {
  DOWNLOADS_DIR_NAME,
  ensureFolder as ensureDownloadFolder,
  ensureMangaFolder,
  forgetFolder,
  getFolderState as getDownloadFolderState,
  hasFolderAccess as hasDownloadFolderAccess,
  pickFolder as pickDownloadFolder,
  removeMangaFolder,
} from "./storage/storage";
export type { DownloadFolderState } from "./storage/storage";

export {
  deleteAllDownloads,
  inspectDownloadMetadata,
  MISSING_METADATA_MESSAGE,
  recoverDownloads,
} from "./metadata/recoveryPublic";
export type {
  DownloadDeletionResult,
  DownloadIssue,
  DownloadProgress,
  DownloadRecoveryResult,
} from "./metadata/recoveryPublic";

export {
  loadOfflineChapterViewer,
  loadOfflineGalleryMeta,
  offlineRowDownload,
} from "./offline/offline";
export type { OfflineRowPayload } from "./offline/offline";

export {
  clearAbandonedDownloadedPageSessions,
  cleanupDownloadedPageSession,
  downloadSessions,
  openDownloadedPageSession,
  openDownloadedPageSessionForChapter,
} from "./sessions/index";
export type { DownloadedPageSession } from "./sessions/index";

export { refreshDownloadedMetadata } from "./metadata/metadata";

export {
  requestChapterDownload,
  requestDeleteChapter,
  requestSeriesDownload,
} from "./components/actions";
export type { DownloadRequestContext } from "./components/actions";

export {
  isDownloadBusy,
  useDownloadJob,
  useDownloadStatuses,
} from "./hooks/useDownloads";
export { useDownloadSnapshot } from "./hooks/useDownloadSnapshot";
export { ChapterDownloadButton, ReaderDownloadButton, SeriesDownloadButton } from "./components/buttons/DownloadButtons";
export { default as DownloadProgressPanel } from "./components/queue/DownloadProgressPanel";
export { default as DownloadSheetHost } from "./components/sheets/DownloadSheetHost";
