import {
    markMangaSyncError,
    upsertChapter,
    upsertManga,
} from "@/services/db/repositories/catalogRepository";
import {
    getProviderAdapter,
    type ProviderId,
} from "./providerAdapters";

export async function syncProviderManga(
  provider: ProviderId,
  providerMangaId: string,
): Promise<string> {
  const snapshot = await getProviderAdapter(provider).load(providerMangaId);
  const mangaId = await upsertManga(snapshot.manga);

  for (const chapter of snapshot.chapters) {
    await upsertChapter({ ...chapter, mangaId });
  }

  return mangaId;
}

export async function trySyncProviderManga(
  provider: ProviderId,
  providerMangaId: string,
): Promise<string | null> {
  try {
    return await syncProviderManga(provider, providerMangaId);
  } catch (error) {
    await markMangaSyncError(provider, providerMangaId, error);
    return null;
  }
}
