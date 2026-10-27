import { useEffect, useRef, useState } from "react";

import {
  getDownloadedChapter,
  openDownloadedPageSession,
  type DownloadedPageSession,
} from "@features/downloads";

import type { ReaderIdentity } from "@core/catalog/readerIdentity";
import { loadChapterPages } from "@core/catalog/loadChapterPages";

export interface ReaderChapterPagesOptions {
  source: string;
  chapterId: string;
  mangaId: string;
  chapterMemo: string;
  readerIdentity: ReaderIdentity;
  providerChapterId: string;
  setLoading: (loading: boolean) => void;
  /** Called before the page list is replaced for a new chapter. */
  resetTranslationPipeline?: () => void;
  /** Resets reader display/config state before loading a new chapter. */
  onChapterStart?: () => void;
}

export interface ReaderChapterPagesState {
  pages: string[];
  loadError: string | null;
  prevChapterId: string | null;
  nextChapterId: string | null;
}

/**
 * Owns the chapter page-list lifecycle.
 *
 * Page source selection stays here so the screen can remain a composer. The
 * loader deliberately keys on route identity; page arrays can update from
 * downloads or extensions without restarting the load.
 */
export function useReaderChapterPages({
  source,
  chapterId,
  mangaId,
  chapterMemo,
  readerIdentity,
  providerChapterId,
  setLoading,
  resetTranslationPipeline,
  onChapterStart,
}: ReaderChapterPagesOptions): ReaderChapterPagesState {
  const [pages, setPages] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [prevChapterId, setPrevChapterId] = useState<string | null>(null);
  const [nextChapterId, setNextChapterId] = useState<string | null>(null);

  const latestRef = useRef({
    chapterMemo,
    mangaId,
    readerIdentity,
    providerChapterId,
    setLoading,
    resetTranslationPipeline,
    onChapterStart,
    source,
  });
  latestRef.current = {
    chapterMemo,
    mangaId,
    readerIdentity,
    providerChapterId,
    setLoading,
    resetTranslationPipeline,
    onChapterStart,
    source,
  };

  useEffect(() => {
    let cancelled = false;
    let downloadedSession: DownloadedPageSession | null = null;

    const loadPages = async () => {
      const latest = latestRef.current;
      if (!chapterId || !source) {
        latest.setLoading(false);
        return;
      }
      const startedAt = Date.now();
      let stage = "starting";
      let loadedPageCount = 0;
      console.log("[reader][open] started", {
        chapterId,
        provider: source,
        mangaId: mangaId || null,
      });
      latest.setLoading(true);
      setLoadError(null);
      latest.onChapterStart?.();
      setPrevChapterId(null);
      setNextChapterId(null);
      setPages([]);
      latest.resetTranslationPipeline?.();

      try {
        stage = "checking completed download";
        const download = await getDownloadedChapter(
          latest.readerIdentity.chapterId,
          source,
          latest.providerChapterId,
        );
        console.log("[reader][open] download lookup finished", {
          chapterId,
          found: Boolean(download),
          status: download?.status ?? null,
          hasArchive: Boolean(download?.fileUri),
          pageCount: download?.pageCount ?? null,
        });
        if (download?.status === "completed") {
          stage = "opening downloaded page files";
          downloadedSession = await openDownloadedPageSession(download);
          loadedPageCount = downloadedSession.pages.length;
          console.log("[reader][open] downloaded chapter ready", {
            chapterId,
            pages: downloadedSession.pages.length,
            temporaryExtraction: Boolean(
              download.fileUri && !download.pagesDirUri,
            ),
            elapsedMs: Date.now() - startedAt,
          });
          if (cancelled) {
            await downloadedSession.cleanup();
            downloadedSession = null;
            return;
          }
          setPages(downloadedSession.pages);
          return;
        }

        stage = "loading network page list";
        const networkUrls = await loadChapterPages({
          source,
          chapterId,
          mangaId: latest.mangaId,
          chapterMemo: latest.chapterMemo,
          onPages: () => {},
          onAdjacent: (adjacent) => {
            if (!cancelled) {
              setPrevChapterId(adjacent.prev);
              setNextChapterId(adjacent.next);
            }
          },
        });
        if (cancelled) return;
        if (!networkUrls || networkUrls.length === 0) {
          throw new Error("This chapter returned no pages.");
        }
        console.log("[reader][open] network page list loaded", {
          chapterId,
          pages: networkUrls.length,
        });
        stage = "displaying network pages";
        loadedPageCount = networkUrls.length;
        console.log("[reader][open] displaying fetched page list", {
          chapterId,
          pages: networkUrls.length,
        });
        if (!cancelled) setPages(networkUrls);
      } catch (error) {
        console.error("[reader][open] failed", {
          chapterId,
          provider: source,
          stage,
          elapsedMs: Date.now() - startedAt,
          error,
        });
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load this chapter.",
          );
        }
      } finally {
        console.log("[reader][open] finished", {
          chapterId,
          cancelled,
          stage,
          pages: loadedPageCount,
          elapsedMs: Date.now() - startedAt,
        });
        if (!cancelled) latest.setLoading(false);
      }
    };

    loadPages();
    return () => {
      cancelled = true;
      if (downloadedSession) void downloadedSession.cleanup();
    };
    // The reader deliberately reloads only when the route identity changes;
    // callbacks are read through latestRef so this effect stays identity-scoped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, source]);

  return { pages, loadError, prevChapterId, nextChapterId };
}
