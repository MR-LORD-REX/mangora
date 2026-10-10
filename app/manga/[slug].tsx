import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import ChapterMangaViewer from "@/components/manga/ChapterMangaViewer";
import { chapterSourceFor } from "@/components/manga/sources";
import { colors } from "@/constants/theme";
import {
  isComixBridgeReady,
  subscribeComixBridge,
} from "@/services/comix/comixBridge";

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function useComixBridgeReady(): boolean {
  const [ready, setReady] = useState(() => isComixBridgeReady());
  useEffect(
    () =>
      subscribeComixBridge((nextState: string) => {
        setReady(nextState === "ready");
      }),
    [],
  );
  return ready;
}

export default function MangaScreen() {
  const params = useLocalSearchParams<{
    slug?: string | string[];
    provider?: string | string[];
    thumbnailUrl?: string | string[];
    downloadsOnly?: string | string[];
  }>();
  const slug = paramString(params.slug);
  const provider = paramString(params.provider);
  const thumbnailUrl = paramString(params.thumbnailUrl) || null;
  const downloadsOnly = paramString(params.downloadsOnly) === "1";
  const source = chapterSourceFor(provider);
  const bridgeReady = useComixBridgeReady();

  if (!source) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Unknown manga source.</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={colors.text} size={22} />
          <Text style={styles.backText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ChapterMangaViewer
      key={`${provider}:${slug}`}
      param={slug}
      source={source}
      thumbnailUrl={thumbnailUrl}
      bridgeReady={bridgeReady}
      downloadsOnly={downloadsOnly}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: 24,
    gap: 16,
  },
  errorText: { color: colors.textMuted, fontSize: 15 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  backText: { color: colors.text, fontWeight: "700" },
});