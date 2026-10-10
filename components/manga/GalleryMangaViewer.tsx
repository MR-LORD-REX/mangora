import { router, useFocusEffect } from "expo-router";
import { ArrowLeft, Check, Clock, Copy, Heart, Play, Share2 } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { setStringAsync } from "expo-clipboard";

import AddToLibraryButton from "@/components/library/AddToLibraryButton";
import { GalleryDownloadButton } from "@/components/downloader/DownloadButtons";
import { galleryCandidate } from "@/components/downloader/candidates";
import { loadOfflineGalleryMeta } from "@/services/downloader";
import type { GallerySourceModule } from "@/components/manga/sources/module";
import type { ChapterMeta, ProgressMap, SharedTag } from "@/components/manga/types";
import { colors, radius } from "@/constants/theme";
import type { ProviderId } from "@/services/db/repositories/catalogRepository";
import { getTrackedChapterProgress } from "@/services/library/librarySync";
import { imageSourceForUrl } from "@/utils/reader/imageHeaders";
import { useAppSettings } from "@/components/settings/useAppSettings";
import {
  canShareProvider,
  shareMangaLink,
} from "@/services/deeplink";

export interface GalleryMangaViewerProps {
  param: string;
  source: GallerySourceModule;
  thumbnailUrl?: string | null;
  /** Offline mode: load from the download database only, no network. */
  downloadsOnly?: boolean;
}

