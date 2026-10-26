import type { LibraryCard } from "@/services/db/repositories/libraryRepository";
import type { DownloadedMangaSummary } from "@features/downloads";

/** Maps downloaded-manga rows into the same card shape the library grid renders. */
export function downloadedMangaToLibraryCards(
  entries: DownloadedMangaSummary[],
  search: string,
): LibraryCard[] {
  const term = search.trim().toLowerCase();
  return entries
    .filter((entry) => !term || entry.title.toLowerCase().includes(term))
    .map((entry) => ({
      id: entry.mangaId,
      provider: entry.provider,
      providerMangaId: entry.providerMangaId,
      title: entry.title,
      thumbnailUrl: entry.thumbnailPath ?? entry.thumbnailUrl,
      addedAt: entry.updatedAt,
      totalChapters: entry.chapterCount,
      unreadChapters: 0,
    }));
}

export function hasActiveLibraryFilters(
  provider: string,
  sort: string,
): boolean {
  return provider !== "" || sort !== "addedDesc";
}