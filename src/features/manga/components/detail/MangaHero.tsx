import { BookOpen, ChevronDown, ChevronUp, Rocket, Share2 } from "lucide-react-native";
import React, { useState } from "react";
import {
  Image,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AddToLibraryButton } from "@features/library";
import type {
  ChapterMeta,
  ChapterSourceModule,
  ChapterSortField,
  LanguageOption,
  SharedTag,
  SortDirection,
  ViewerChapterRow,
} from "@shared/contracts";
import type { ProviderId } from "@core/catalog";
import { colors, radius } from "@shared/theme";
import { useAppSettings } from "@features/settings";
import { canShareProvider, shareMangaLink } from "@shared/links/mangaLinks";
import { isMatureProvider } from "@features/extensions";
import { imageSourceForUrl } from "@shared/net/imageHeaders";
import BottomFade from "./BottomFade";
import TagChip from "./TagChip";
import { extremeChapter, sortHint } from "../../domain/chapterGroups";
import { emptyLibrary } from "../../domain/mangaLibrary";

const DESCRIPTION_COLLAPSED_LINES = 4;

export interface MangaHeroProps {
  source: ChapterSourceModule;
  identity: string;
  param: string;
  meta: ChapterMeta;
  thumbnailUrl?: string | null;
  accent: string;
  languages?: LanguageOption[];
  language: string;
  setLanguage: (language: string) => void;
  totalRowCount: number;
  listData: ViewerChapterRow[];
  openChapter: (row: ViewerChapterRow) => void | Promise<void>;
  searchQuery: string;
  isNumericQuery: boolean;
  filteredGroupCount: number;
  sortField: ChapterSortField;
  sortDir: SortDirection;
  notice?: string | null;
  onTagPress: (
    tag: SharedTag,
    x: number,
    y: number,
    width: number,
    height: number,
  ) => void;
}

