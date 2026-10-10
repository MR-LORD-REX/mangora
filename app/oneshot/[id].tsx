import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import GalleryMangaViewer from "@/components/manga/GalleryMangaViewer";
import { gallerySourceFor } from "@/components/manga/sources";
import { colors } from "@/constants/theme";

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default function OneShotScreen() {
  const params = useLocalSearchParams<{
    id?: string | string[];
    provider?: string | string[];
    thumbnailUrl?: string | string[];
    downloadsOnly?: string | string[];
  }>();
  const id = paramString(params.id);
  const provider = paramString(params.provider) || "nh";
  const thumbnailUrl = paramString(params.thumbnailUrl) || null;
  const downloadsOnly = paramString(params.downloadsOnly) === "1";
  const source = gallerySourceFor(provider);

  if (!source) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Unknown gallery source.</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft color={colors.text} size={22} />
          <Text style={styles.backText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <GalleryMangaViewer
      key={`${provider}:${id}`}
      param={id}
      source={source}
      thumbnailUrl={thumbnailUrl}
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