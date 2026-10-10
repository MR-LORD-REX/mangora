/**
 * DownloadedStrip.tsx
 * ---------------------------------------------------------------------------
 * "Downloaded" section for a provider main screen. It always renders from the
 * local database + cached covers, so it keeps listing offline chapters when
 * the provider feed cannot be reached.
 * ---------------------------------------------------------------------------
 */

import { HardDriveDownload } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { openMangaInfo } from "@/components/manga/openMangaInfo";
import { colors, radius } from "@/constants/theme";
import { encodeProviderParam, listDownloadedManga, subscribeDownloads } from "@/services/downloader";
import type { DownloadedMangaSummary } from "@/services/db/repositories/downloadRepository";
import { imageSourceForUrl } from "@/utils/reader/imageHeaders";

export default function DownloadedStrip({
  provider,
  accent,
}: {
  provider: string;
  accent: string;
}) {
  const [entries, setEntries] = useState<DownloadedMangaSummary[]>([]);

  const refresh = useCallback(() => {
    void listDownloadedManga(provider)
      .then(setEntries)
      .catch(() => {});
  }, [provider]);

  useEffect(() => {
    refresh();
    return subscribeDownloads(() => refresh());
  }, [refresh]);

  if (entries.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headingRow}>
        <HardDriveDownload color={accent} size={15} />
        <Text style={styles.heading}>Downloaded</Text>
        <Text style={styles.count}>{entries.length}</Text>
      </View>
      <FlatList
        horizontal
        data={entries}
        keyExtractor={(item) => item.mangaId}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            onPress={() =>
              openMangaInfo({
                provider: item.provider,
                id: encodeProviderParam(item.provider, item.providerMangaId),
                thumbnailUrl: item.thumbnailPath ?? item.thumbnailUrl,
              })
            }
          >
            {item.thumbnailPath || item.thumbnailUrl ? (
              <Image
                source={imageSourceForUrl(
                  item.thumbnailPath ?? item.thumbnailUrl,
                )}
                style={styles.cover}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.cover, styles.placeholder]}>
                <Text style={styles.placeholderText}>No cover</Text>
              </View>
            )}
            <Text numberOfLines={2} style={styles.title}>
              {item.title}
            </Text>
            <Text style={styles.meta}>
              {item.chapterCount} chapter{item.chapterCount === 1 ? "" : "s"}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 6, paddingBottom: 10 },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  heading: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    flex: 1,
  },
  count: { color: colors.textFaint, fontSize: 12, fontWeight: "700" },
  list: { paddingHorizontal: 12, gap: 12 },
  card: { width: 104 },
  pressed: { opacity: 0.75 },
  cover: {
    width: 104,
    height: 148,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  placeholder: { alignItems: "center", justifyContent: "center" },
  placeholderText: { color: colors.textFaint, fontSize: 11 },
  title: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 6,
  },
  meta: { color: colors.textFaint, fontSize: 11, marginTop: 2 },
});
