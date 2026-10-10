/**
 * metadata.ts
 * ---------------------------------------------------------------------------
 * Offline metadata for downloaded manga.
 *
 * Every finished chapter already stores its own snapshot in the `downloads`
 * table. This module additionally refreshes the shared catalog (`manga` +
 * `chapters`) through the provider adapters so the manga / one-shot viewers
 * can render from the database when the network is gone, and so the snapshot
 * again whenever the internet comes back.
 * ---------------------------------------------------------------------------
 */

import { listDownloadedManga } from "@/services/db/repositories/downloadRepository";
import { trySyncProviderManga } from "@/services/library/catalogSync";
import type { ProviderId } from "@/services/library/providerAdapters";

const KNOWN_PROVIDERS = new Set<string>([
  "mangadex",
  "mangakatana",
  "manhwa18",
  "nh",
  "mgeko",
  "comix",
  "brainrot",
  "philia",
]);

function isKnownProvider(provider: string): provider is ProviderId {
  return KNOWN_PROVIDERS.has(provider);
}

/**
 * Refreshes the catalog metadata for one downloaded manga. `seen` keeps a
 * batch of completions from re-fetching the same series repeatedly.
 */
export async function snapshotDownloadMetadata(
  provider: string,
  providerMangaId: string,
  seen?: Set<string>,
): Promise<void> {
  if (!isKnownProvider(provider)) return;
  const key = `${provider}:${providerMangaId}`;
  if (seen?.has(key)) return;
  seen?.add(key);
  await trySyncProviderManga(provider, providerMangaId);
}

const MAX_CONCURRENT_REFRESH = 3;

/** Re-fetches metadata for every manga with a downloaded chapter. */
export async function refreshDownloadedMetadata(): Promise<number> {
  let entries: Awaited<ReturnType<typeof listDownloadedManga>>;
  try {
    entries = await listDownloadedManga();
  } catch {
    return 0;
  }
  const refreshable = entries.filter((entry) =>
    isKnownProvider(entry.provider),
  );
  if (refreshable.length === 0) return 0;

  let nextIndex = 0;
  let refreshed = 0;
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT_REFRESH, refreshable.length) },
    async () => {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= refreshable.length) return;
        const entry = refreshable[index];
        await trySyncProviderManga(
          entry.provider as ProviderId,
          entry.providerMangaId,
        );
        refreshed += 1;
      }
    },
  );
  await Promise.all(workers);
  return refreshed;
}
