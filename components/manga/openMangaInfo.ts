import { router } from "expo-router";

export interface OpenMangaInfoOptions {
  provider: string;
  /** Provider identity in the exact encoding that provider's viewer expects. */
  id: string;
  thumbnailUrl?: string | null;
  /** Open the offline, downloaded-only view (used from the Downloads library). */
  downloadsOnly?: boolean;
}

/** Opens the shared manga viewer for an extension source. */
export function openMangaInfo({
  provider,
  id,
  thumbnailUrl,
  downloadsOnly,
}: OpenMangaInfoOptions): void {
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