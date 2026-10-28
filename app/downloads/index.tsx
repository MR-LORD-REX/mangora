/** Expo Router adapter for the downloads feature screen. */

import { router } from "expo-router";

import { openMangaInfo } from "@composition/navigation/manga";
import { DownloadsScreen } from "@features/downloads";
import { providerLabel } from "@features/extensions";

export default function DownloadsRoute() {
  return (
    <DownloadsScreen
      onBack={() => router.back()}
      providerLabel={providerLabel}
      onOpenDownloadedManga={(target) =>
        openMangaInfo({ ...target, downloadsOnly: true })
      }
      onManageDownloadedManga={(mangaId) =>
        router.push({
          pathname: "/downloads/[mangaId]",
          params: { mangaId },
        })
      }
    />
  );
}