export default function GalleryMangaViewer({
  param,
  source,
  thumbnailUrl,
  downloadsOnly = false,
}: GalleryMangaViewerProps) {
  const accent = source.accent;
  const identity = useMemo(() => source.decodeIdentity(param), [param, source]);
  const { settings } = useAppSettings();

  const [meta, setMeta] = useState<ChapterMeta | null>(null);
  const [galleryCode, setGalleryCode] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<number | null>(null);
  const [uploadedAt, setUploadedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (downloadsOnly) {
      // Opened from the Downloads library: database only, never the network.
      const offline = await loadOfflineGalleryMeta(
        source.provider,
        identity,
      ).catch(() => null);
      if (offline) {
        setMeta(offline);
      } else {
        setMeta(null);
        setError("Nothing downloaded for this gallery yet.");
      }
      setLoading(false);
      return;
    }
    try {
      const result = await source.load(identity);
      setMeta(result.meta);
      setGalleryCode(result.galleryCode ?? null);
      setPageCount(result.pageCount ?? null);
      setFavorites(result.favorites ?? null);
      setUploadedAt(result.uploadedAt ?? null);
    } catch (err) {
      console.error(`Failed to load ${source.label} gallery:`, err);
      // Network-first, database second: a downloaded gallery stays readable.
      const offline = await loadOfflineGalleryMeta(
        source.provider,
        identity,
      ).catch(() => null);
      if (offline) {
        setMeta(offline);
        setError(null);
      } else {
        setError(
          err instanceof Error ? err.message : "Could not load this item.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [downloadsOnly, identity, source]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshProgress = useCallback(() => {
    const query = source.progressQuery(identity);
    getTrackedChapterProgress({
      provider: query.provider as ProviderId,
      providerMangaIds: query.providerMangaIds,
      toChapterKey: query.toChapterKey,
    })
      .then(setProgress)
      .catch(() => {});
  }, [identity, source]);

  useFocusEffect(
    useCallback(() => {
      refreshProgress();
    }, [refreshProgress]),
  );

  const copyGalleryCode = () => {
    if (!galleryCode) return;
    void setStringAsync(galleryCode).catch(() => {});
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const onTagPress = (tag: SharedTag) => {
    source.openTag?.(tag);
  };

  const shareAllowed = canShareProvider(
    source.provider,
    settings?.ageRestrictedSources ?? false,
  );

  const onShare = async () => {
    if (!meta) return;
    const result = await shareMangaLink({
      provider: source.provider,
      param,
      title: meta.title,
      gallery: true,
    });
    if (result === "copied") {
      setShareNotice("Link copied to clipboard");
    } else if (result === "shared") {
      setShareNotice(null);
    }
  };

  const progressForGallery = progress[galleryCode ?? identity];
  const reading = progressForGallery?.status === "reading";
  const atPage =
    reading && (progressForGallery.lastPageIndex ?? 0) > 0
      ? progressForGallery.lastPageIndex + 1
      : null;

  const downloadCandidate = useMemo(
    () => (meta ? galleryCandidate(source, identity, meta, pageCount) : null),
    [identity, meta, pageCount, source],
  );
  const downloadContext = useMemo(
    () => ({
      mangaTitle: meta?.title ?? source.label,
      thumbnailUrl: meta?.coverUrl ?? thumbnailUrl ?? null,
    }),
    [meta?.coverUrl, meta?.title, source.label, thumbnailUrl],
  );

  if (loading && !meta) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <ActivityIndicator color={accent} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!meta) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {error ?? "Failed to load this item."}
          </Text>
          <Pressable
            onPress={() => void load()}
            style={[styles.readBtn, { backgroundColor: accent }]}
          >
            <Text style={styles.readBtnText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const cover = meta.coverUrl || thumbnailUrl;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.backBtn}
        >
          <ArrowLeft color={colors.text} size={26} />
        </Pressable>

        <View style={styles.heroContainer}>
          {cover ? (
            <Image
              source={imageSourceForUrl(cover)}
              style={styles.cover}
              resizeMode="contain"
            />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Text style={styles.placeholderText}>No cover</Text>
            </View>
          )}
          <Text style={styles.title}>{meta.title}</Text>
          {meta.subtitle ? <Text style={styles.subTitle}>{meta.subtitle}</Text> : null}

          <View style={styles.metaRow}>
            {pageCount != null ? (
              <View style={styles.metaItem}>
                <Text style={styles.metaText}>{pageCount} Pages</Text>
              </View>
            ) : null}
            {favorites != null ? (
              <View style={styles.metaItem}>
                <Heart color={colors.textMuted} size={15} />
                <Text style={styles.metaText}>{favorites} Favs</Text>
              </View>
            ) : null}
            {uploadedAt ? (
              <View style={styles.metaItem}>
                <Clock color={colors.textMuted} size={15} />
                <Text style={styles.metaText}>
                  {new Date(uploadedAt).toLocaleDateString()}
                </Text>
              </View>
            ) : null}
          </View>

          {galleryCode ? (
            <Pressable
              onPress={copyGalleryCode}
              hitSlop={8}
              style={({ pressed }) => [
                styles.codeChip,
                copied && styles.codeChipCopied,
                pressed && styles.pressed,
              ]}
            >
              {copied ? (
                <Check color={colors.success} size={15} />
              ) : (
                <Copy color={accent} size={15} />
              )}
              <Text style={styles.codeText}>#{galleryCode}</Text>
              <Text
                style={[styles.codeHint, copied && { color: colors.success }]}
              >
                {copied ? "Copied" : "Copy code"}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.actionCol}>
          <View style={styles.actionRow}>
            <AddToLibraryButton
            provider={source.provider as ProviderId}
            providerMangaId={source.library(identity, meta).id}
            providerMangaAliases={source.library(identity, meta).aliases}
            title={meta.title}
            thumbnailUrl={cover}
            description={meta.description ?? null}
              variant="icon"
              accent={accent}
            />
            <GalleryDownloadButton
              candidate={downloadCandidate}
              context={downloadContext}
            />
            {shareAllowed ? (
              <Pressable
                onPress={() => void onShare()}
                accessibilityLabel="Share"
                style={({ pressed }) => [
                  styles.shareBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Share2 color={accent} size={18} />
              </Pressable>
            ) : null}
          </View>
          {shareNotice ? (
            <Text style={styles.shareNotice}>{shareNotice}</Text>
          ) : null}
          <Pressable
            onPress={() => void source.read(identity, meta)}
            style={({ pressed }) => [
              styles.readBtn,
              { backgroundColor: accent },
              pressed && styles.pressed,
            ]}
          >
            <Play color={colors.onAccent} size={22} fill={colors.onAccent} />
            <Text style={styles.readBtnText}>
              {atPage ? `Continue · page ${atPage}` : "Read Now"}
            </Text>
          </Pressable>
        </View>

        {meta.description ? (
          <View style={styles.descBox}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.descText}>{meta.description}</Text>
          </View>
        ) : null}

        {meta.tagSections?.map((section) =>
          section.tags.length ? (
            <View key={section.title} style={styles.tagGroup}>
              <Text style={styles.tagGroupTitle}>{section.title}</Text>
              <View style={styles.chipContainer}>
                {section.tags.map((tag) => (
                  <Pressable
                    key={tag.key}
                    style={styles.chip}
                    onPress={() => onTagPress(tag)}
                  >
                    <Text style={styles.chipText}>{tag.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null,
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  scrollContent: { paddingBottom: 40 },
  backBtn: { paddingHorizontal: 16, paddingTop: 4 },
  heroContainer: {
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 8,
  },
  cover: { width: 200, height: 300, borderRadius: radius.md, marginBottom: 16 },
  coverPlaceholder: {
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: colors.textFaint, fontSize: 12 },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 4,
  },
  subTitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 16,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { color: colors.textMuted, fontSize: 14 },
  codeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
    marginBottom: 18,
  },
  codeChipCopied: { borderColor: colors.success },
  codeText: { color: colors.text, fontSize: 16, fontWeight: "800", letterSpacing: 0.4 },
  codeHint: { color: colors.textFaint, fontSize: 13, fontWeight: "600" },
  actionCol: {
    paddingHorizontal: 20,
    marginBottom: 24,
    alignItems: "center",
    gap: 12,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  readBtn: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: radius.md,
    gap: 8,
  },
  readBtnText: { color: colors.onAccent, fontSize: 17, fontWeight: "800" },
  pressed: { opacity: 0.7 },
  shareBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
  },
  shareNotice: { color: colors.success, fontSize: 12, marginTop: 8, textAlign: "center" },
  descBox: { paddingHorizontal: 20, marginBottom: 16 },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "800", marginBottom: 8 },
  descText: { color: colors.textMuted, fontSize: 13.5, lineHeight: 21 },
  tagGroup: { marginBottom: 16, paddingHorizontal: 20 },
  tagGroupTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  chipContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.textMuted, fontSize: 13.5 },
  errorText: {
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
    fontSize: 15,
  },
});
