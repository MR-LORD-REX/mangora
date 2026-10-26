import { router } from "expo-router";

export interface OpenMangaInfoOptions {
  provider: string;
  /** Provider identity in the exact encoding that provider's viewer expects. */
  id: string;
  thumbnailUrl?: string | null;
  /** Open the offline, downloaded-only view. */
  downloadsOnly?: boolean;
}

/** Routes to the shared manga viewer without importing feature internals. */
export function openMangaInfo({ provider, id, thumbnailUrl, downloadsOnly }: OpenMangaInfoOptions): void {
  router.push({
    pathname: "/manga/[slug]",
    params: {
      slug: id,
      provider,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(downloadsOnly ? { downloadsOnly: "1" } : {}),
    },
  });
}