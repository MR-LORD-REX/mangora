/**
 * actions.ts
 * ---------------------------------------------------------------------------
 * The user-facing download flows shared by all three entry points:
 *
 *   1. folder gate   - ask for (or reuse) the storage folder,
 *   2. confirmation  - per-chapter dialog with "hide for today",
 *   3. chapter picker - select-all list for the whole series,
 *   and finally hand the jobs to the global scheduler.
 *
 * Enqueueing never opens a progress dialog any more: progress lives in the
 * notification and in Settings -> Download queue.
 * ---------------------------------------------------------------------------
 */

import { Alert } from "react-native";

import {
  addMangaToLibrary,
  isMangaInAnyLibrary,
  listLibraries,
} from "@/services/db/repositories/libraryRepository";
import {
  upsertManga,
  type ProviderId,
} from "@/services/db/repositories/catalogRepository";
import { listDownloadsForManga } from "@/services/db/repositories/downloadRepository";
import { DOWNLOADS_LIBRARY_ID } from "@/services/db/bootstrap";
import {
  deleteDownloadedChapter,
  enqueueDownloads,
  hasDownloadFolderAccess,
  isDownloadConfirmSuppressed,
  suppressDownloadConfirmForToday,
} from "@/services/downloader";
import type { DownloadCandidate } from "@/services/downloader";

import {
  askDownloadFolder,
  confirmAction,
  confirmDownload,
  selectChapters,
  selectLibrary,
} from "./sheets";

/** True when a usable folder is available (asking the user when needed). */
export async function ensureDownloadFolder(): Promise<boolean> {
  if (await hasDownloadFolderAccess()) return true;
  return askDownloadFolder();
}

export interface DownloadRequestContext {
  mangaTitle: string;
  thumbnailUrl: string | null;
}

/** Builds the scheduler payload for one candidate. */
function toEnqueueInput(
  candidate: DownloadCandidate,
  context: DownloadRequestContext,
) {
  return {
    id: candidate.target.chapterId,
    mangaId: candidate.target.mangaId,
    provider: candidate.target.provider,
    providerMangaId: candidate.target.providerMangaId,
    providerChapterId: candidate.target.providerChapterId,
    mangaTitle: context.mangaTitle,
    thumbnailUrl: context.thumbnailUrl,
    chapterTitle: candidate.chapterTitle,
    chapterIndex: candidate.chapterIndex,
    chapterNumber: candidate.chapterNumber,
    scanlationGroup: candidate.scanlationGroup,
    chapterGroupKey: candidate.chapterGroupKey,
    languageCode: candidate.languageCode,
    pageCount: candidate.pageCount,
  };
}

/**
 * Libraries to offer for a first download, or null when none should be offered.
 * Evaluated before enqueueing so the just-queued chapter is not mistaken for a
 * previous download of the manga.
 */
async function libraryOfferOptions(input: {
  provider: string;
  providerMangaId: string;
  mangaId: string;
}): Promise<{ id: string; name: string }[] | null> {
  try {
    const priorRows = await listDownloadsForManga(input.mangaId);
    if (priorRows.length > 0) return null;
    if (await isMangaInAnyLibrary(input.provider, [input.providerMangaId])) {
      return null;
    }
    const libraries = (await listLibraries()).filter(
      (library) => library.id !== DOWNLOADS_LIBRARY_ID,
    );
    if (libraries.length === 0) return null;
    return libraries.map((library) => ({ id: library.id, name: library.name }));
  } catch {
    return null;
  }
}

/**
 * On the very first download of a manga that is not tracked in any library,
 * offers to also add it to one (Default or a user-created library) so it shows
 * under Library as well as Downloads.
 */
async function offerLibraryForFirstDownload(
  input: {
    provider: string;
    providerMangaId: string;
    title: string;
    thumbnailUrl: string | null;
  },
  options: { id: string; name: string }[],
): Promise<void> {
  try {
    const chosen = await selectLibrary({
      title: "Add to library?",
      message: `Also add "${input.title}" to a library so it appears under Library as well as Downloads.`,
      options,
    });
    if (!chosen) return;
    const mangaId = await upsertManga({
      provider: input.provider as ProviderId,
      providerMangaId: input.providerMangaId,
      title: input.title,
      thumbnailUrl: input.thumbnailUrl,
    });
    await addMangaToLibrary(chosen, mangaId);
  } catch {
    // Offering a library is a courtesy; a failure never blocks a download.
  }
}

