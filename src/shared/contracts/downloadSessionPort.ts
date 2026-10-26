/**
 * A chapter's downloaded page files plus cleanup for a temporary extraction.
 * Translation and reader code consume this contract without importing the
 * downloader implementation.
 */
export interface DownloadPageSession {
  pages: string[];
  cleanup: () => Promise<void>;
}

export interface DownloadSessionPort {
  /** Opens download-owned pages, or a temporary extraction of the archive. */
  openChapter(chapterId: string): Promise<DownloadPageSession>;
  /** Releases a temporary extraction owned by the session. */
  cleanupPages(pages: string[]): Promise<void>;
}
