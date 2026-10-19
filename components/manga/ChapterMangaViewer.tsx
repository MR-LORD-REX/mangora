import { router, useFocusEffect } from "expo-router";
import {
  ArrowLeft,
  ArrowUp,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ListFilter,
  Languages,
  Rocket,
  RotateCcw,
  Search,
  Share2,
  X,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import AddToLibraryButton from "@/components/library/AddToLibraryButton";
import MenuSheet from "@/components/common/MenuSheet";
import ChapterFilterOverlay from "@/components/manga/ChapterFilterOverlay";
import {
  ChapterDownloadButton,
  SeriesDownloadButton,
} from "@/components/downloader/DownloadButtons";
import { candidateFromRow, candidatesFromRows } from "@/components/downloader/candidates";
import { requestChapterDownload } from "@/components/downloader/actions";
import PretranslateDialog from "@/components/translation/PretranslateDialog";
import {
  loadOfflineChapterViewer,
  offlineRowDownload,
  openDownloadedReader,
} from "@/services/downloader";
import { useDownloadStatuses } from "@/components/downloader/useDownloads";
import {
  formatChapterDate,
  normalizeForMatch,
} from "@/components/manga/dateFormat";
import type { ChapterSourceModule } from "@/components/manga/sources/module";
import type { DownloadCandidate } from "@/services/downloader";
import type {
  ChapterMeta,
  ChapterSortField,
  ChapterViewerData,
  LibraryMangaInput,
  ProgressMap,
  SharedTag,
  SortDirection,
  ViewerChapterRow,
} from "@/components/manga/types";
import { colors, radius } from "@/constants/theme";
import type { ProviderId } from "@/services/db/repositories/catalogRepository";
import { getTrackedChapterProgress } from "@/services/library/librarySync";
import {
  persistChapterReadState,
  type ChapterReadWriteInput,
} from "@/services/library/readerTracking";
import { imageSourceForUrl } from "@/utils/reader/imageHeaders";
import { useAppSettings } from "@/components/settings/useAppSettings";
import {
  canShareProvider,
  shareMangaLink,
} from "@/services/deeplink";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DESCRIPTION_COLLAPSED_LINES = 4;

function emptyLibrary(
  source: ChapterSourceModule,
  identity: string,
  meta: ChapterMeta,
): LibraryMangaInput {
  const lib = source.library(identity, meta);
  return {
    provider: source.provider,
    providerMangaId: lib.id,
    providerMangaAliases: lib.aliases,
    title: meta.title,
    thumbnailUrl: meta.coverUrl ?? null,
    description: meta.description ?? null,
  };
}

export interface ChapterMangaViewerProps {
  /** Raw route param for this manga (per-provider encoding). */
  param: string;
  thumbnailUrl?: string | null;
  source: ChapterSourceModule;
  /** Offline mode: load from the download database only, no network. */
  downloadsOnly?: boolean;
}

export default function ChapterMangaViewer({
  param,
  thumbnailUrl,
  source,
  downloadsOnly = false,
}: ChapterMangaViewerProps) {
  const accent = source.accent;
  const identity = useMemo(() => source.decodeIdentity(param), [param, source]);
  const { settings } = useAppSettings();

  const [data, setData] = useState<ChapterViewerData | null>(null);
  const [language, setLanguage] = useState<string>("all");
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [descExpanded, setDescExpanded] = useState(false);
  const [descLines, setDescLines] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [showRead, setShowRead] = useState(true);
  const [showUnread, setShowUnread] = useState(true);
  const [sortField, setSortField] = useState<ChapterSortField>("number");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  /** null = every scanlation group is shown. */
  const [selectedGroups, setSelectedGroups] = useState<string[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFab, setShowFab] = useState(false);
  const [heroHeight, setHeroHeight] = useState(0);
  const [menuRow, setMenuRow] = useState<ViewerChapterRow | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [updatingRead, setUpdatingRead] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [pretranslateCandidate, setPretranslateCandidate] =
    useState<DownloadCandidate | null>(null);

  const listRef = useRef<FlatList<ViewerChapterRow>>(null);
  const searchInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    if (downloadsOnly) {
      // Opened from the Downloads library: database only, never the network,
      // and only the chapters that actually have a downloaded file.
      const offline = await loadOfflineChapterViewer(
        source.provider,
        identity,
      ).catch(() => null);
      if (offline) {
        setData(offline);
      } else {
        setData(null);
        setLoadError("Nothing downloaded for this series yet.");
      }
      setLoading(false);
      return;
    }
    try {
      const next = await source.load(identity, {
        language: language === "all" ? undefined : language,
        thumbnailUrl,
      });
      setData(next);
    } catch (error) {
      console.error(`Failed to load ${source.label} manga:`, error);
      // Network-first, database second: show the downloaded chapters so a
      // saved series stays readable with no connection.
      const offline = await loadOfflineChapterViewer(
        source.provider,
        identity,
      ).catch(() => null);
      if (offline) {
        setData(offline);
        setLoadError(null);
      } else {
        setLoadError(
          error instanceof Error ? error.message : "Could not load this manga.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [downloadsOnly, identity, language, source, thumbnailUrl]);

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

  const meta = data?.meta ?? null;
  const rows = useMemo(() => data?.rows ?? [], [data]);

  /** One entry per "main chapter": explicit sections or rows that share a
   *  chapter key/number (duplicate scanlation-group uploads). */
  const rawGroups = useMemo(() => groupRows(rows), [rows]);

  /** Scanlation groups available in this series (drives the Groups tab). */
  const availableGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.kind === "chapter" && row.scanGroup) {
        counts.set(row.scanGroup, (counts.get(row.scanGroup) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [rows]);

  // Default is "all groups"; reset the allow-list whenever the loaded rows
  // change (new data load or language chip).
  useEffect(() => {
    setSelectedGroups(null);
  }, [rows]);

  /** Main chapters that survive the Groups tab selection. */
  const groupFilteredGroups = useMemo(() => {
    if (!selectedGroups) return rawGroups;
    const allowed = new Set(selectedGroups);
    return rawGroups
      .map((group) => ({
        ...group,
        rows: group.rows.filter(
          (row) => row.scanGroup != null && allowed.has(row.scanGroup),
        ),
      }))
      .filter((group) => group.rows.length > 0);
  }, [rawGroups, selectedGroups]);

  /** Distinct chapter count (duplicate group uploads collapse into one). */
  const totalRowCount = rawGroups.length;

  /** Main chapters that have at least one finished upload. */
  const readCount = useMemo(() => {
    let count = 0;
    for (const group of rawGroups) {
      const done = group.rows.some(
        (row) => progress[row.progressKey ?? ""]?.status === "completed",
      );
      if (done) count += 1;
    }
    return count;
  }, [progress, rawGroups]);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    if (y > 300 && !showFab) setShowFab(true);
    else if (y <= 300 && showFab) setShowFab(false);
  };

  const scrollToTop = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  const toggleRead = () => {
    if (showRead && !showUnread) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowRead((prev) => !prev);
  };

  const toggleUnread = () => {
    if (showUnread && !showRead) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowUnread((prev) => !prev);
  };

  const pickSort = (field: ChapterSortField, dir: SortDirection) => {
    setSortField(field);
    setSortDir(dir);
  };

  const resetFilters = () => {
    setShowRead(true);
    setShowUnread(true);
    setSelectedGroups(null);
    setSortField("number");
    setSortDir("desc");
  };

  const toggleGroup = (name: string) => {
    setSelectedGroups((current) => {
      const all = new Set(availableGroups.map((group) => group.name));
      const next = current ? new Set(current) : new Set(all);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      if (next.size === all.size) return null;
      return Array.from(next);
    });
  };

  const onScrollToIndexFailed = (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => {
    setTimeout(() => {
      listRef.current?.scrollToIndex({
        index: info.index,
        animated: true,
        viewPosition: 0,
      });
    }, 350);
  };

  const openChapter = async (row: ViewerChapterRow) => {
    Keyboard.dismiss();
    if (!meta) return;
    const downloaded = offlineRowDownload(row);
    if (downloaded) {
      await openDownloadedReader(downloaded);
      return;
    }
    await source.openChapter(row, {
      identity,
      meta,
      coverUrl: meta.coverUrl ?? thumbnailUrl,
    });
  };

  const submitSearch = () => {
    Keyboard.dismiss();
    const trimmed = searchQuery.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed.replace(",", "."));
    if (Number.isNaN(parsed) || !/^\d+([.,]\d+)?$/.test(trimmed)) return;
    const groups = searchFilteredGroups;
    if (!groups.length) return;

    let targetIndex = groups.findIndex((group) => groupNumber(group) === parsed);
    if (targetIndex === -1) {
      const numbered = groups
        .map((group, index) => ({ group, index }))
        .filter((entry) => groupNumber(entry.group) != null);
      if (!numbered.length) return;
      const wanted = Math.max(
        0,
        Math.min(numbered.length - 1, Math.floor(parsed) - 1),
      );
      targetIndex = numbered[wanted].index;
    }

    let flatIndex = 0;
    for (let index = 0; index < groups.length; index += 1) {
      if (index === targetIndex) break;
      const group = groups[index];
      if (visibleGroupLabel(group) && (group.label || group.rows.length > 1)) {
        flatIndex += 1;
      }
      flatIndex += group.rows.length;
    }
    if (flatIndex >= listData.length) return;
    listRef.current?.scrollToIndex({
      index: flatIndex,
      animated: true,
      viewPosition: 0,
    });
  };

  const isNumericQuery = /^\d+([.,]\d+)?$/.test(searchQuery.trim());
  const displayedGroups = useMemo(() => {
    let groups = groupFilteredGroups;
    const showAll = showRead && showUnread;
    if (!showAll) {
      groups = groups
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) =>
            showRead
              ? progress[row.progressKey ?? ""]?.status === "completed"
              : progress[row.progressKey ?? ""]?.status !== "completed",
          ),
        }))
        .filter((group) => group.rows.length > 0);
    }
    return sortGroups(groups, sortField, sortDir);
  }, [groupFilteredGroups, progress, showRead, showUnread, sortDir, sortField]);

  const searchFilteredGroups = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || isNumericQuery) return displayedGroups;
    const needle = normalizeForMatch(trimmed);
    return displayedGroups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => {
          const haystack = normalizeForMatch(
            `${row.title} ${row.subtitle ?? ""} ${row.scanGroup ?? ""} ${row.sectionLabel ?? ""}`,
          );
          return haystack.includes(needle);
        }),
      }))
      .filter((group) => group.rows.length > 0);
  }, [displayedGroups, isNumericQuery, searchQuery]);

  const listData = useMemo<ViewerChapterRow[]>(
    () => flattenGroups(searchFilteredGroups),
    [searchFilteredGroups],
  );

  /** Every chapter in display order: the source for the download picker. */
  const downloadRows = useMemo(() => flattenGroups(rawGroups), [rawGroups]);
  const downloadCandidates = useMemo(
    () => candidatesFromRows(source, identity, downloadRows),
    [downloadRows, identity, source],
  );
  const downloadByRowKey = useMemo(() => {
    const map = new Map<string, DownloadCandidate>();
    for (const row of downloadRows) {
      const candidate = candidateFromRow(source, identity, row);
      if (candidate) map.set(row.key, candidate);
    }
    return map;
  }, [downloadRows, identity, source]);
  const downloadContext = useMemo(
    () => ({
      mangaTitle: meta?.title ?? source.label,
      thumbnailUrl: meta?.coverUrl ?? thumbnailUrl ?? null,
    }),
    [meta?.coverUrl, meta?.title, source.label, thumbnailUrl],
  );
  const downloadChapterIds = useMemo(
    () => downloadCandidates.map((candidate) => candidate.target.chapterId),
    [downloadCandidates],
  );
  const downloadStatuses = useDownloadStatuses(downloadChapterIds);

  const statusText = (row: ViewerChapterRow) => {
    if (row.kind !== "chapter") return null;
    const item = progress[row.progressKey ?? ""];
    if (!item) return null;
    if (item.status === "completed")
      return { label: "Read", done: true as const };
    if (item.status === "reading") {
      return {
        label: `at page ${item.lastPageIndex + 1}`,
        done: false as const,
      };
    }
    return null;
  };

  const onTagPress = (tag: SharedTag) => {
    source.openTag?.(tag);
  };

  const rowDate = (row: ViewerChapterRow) =>
    row.date != null ? formatChapterDate(row.date) : (row.dateLabel ?? null);

  const buildWriteItems = useCallback(
    (targetRows: ViewerChapterRow[]): ChapterReadWriteInput[] => {
      if (!meta) return [];
      const lib = emptyLibrary(source, identity, meta);
      const cover = meta.coverUrl ?? thumbnailUrl;
      const items: ChapterReadWriteInput[] = [];
      for (const row of targetRows) {
        if (row.kind !== "chapter") continue;
        const identityData = source.chapterWriteIdentity?.(row);
        if (!identityData) continue;
        items.push({
          provider: source.provider as ProviderId,
          providerMangaId: lib.providerMangaId,
          mangaTitle: meta.title,
          thumbnailUrl: cover,
          providerChapterId: identityData.providerChapterId,
          chapterTitle: row.title,
          chapterNumber: identityData.chapterNumber ?? null,
          scanlationGroup: identityData.scanlationGroup ?? null,
          chapterGroupKey: identityData.chapterGroupKey ?? null,
          languageCode: identityData.languageCode ?? null,
        });
      }
      return items;
    },
    [identity, meta, source, thumbnailUrl],
  );

  const applyReadState = useCallback(
    async (targetRows: ViewerChapterRow[], completed: boolean) => {
      const items = buildWriteItems(targetRows);
      if (!items.length) return;
      setUpdatingRead(true);
      try {
        await persistChapterReadState(items, completed);
        refreshProgress();
      } catch (error) {
        console.error("Failed to update chapter read state:", error);
      } finally {
        setUpdatingRead(false);
      }
    },
    [buildWriteItems, refreshProgress],
  );

  const onLongPressChapter = (row: ViewerChapterRow) => {
    if (row.kind !== "chapter") return;
    setMenuRow(row);
    setMenuVisible(true);
  };

  const menuOptions = useMemo(() => {
    if (!menuRow) return [];
    const item = menuRow.progressKey
      ? progress[menuRow.progressKey]
      : undefined;
    const completed = item?.status === "completed";
    return [
      completed
        ? {
            key: "mark-unread",
            label: "Mark as unread",
            icon: RotateCcw,
            onPress: () => void applyReadState([menuRow], false),
          }
        : {
            key: "mark-read",
            label: "Mark as read",
            icon: Check,
            onPress: () => void applyReadState([menuRow], true),
          },
      {
        key: "mark-all-read",
        label: "Mark all chapters as read",
        icon: CheckCheck,
        onPress: () => void applyReadState(rows, true),
      },
    ];
  }, [applyReadState, menuRow, progress, rows]);

  const renderLoading = () => (
    <SafeAreaView style={[styles.safeArea, styles.center]}>
      <ActivityIndicator color={accent} size="large" />
    </SafeAreaView>
  );

  if (loading && !data) return renderLoading();

  if (!meta) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <ArrowLeft color={colors.text} size={24} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {source.label}
          </Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>
            {loadError ?? "Could not load this manga."}
          </Text>
          <Pressable
            onPress={() => void load()}
            style={[styles.primaryBtn, { backgroundColor: accent }]}
          >
            <Text style={styles.primaryBtnText}>Retry</Text>
          </Pressable>
          {source.openSite ? (
            <Pressable
              onPress={() =>
                source.openSite?.(identity, { title: source.label })
              }
              style={styles.secondaryBtn}
            >
              <ExternalLink color={accent} size={16} />
              <Text style={[styles.secondaryBtnText, { color: accent }]}>
                Open on site
              </Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

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
  );

  const listHeader = (
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
            {shareNotice ? (
              <Text style={styles.shareNotice}>{shareNotice}</Text>
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
                    onPress={() => onTagPress(tag)}
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
                    onPress={() => onTagPress(tag)}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        ) : null}
      </View>

      {data?.languages?.length ? (
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
            {data.languages.map((option) => {
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
                ? ` / ${searchFilteredGroups.length}`
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

  const renderRow = ({ item: row }: { item: ViewerChapterRow }) => {
    if (row.kind === "section") {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{row.sectionLabel}</Text>
        </View>
      );
    }

    const status = statusText(row);
    const completed = status?.done === true;
    const reading = Boolean(status && !status.done);
    const date = rowDate(row);
    const downloadCandidate = downloadByRowKey.get(row.key) ?? null;
    const downloadStatus = downloadCandidate
      ? downloadStatuses[downloadCandidate.target.chapterId]
      : undefined;

    return (
      <Pressable
        onPress={() => {
          if (updatingRead) return;
          void openChapter(row);
        }}
        onLongPress={() => onLongPressChapter(row)}
        delayLongPress={400}
        style={({ pressed }) => [
          styles.chapterRow,
          row.nested && styles.chapterRowNested,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.chapterTop}>
          <View style={styles.chapterNameWrap}>
            <Text
              numberOfLines={1}
              style={[
                styles.chapterName,
                row.nested && styles.chapterNameNested,
                (completed || reading) && styles.chapterNameRead,
              ]}
            >
              {row.title}
            </Text>
            {row.subtitle ? (
              <Text
                style={[
                  styles.groupName,
                  row.nested && { color: accent },
                ]}
              >
                {row.subtitle}
              </Text>
            ) : null}
            {date ? <Text style={styles.rowDate}>{date}</Text> : null}
          </View>
          <View style={styles.chapterRight}>
            {reading && status ? (
              <Text style={[styles.pageLabel, { color: accent }]}>
                {status.label}
              </Text>
            ) : completed ? (
              <View style={styles.readChip}>
                <Check color={colors.success} size={13} />
                <Text style={styles.readLabel}>Read</Text>
              </View>
            ) : null}
            {downloadCandidate ? (
              <View style={styles.chapterDownloadGroup}>
                <Pressable
                  onPress={(event) => {
                    event.stopPropagation();
                    console.log("[manga][pretranslate] button pressed", {
                      chapterId: downloadCandidate.target.chapterId,
                    });
                    setPretranslateCandidate(downloadCandidate);
                  }}
                  hitSlop={8}
                  style={styles.pretranslateBtn}
                  accessibilityLabel="Pre-translate chapter"
                >
                  <Languages color={accent} size={18} />
                </Pressable>
                <ChapterDownloadButton
                  candidate={downloadCandidate}
                  context={downloadContext}
                  status={downloadStatus}
                  accent={accent}
                />
              </View>
            ) : null}
            {row.pageCount != null ? (
              <Text style={styles.pageCountLabel}>{row.pageCount} pages</Text>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  };
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <ArrowLeft color={colors.text} size={24} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {meta.title}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {downloadCandidates.length > 0 ? (
              <SeriesDownloadButton
                candidates={downloadCandidates}
                context={downloadContext}
                accent={accent}
              />
            ) : null}
            {searchOpen ? (
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="Number = jump · text = filter"
                placeholderTextColor={colors.textFaint}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={submitSearch}
                returnKeyType="search"
                autoFocus
              />
            ) : null}
            <Pressable
              onPress={() => {
                const next = !searchOpen;
                setSearchOpen(next);
                setSearchQuery("");
                if (next) {
                  setTimeout(() => searchInputRef.current?.focus(), 60);
                }
              }}
              hitSlop={8}
              style={styles.iconBtn}
            >
              {searchOpen ? (
                <X color={colors.textMuted} size={20} />
              ) : (
                <Search color={colors.textMuted} size={20} />
              )}
            </Pressable>
            <Pressable
              onPress={() => setOverlayVisible(true)}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <ListFilter color={accent} size={20} />
            </Pressable>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={listData}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyBox}>
                <Text style={styles.errorText}>
                  {searchQuery.trim() && !isNumericQuery
                    ? "No chapters match your search."
                    : (loadError ??
                      "No chapters available for this series yet.")}
                </Text>
                {loadError ? (
                  <Pressable
                    onPress={() => void load()}
                    style={[styles.primaryBtn, { backgroundColor: accent }]}
                  >
                    <Text style={styles.primaryBtnText}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
          initialNumToRender={Math.min(listData.length || 1, 100)}
          maxToRenderPerBatch={80}
          windowSize={15}
          onScrollToIndexFailed={onScrollToIndexFailed}
          onScroll={handleScroll}
          scrollEventThrottle={32}
        />

        {showFab ? (
          <Pressable
            onPress={scrollToTop}
            style={[styles.fab, { backgroundColor: accent }]}
          >
            <ArrowUp color={colors.onAccent} size={22} strokeWidth={3} />
          </Pressable>
        ) : null}
      </View>

      <MenuSheet
        visible={menuVisible}
        title={menuRow?.title ?? "Chapter"}
        options={menuOptions}
        onClose={() => setMenuVisible(false)}
      />

      <ChapterFilterOverlay
        visible={overlayVisible}
        showRead={showRead}
        showUnread={showUnread}
        readCount={readCount}
        unreadCount={totalRowCount - readCount}
        sortField={sortField}
        sortDir={sortDir}
        groups={availableGroups}
        selectedGroups={selectedGroups}
        accent={accent}
        onClose={() => setOverlayVisible(false)}
        onToggleRead={toggleRead}
        onToggleUnread={toggleUnread}
        onPickSort={pickSort}
        onToggleGroup={toggleGroup}
        onSelectAllGroups={() => setSelectedGroups(null)}
        onReset={resetFilters}
      />
      <PretranslateDialog
        visible={pretranslateCandidate != null}
        candidate={pretranslateCandidate}
        mangaTitle={meta.title}
        chapterLanguage={pretranslateCandidate?.languageCode ?? null}
        onClose={() => setPretranslateCandidate(null)}
        onDownload={(candidate) => {
          console.log("[manga][pretranslate] download requested", {
            chapterId: candidate.target.chapterId,
          });
          void requestChapterDownload(candidate, downloadContext);
        }}
      />
    </SafeAreaView>
  );
}

interface ChapterGroup {
  key: string;
  label?: string;
  rows: ViewerChapterRow[];
}

/** Key used to merge duplicate uploads into one "main chapter". */
function chapterGroupKeyOf(row: ViewerChapterRow): string | null {
  if (row.sectionKey) return row.sectionKey;
  if (row.number != null) return String(row.number);
  return row.groupKey ?? null;
}

/** Group rows into main chapters (one per chapter number / explicit section). */
function groupRows(rows: ViewerChapterRow[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  const byKey = new Map<string, ChapterGroup>();
  for (const row of rows) {
    if (row.kind === "section") {
      const key = row.sectionKey ?? row.key;
      let group = byKey.get(key);
      if (!group) {
        group = { key, label: row.sectionLabel ?? row.title, rows: [] };
        byKey.set(key, group);
        groups.push(group);
      } else if (!group.label) {
        group.label = row.sectionLabel ?? row.title;
      }
      continue;
    }
    const key = chapterGroupKeyOf(row) ?? row.key;
    let group = byKey.get(key);
    if (!group) {
      group = { key, rows: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

/** "Chapter 45" style label for a group that has no explicit section label. */
function visibleGroupLabel(group: ChapterGroup): string | undefined {
  if (group.label) return group.label;
  const key = group.key ?? "";
  if (/^\d+(\.\d+)?$/.test(key)) return `Chapter ${key}`;
  return undefined;
}

/** Flattens groups into the row list; duplicate uploads nest under a header. */
function flattenGroups(groups: ChapterGroup[]): ViewerChapterRow[] {
  const out: ViewerChapterRow[] = [];
  for (const group of groups) {
    const label = visibleGroupLabel(group);
    const showHeader = Boolean(
      label && (group.label || group.rows.length > 1),
    );
    if (showHeader && label) {
      out.push({
        key: `section:${group.key}`,
        kind: "section",
        sectionKey: group.key,
        sectionLabel: label,
        title: label,
      });
      for (const row of group.rows) out.push({ ...row, nested: true });
    } else {
      for (const row of group.rows) out.push({ ...row, nested: false });
    }
  }
  return out;
}

function groupNumber(group: ChapterGroup): number | null {
  const raw = group.label ?? group.key ?? "";
  const labelParsed = parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isNaN(labelParsed)) return labelParsed;
  let best: number | null = null;
  for (const row of group.rows) {
    if (row.number != null && (best == null || row.number > best))
      best = row.number;
  }
  return best;
}

function sortGroups(
  groups: ChapterGroup[],
  field: ChapterSortField,
  dir: SortDirection,
): typeof groups {
  const multiplier = dir === "asc" ? 1 : -1;
  const out = [...groups];
  const indexOf = new Map(out.map((group, index) => [group.key, index]));
  out.sort((a, b) => {
    let cmp = 0;
    if (field === "number") {
      const an = groupNumber(a);
      const bn = groupNumber(b);
      if (an == null && bn == null) cmp = 0;
      else if (an == null) cmp = 1;
      else if (bn == null) cmp = -1;
      else cmp = (an - bn) * multiplier;
    } else if (field === "date") {
      const ad = maxDate(a.rows);
      const bd = maxDate(b.rows);
      if (ad == null && bd == null) cmp = 0;
      else if (ad == null) cmp = 1;
      else if (bd == null) cmp = -1;
      else cmp = (ad - bd) * multiplier;
    } else {
      const aa = (a.label ?? a.rows[0]?.title ?? "").toLocaleLowerCase();
      const bb = (b.label ?? b.rows[0]?.title ?? "").toLocaleLowerCase();
      cmp = aa < bb ? -1 : aa > bb ? 1 : 0;
      if (cmp !== 0) cmp *= multiplier;
    }
    if (cmp === 0) {
      const ia = indexOf.get(a.key) ?? 0;
      const ib = indexOf.get(b.key) ?? 0;
      cmp = ia - ib;
    }
    return cmp;
  });
  return out;
}

function extremeChapter(
  rows: ViewerChapterRow[],
  newest: boolean,
): ViewerChapterRow | null {
  let best: ViewerChapterRow | null = null;
  let bestNumber = newest ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.kind !== "chapter" || row.number == null) continue;
    if (newest ? row.number > bestNumber : row.number < bestNumber) {
      bestNumber = row.number;
      best = row;
    }
  }
  if (best) return best;
  let fallback: ViewerChapterRow | null = null;
  for (const row of rows) {
    if (row.kind !== "chapter") continue;
    fallback = row;
    if (!newest) return row;
  }
  return fallback;
}

function maxDate(rows: ViewerChapterRow[]): number | null {
  let best: number | null = null;
  for (const row of rows) {
    if (row.date != null && (best == null || row.date > best)) best = row.date;
  }
  return best;
}

function sortHint(field: ChapterSortField, dir: SortDirection): string {
  if (field === "alpha") return dir === "asc" ? "A-Z first" : "Z-A first";
  if (field === "date") return dir === "asc" ? "Oldest first" : "Newest first";
  return "Newest first";
}

function TagChip({ tag, onPress }: { tag: SharedTag; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tagChip, pressed && styles.pressed]}
    >
      <Text style={styles.tagChipText}>{tag.label}</Text>
    </Pressable>
  );
}

function BottomFade({ height }: { height: number }) {
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        { height, top: undefined, bottom: 0 },
      ]}
    >
      <Svg width="100%" height={height}>
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={height} fill="url(#fade)" />
      </Svg>
    </View>
  );
}
const styles = StyleSheet.create({
  chapterDownloadGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  pretranslateBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  list: { flex: 1 },
  listContent: { paddingBottom: 44 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  searchInput: {
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    width: 172,
    fontSize: 12.5,
  },
  heroWrap: { overflow: "hidden", paddingBottom: 6 },
  coverBackdrop: { opacity: 0.12, backgroundColor: colors.surface },
  heroRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 14,
  },
  cover: { width: 128, height: 190, borderRadius: radius.md },
  coverPlaceholder: {
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: colors.textFaint, fontSize: 12 },
  metaCol: { flex: 1, paddingTop: 2 },
  mangaTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
    marginBottom: 4,
  },
  subtitleText: { color: colors.textMuted, fontSize: 13, marginBottom: 8 },
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
  metaChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
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
  favRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 },
  favLabel: { color: colors.textFaint, fontSize: 13, fontWeight: "600" },
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
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
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
  pressed: { opacity: 0.7 },
  descBox: { paddingHorizontal: 16, paddingTop: 18 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
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
  synopsis: { color: colors.textMuted, fontSize: 13.5, lineHeight: 21 },
  tagsBox: { paddingHorizontal: 16, paddingTop: 18 },
  tagScrollContent: { gap: 8, paddingRight: 16, paddingBottom: 4 },
  tagWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  tagChipText: { color: colors.textMuted, fontSize: 12.5 },
  langRow: { paddingTop: 16 },
  langScrollContent: { gap: 8, paddingHorizontal: 16 },
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
  chapterHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  chapterHeading: { color: colors.text, fontSize: 20, fontWeight: "800" },
  chapterCount: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 2,
    backgroundColor: colors.accentSoft,
  },
  chapterCountText: { fontSize: 13, fontWeight: "800" },
  orderHint: { color: colors.textFaint, fontSize: 11, marginLeft: "auto" },
  warnBox: {
    marginHorizontal: 16,
    marginBottom: 6,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  warnText: { color: colors.danger, fontSize: 12.5, lineHeight: 18 },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 2,
  },
  sectionHeaderText: { color: colors.text, fontSize: 17, fontWeight: "800" },
  chapterRow: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 12,
    paddingVertical: 11,
    marginHorizontal: 16,
    marginBottom: 2,
  },
  chapterTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  chapterNameWrap: { flex: 1, gap: 2 },
  chapterName: { color: colors.text, fontSize: 15, fontWeight: "600" },
  chapterNameNested: { fontSize: 13.5 },
  chapterNameRead: { color: colors.textFaint, fontWeight: "500" },
  groupName: { color: colors.textFaint, fontSize: 12 },
  chapterRowNested: {
    marginLeft: 24,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.border,
  },
  rowDate: { color: colors.textFaint, fontSize: 11.5, marginTop: 2 },
  chapterRight: { alignItems: "flex-end", gap: 3 },
  pageLabel: { fontSize: 12, fontWeight: "700" },
  readChip: { flexDirection: "row", alignItems: "center", gap: 4 },
  readLabel: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },
  pageCountLabel: { color: colors.textFaint, fontSize: 11 },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  errorText: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  primaryBtn: {
    marginTop: 18,
    paddingHorizontal: 26,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  primaryBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderColor: colors.border,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: "700" },
  fab: {
    position: "absolute",
    right: 18,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