/**
 * Single-chapter flow: used by the chapter rows and the reader bottom bar.
 * `skipConfirm` is for callers that already asked (the reader header picker).
 */
export async function requestChapterDownload(
  candidate: DownloadCandidate,
  context: DownloadRequestContext,
  options?: { skipConfirm?: boolean },
): Promise<boolean> {
  if (!(await ensureDownloadFolder())) return false;

  if (!options?.skipConfirm) {
    const suppressed = await isDownloadConfirmSuppressed();
    if (!suppressed) {
      const answer = await confirmDownload({
        title: "Download chapter?",
        message: `${candidate.chapterTitle}\n${context.mangaTitle}`,
        allowSuppress: true,
      });
      if (!answer.confirmed) return false;
      if (answer.suppress) await suppressDownloadConfirmForToday();
    }
  }

  const offer = await libraryOfferOptions({
    provider: candidate.target.provider,
    providerMangaId: candidate.target.providerMangaId,
    mangaId: candidate.target.mangaId,
  });
  const result = await enqueueDownloads([toEnqueueInput(candidate, context)]);
  if (result.queued > 0 && offer) {
    await offerLibraryForFirstDownload(
      {
        provider: candidate.target.provider,
        providerMangaId: candidate.target.providerMangaId,
        title: context.mangaTitle,
        thumbnailUrl: context.thumbnailUrl,
      },
      offer,
    );
  }
  return result.queued > 0;
}

/**
 * Series flow: chapter picker with select-all, then one job per selection.
 * Resolves the number of queued jobs.
 */
export async function requestSeriesDownload(input: {
  candidates: DownloadCandidate[];
  context: DownloadRequestContext;
  downloadedIds: Set<string>;
}): Promise<number> {
  const selectable = input.candidates.filter(
    (candidate) => !input.downloadedIds.has(candidate.target.chapterId),
  );
  if (selectable.length === 0) return 0;

  if (!(await ensureDownloadFolder())) return 0;

  const selected = await selectChapters({
    title: "Download chapters",
    message: `${input.context.mangaTitle} \u00b7 ${selectable.length} available`,
    options: input.candidates.map((candidate) => ({
      id: candidate.target.chapterId,
      label: candidate.chapterTitle,
      subtitle: candidate.scanlationGroup ?? undefined,
      downloaded: input.downloadedIds.has(candidate.target.chapterId),
    })),
  });
  if (!selected || selected.length === 0) return 0;

  const selectedSet = new Set(selected);
  const inputs = input.candidates
    .filter((candidate) => selectedSet.has(candidate.target.chapterId))
    .map((candidate) => toEnqueueInput(candidate, input.context));
  if (inputs.length === 0) return 0;

  const first = input.candidates.find((candidate) =>
    selectedSet.has(candidate.target.chapterId),
  );
  const offer = first
    ? await libraryOfferOptions({
        provider: first.target.provider,
        providerMangaId: first.target.providerMangaId,
        mangaId: first.target.mangaId,
      })
    : null;

  const result = await enqueueDownloads(inputs);
  if (result.queued > 0 && offer && first) {
    await offerLibraryForFirstDownload(
      {
        provider: first.target.provider,
        providerMangaId: first.target.providerMangaId,
        title: input.context.mangaTitle,
        thumbnailUrl: input.context.thumbnailUrl,
      },
      offer,
    );
  }
  return result.queued;
}

/**
 * Confirms and deletes one downloaded chapter (or a batch when called in a
 * loop by the download manager).
 */
export async function requestDeleteChapter(input: {
  chapterTitle: string;
  mangaTitle: string;
}): Promise<boolean> {
  return confirmAction({
    title: "Delete this chapter?",
    message: `"${input.chapterTitle}" of "${input.mangaTitle}" is removed from the device.`,
    confirmLabel: "Delete",
  });
}

/** Confirms and deletes a downloaded chapter by id; resolves true when gone. */
export async function deleteChapterWithConfirm(input: {
  chapterId: string;
  chapterTitle: string;
  mangaTitle: string;
}): Promise<boolean> {
  const confirmed = await requestDeleteChapter({
    chapterTitle: input.chapterTitle,
    mangaTitle: input.mangaTitle,
  });
  if (!confirmed) return false;
  const result = await deleteDownloadedChapter(input.chapterId);
  if (result.warning) {
    Alert.alert(
      result.deleted ? "Delete incomplete" : "Could not delete chapter",
      result.warning,
    );
  }
  return result.deleted;
}
