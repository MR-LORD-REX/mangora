/**
 * Completion notification used by the download queue. The queue reports only
 * the number of finished chapters; the composition root owns presentation.
 */
export interface DownloadNotificationPort {
  finished(chapterCount: number): Promise<void>;
}