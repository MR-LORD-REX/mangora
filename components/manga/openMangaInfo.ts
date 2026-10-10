import { router } from "expo-router";

export interface OpenMangaInfoOptions {
  provider: string;
  /** Provider identity in the exact encoding that provider's viewer expects. */
  id: string;
  thumbnailUrl?: string | null;
  /** Open the offline, downloaded-only view (used from the Downloads library). */
  downloadsOnly?: boolean;
}

/**
 * Opens the shared manga viewer for a provider. Chapter-based sources use the
 * /manga/[slug] route; gallery (one-shot) sources use /oneshot/[id].
 */
export function openMangaInfo({
  provider,
  id,
  thumbnailUrl,
  downloadsOnly,
}: OpenMangaInfoOptions): void {
  const offline = downloadsOnly ? { downloadsOnly: "1" } : {};
  if (provider === "nh") {
    router.push({
      pathname: "/oneshot/[id]",
      params: {
        id,
        provider,
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...offline,
      },
    });
    return;
  }
  router.push({
    pathname: "/manga/[slug]",
    params: {
      slug: id,
      provider,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...offline,
    },
  });
}