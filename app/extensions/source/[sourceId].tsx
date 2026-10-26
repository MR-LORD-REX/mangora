import { useLocalSearchParams } from "expo-router";

import { openMangaInfo } from "@composition/navigation/manga";
import { ExtensionSourceScreen } from "@features/extensions";

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function ExtensionSourceRoute() {
  const params = useLocalSearchParams<{ sourceId?: string | string[] }>();
  return (
    <ExtensionSourceScreen
      sourceId={paramString(params.sourceId)}
      onOpenManga={openMangaInfo}
    />
  );
}