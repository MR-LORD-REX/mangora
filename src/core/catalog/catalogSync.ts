import {
    markMangaSyncError,
    upsertChapter,
    upsertManga,
} from "@core/db/repositories/catalogRepository";
import {
    getProviderAdapter,
    type ProviderId,
} from "./providerAdapters";

const mangaSyncs = new Map<string, Promise<string>>();

export async function syncProviderManga(
  provider: ProviderId,
  providerMangaId: string,
): Promise<string> {
  const key = `${provider}\0${providerMangaId}`;
  const inFlight = mangaSyncs.get(key);
  if (inFlight) return inFlight;

  const sync = (async () => {
    const snapshot = await getProviderAdapter(provider).load(providerMangaId);
    const mangaId = await upsertManga(snapshot.manga);

    for (const chapter of snapshot.chapters) {
      await upsertChapter({ ...chapter, mangaId });
    }

    return mangaId;
  })();
  mangaSyncs.set(key, sync);
  try {
    return await sync;
  } finally {
    if (mangaSyncs.get(key) === sync) mangaSyncs.delete(key);
  }
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