export default function MangaHero({
  source,
  identity,
  param,
  meta,
  thumbnailUrl,
  accent,
  languages,
  language,
  setLanguage,
  totalRowCount,
  listData,
  openChapter,
  searchQuery,
  isNumericQuery,
  filteredGroupCount,
  sortField,
  sortDir,
  notice,
  onTagPress,
}: MangaHeroProps) {
  const { settings } = useAppSettings();
  const [heroHeight, setHeroHeight] = useState(0);
  const [descExpanded, setDescExpanded] = useState(false);
  const [descLines, setDescLines] = useState(0);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const cover = meta.coverUrl || thumbnailUrl;
  const description = meta.description?.trim();
  const onShare = async () => {
    const result = await shareMangaLink({
      provider: source.provider,
      param,
      title: meta.title,
    });
    if (result === "copied") {
      setShareNotice("Link copied to clipboard");
    } else if (result === "shared") {
      setShareNotice(null);
    }
  };

  const shareAllowed = canShareProvider(
    source.provider,
    settings?.ageRestrictedSources ?? false,
    isMatureProvider,
  );

  return (
    <View>
      <View
        style={styles.heroWrap}
        onLayout={(event) => setHeroHeight(event.nativeEvent.layout.height)}
      >
        {cover ? (
          <Image
            source={imageSourceForUrl(cover)}
            blurRadius={22}
            resizeMode="cover"
            style={[
              StyleSheet.absoluteFill,
              styles.coverBackdrop,
              { height: heroHeight || 420 },
            ]}
          />
        ) : null}

        <View style={styles.heroRow}>
          {cover ? (
            <Image
              source={imageSourceForUrl(cover)}
              style={styles.cover}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.cover, styles.coverPlaceholder]}>
              <Text style={styles.placeholderText}>No cover</Text>
            </View>
          )}

          <View style={styles.metaCol}>
            <Text style={styles.mangaTitle}>{meta.title}</Text>
            {meta.subtitle ? (
              <Text style={styles.subtitleText} numberOfLines={2}>
                {meta.subtitle}
              </Text>
            ) : null}

            {meta.extraMeta?.map((line, index) => {
              const Icon = line.icon;
              return (
                <View key={index} style={styles.metaRow}>
                  <Icon color={colors.textMuted} size={15} />
                  <Text style={styles.metaText} numberOfLines={2}>
                    {line.text}
                  </Text>
                </View>
              );
            })}

            {meta.chips?.length ? (
              <View style={styles.metaChips}>
                {meta.chips.map((chip) => (
                  <View key={chip} style={styles.chip}>
                    <Text style={styles.chipText}>{chip}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.favRow}>
              <AddToLibraryButton
                provider={source.provider as ProviderId}
                providerMangaId={
                  emptyLibrary(source, identity, meta).providerMangaId
                }
                providerMangaAliases={
                  emptyLibrary(source, identity, meta).providerMangaAliases
                }
                title={meta.title}
                thumbnailUrl={cover}
                description={meta.description ?? null}
                variant="icon"
                accent={accent}
              />
              <Text style={styles.favLabel}>Library</Text>
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
            {shareNotice ?? notice ? (
              <Text style={styles.shareNotice}>{shareNotice ?? notice}</Text>
            ) : null}
          </View>
        </View>

        {totalRowCount > 0 ? (
          <View style={styles.actionRow}>
            <Pressable
              disabled={listData.length === 0}
              onPress={() => {
                const oldest = extremeChapter(listData, false);
                if (oldest) void openChapter(oldest);
              }}
              style={({ pressed }) => [
                styles.readBtn,
                { backgroundColor: accent },
                pressed && styles.pressed,
              ]}
            >
              <BookOpen color={colors.onAccent} size={17} />
              <Text style={styles.readBtnText}>Read from start</Text>
            </Pressable>
            <Pressable
              disabled={listData.length === 0}
              onPress={() => {
                const newest = extremeChapter(listData, true);
                if (newest) void openChapter(newest);
              }}
              style={({ pressed }) => [
                styles.latestBtn,
                { borderColor: accent },
                pressed && styles.pressed,
              ]}
            >
              <Rocket color={accent} size={17} />
              <Text style={[styles.latestBtnText, { color: accent }]}>
                Latest
              </Text>
            </Pressable>
          </View>
        ) : null}

        {description ? (
          <View style={styles.descBox}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Synopsis</Text>
              {descLines > DESCRIPTION_COLLAPSED_LINES ? (
                <Pressable
                  onPress={() => {
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut,
                    );
                    setDescExpanded((prev) => !prev);
                  }}
                  hitSlop={8}
                  style={styles.descToggle}
                >
                  <Text style={styles.descToggleText}>
                    {descExpanded ? "Less" : "More"}
                  </Text>
                  {descExpanded ? (
                    <ChevronUp color={accent} size={16} />
                  ) : (
                    <ChevronDown color={accent} size={16} />
                  )}
                </Pressable>
              ) : null}
            </View>
            <View>
              <Text
                style={styles.synopsis}
                selectable
                numberOfLines={
                  descExpanded || descLines === 0
                    ? undefined
                    : DESCRIPTION_COLLAPSED_LINES
                }
                onTextLayout={(event) => {
                  const count = event.nativeEvent.lines.length;
                  if (descExpanded || descLines === 0) {
                    if (count !== descLines) setDescLines(count);
                  }
                }}
              >
                {description}
              </Text>
              {!descExpanded && descLines > DESCRIPTION_COLLAPSED_LINES ? (
                <BottomFade height={28} />
              ) : null}
            </View>
          </View>
        ) : null}

        {meta.tags?.length ? (
          <View style={styles.tagsBox}>
            <Text style={styles.sectionTitle}>Tags</Text>
            {descExpanded ? (
              <View style={styles.tagWrap}>
                {meta.tags.map((tag) => (
                  <TagChip
                    key={tag.key}
                    tag={tag}
                    onPress={(bounds) =>
                      onTagPress(tag, bounds.x, bounds.y, bounds.width, bounds.height)
                    }
                  />
                ))}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tagScrollContent}
              >
                {meta.tags.map((tag) => (
                  <TagChip
                    key={tag.key}
                    tag={tag}
                    onPress={(bounds) =>
                      onTagPress(tag, bounds.x, bounds.y, bounds.width, bounds.height)
                    }
                  />
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>

      {languages?.length ? (
        <View style={styles.langRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.langScrollContent}
          >
            <Pressable
              onPress={() => setLanguage("all")}
              style={[
                styles.langChip,
                language === "all" && styles.langChipActive,
              ]}
            >
              <Text
                style={[
                  styles.langChipText,
                  language === "all" && styles.langChipTextActive,
                ]}
              >
                All
              </Text>
            </Pressable>
            {languages?.map((option) => {
              const selected = language === option.code;
              return (
                <Pressable
                  key={option.code}
                  onPress={() => setLanguage(option.code)}
                  style={[styles.langChip, selected && styles.langChipActive]}
                >
                  <Text
                    style={[
                      styles.langChipText,
                      selected && styles.langChipTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.chapterHeadingRow}>
        <Text style={styles.chapterHeading}>Chapters</Text>
        {totalRowCount > 0 ? (
          <View style={[styles.chapterCount, { borderColor: accent }]}>
            <Text style={[styles.chapterCountText, { color: accent }]}>
              {totalRowCount}
              {searchQuery.trim() && !isNumericQuery
                ? ` / ${filteredGroupCount}`
                : ""}
            </Text>
          </View>
        ) : null}
        <Text style={styles.orderHint}>
          {searchQuery.trim() && isNumericQuery
            ? "Type an index, press enter"
            : sortHint(sortField, sortDir)}
        </Text>
      </View>


    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  chapterCount: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 2,
    backgroundColor: colors.accentSoft,
  },
  chapterCountText: { fontSize: 13, fontWeight: "800" },
  chapterHeading: { color: colors.text, fontSize: 20, fontWeight: "800" },
  chapterHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.textMuted, fontSize: 11.5 },
  cover: { width: 128, height: 190, borderRadius: radius.md },
  coverBackdrop: { opacity: 0.12, backgroundColor: colors.surface },
  coverPlaceholder: {
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  descBox: { paddingHorizontal: 16, paddingTop: 18 },
  descToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  descToggleText: {
    color: colors.textFaint,
    fontSize: 12.5,
    fontWeight: "700",
  },
  favLabel: { color: colors.textFaint, fontSize: 13, fontWeight: "600" },
  favRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  heroRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 14,
  },
  heroWrap: { overflow: "hidden", paddingBottom: 6 },
  langChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  langChipActive: {
    borderColor: colors.accentSoft,
    backgroundColor: colors.accentSoft,
  },
  langChipText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "600" },
  langChipTextActive: { color: colors.text, fontWeight: "800" },
  langRow: { paddingTop: 16 },
  langScrollContent: { gap: 8, paddingHorizontal: 16 },
  latestBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: colors.accentSoft,
  },
  latestBtnText: { fontSize: 14.5, fontWeight: "800" },
  mangaTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
    marginBottom: 4,
  },
  metaChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  metaCol: { flex: 1, paddingTop: 2 },
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    marginBottom: 6,
  },
  metaText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
  },
  orderHint: { color: colors.textFaint, fontSize: 11, marginLeft: "auto" },
  placeholderText: { color: colors.textFaint, fontSize: 12 },
  pressed: { opacity: 0.7 },
  readBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.full,
    paddingVertical: 12,
  },
  readBtnText: { color: colors.onAccent, fontSize: 14.5, fontWeight: "800" },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
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
  shareNotice: { color: colors.success, fontSize: 12, marginTop: 6 },
  subtitleText: { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
  synopsis: { color: colors.textMuted, fontSize: 13.5, lineHeight: 21 },
  tagScrollContent: { gap: 8, paddingRight: 16, paddingBottom: 4 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagsBox: { paddingHorizontal: 16, paddingTop: 18 },
});
