import { useEffect, useRef } from "react";

import { updateChapterPageCount } from "@/services/db/repositories/catalogRepository";
import {
  recordHistoryOpen,
  updateHistoryPage,
} from "@/services/db/repositories/historyRepository";
import {
  getProgress,
  markChapterGroupCompleted,
  updateProgress,
} from "@/services/db/repositories/progressRepository";
import type { ReaderIdentity } from "@core/catalog/readerIdentity";

interface ReaderRecord {
  chapterId: string;
  historyId: string;
  pageCount: number;
}

interface ReaderSessionLedgerOptions {
  source: string;
  chapterId: string;
  mangaId: string;
  title: string;
  mangaTitle: string;
  thumbnailUrl: string;
  language: string;
  chapterMemo: string;
  pages: string[];
  currentPageIndex: number;
  identity: ReaderIdentity;
  displayItemsRef: { current: { pageIndex: number }[] };
  lastPageIndexRef: { current: number };
  lastDisplayIndexRef: { current: number };
  setCurrentPageIndex: (pageIndex: number) => void;
  setCurrentDisplayIndex: (displayIndex: number) => void;
  scrollToReaderIndex: (index: number, animated?: boolean) => void;
}

function isFinished(record: ReaderRecord, pageIndex: number): boolean {
  return record.pageCount > 0 && pageIndex >= record.pageCount - 1;
}

/**
 * Reader open restore and progress/history persistence.
 *
 * Kept outside ReaderScreen so the screen only composes the view. The open
 * effect intentionally retains the original dependency set: a chapter restore
 * must stay anchored if reader mode, sizing or callbacks are refreshed.
 */
export function useReaderSessionLedger({
  source,
  chapterId,
  mangaId,
  title,
  mangaTitle,
  thumbnailUrl,
  language,
  chapterMemo,
  pages,
  currentPageIndex,
  identity,
  displayItemsRef,
  lastPageIndexRef,
  lastDisplayIndexRef,
  setCurrentPageIndex,
  setCurrentDisplayIndex,
  scrollToReaderIndex,
}: ReaderSessionLedgerOptions): void {
  const readerRecordRef = useRef<ReaderRecord | null>(null);

  useEffect(() => {
    if (!pages.length || !chapterId || !source) return;
    let cancelled = false;

    const persistReaderOpen = async () => {
      const provider = identity.provider;
      const canonicalMangaId = identity.mangaId;
      const canonicalChapterId = identity.chapterId;
      if (cancelled) return;
      await updateChapterPageCount(canonicalChapterId, pages.length);

      const progress = await getProgress(canonicalChapterId);
      if (cancelled) return;
      const lastPageIndex = Math.min(
        Math.max(progress?.lastPageIndex ?? 0, 0),
        Math.max(pages.length - 1, 0),
      );
      readerRecordRef.current = {
        chapterId: canonicalChapterId,
        historyId: canonicalChapterId,
        pageCount: pages.length,
      };
      setCurrentPageIndex(lastPageIndex);
      lastPageIndexRef.current = lastPageIndex;
      await recordHistoryOpen({
        mangaId: canonicalMangaId,
        chapterId: canonicalChapterId,
        provider,
        title,
        thumbnailUrl: thumbnailUrl || null,
        readerParams: {
          id: chapterId,
          source: provider,
          mangaTitle,
          chapterTitle: title,
          chapterMemo,
          ...(mangaId ? { mangaId } : {}),
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
          ...(language ? { language } : {}),
        },
        pageIndex: lastPageIndex,
      });
      if (!cancelled) {
        const displayIndex = displayItemsRef.current.findIndex(
          (item) => item.pageIndex === lastPageIndex,
        );
        const targetIndex = displayIndex >= 0 ? displayIndex : 0;
        lastDisplayIndexRef.current = targetIndex;
        setCurrentDisplayIndex(targetIndex);
        requestAnimationFrame(() => {
          scrollToReaderIndex(targetIndex, false);
        });
      }
    };

    persistReaderOpen().catch((error) => {
      console.error("Failed to persist reader history:", error);
    });
    return () => {
      cancelled = true;
    };
  }, [
    chapterId,
    chapterMemo,
    displayItemsRef,
    identity,
    language,
    lastDisplayIndexRef,
    lastPageIndexRef,
    mangaId,
    mangaTitle,
    pages,
    scrollToReaderIndex,
    setCurrentDisplayIndex,
    setCurrentPageIndex,
    source,
    thumbnailUrl,
    title,
  ]);

  useEffect(() => {
    const record = readerRecordRef.current;
    if (!record || !pages.length) return;
    const finished = isFinished(record, currentPageIndex);
    void updateProgress(record.chapterId, {
      pageIndex: currentPageIndex,
      pageCount: record.pageCount,
    }).catch((error) =>
      console.warn("Failed to save reading progress:", error),
    );
    if (finished) {
      // Finish propagates to every scanlation-group upload of this chapter.
      void markChapterGroupCompleted(record.chapterId).catch((error) =>
        console.warn("Failed to sync group read state:", error),
      );
    }
    void updateHistoryPage(record.historyId, currentPageIndex).catch((error) =>
      console.warn("Failed to save history page:", error),
    );
  }, [currentPageIndex, pages.length]);

  useEffect(() => {
    return () => {
      const record = readerRecordRef.current;
      if (!record) return;
      void updateProgress(record.chapterId, {
        pageIndex: currentPageIndex,
        pageCount: record.pageCount,
      }).catch(() => {});
      if (isFinished(record, currentPageIndex)) {
        void markChapterGroupCompleted(record.chapterId).catch(() => {});
      }
      void updateHistoryPage(record.historyId, currentPageIndex).catch(
        () => {},
      );
    };
  }, [currentPageIndex]);
}