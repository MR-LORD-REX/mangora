import { useLocalSearchParams } from "expo-router";
import React from "react";

import { MangaScreen } from "@features/manga";

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default function MangaRoute() {
  const params = useLocalSearchParams<{
    slug?: string | string[];
    provider?: string | string[];
    thumbnailUrl?: string | string[];
    downloadsOnly?: string | string[];
  }>();

  const param = paramString(params.slug);
  const provider = paramString(params.provider);
  const thumbnailUrl = paramString(params.thumbnailUrl) || null;
  const downloadsOnly = paramString(params.downloadsOnly) === "1";

  return (
    <MangaScreen
      key={`${provider}:${param}`}
      param={param}
      provider={provider}
      thumbnailUrl={thumbnailUrl}
      downloadsOnly={downloadsOnly}
    />
  );
}
