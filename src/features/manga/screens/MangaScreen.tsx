import { router } from "expo-router";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ExternalLink,
  RotateCcw,
} from "lucide-react-native";
import { setStringAsync } from "expo-clipboard";
import MangaHero from "../components/detail/MangaHero";
import { MangaDetailSkeleton } from "../components/loading";
import { useMangaData } from "../hooks/useMangaData";
import { useChapterFilters } from "../hooks/useChapterFilters";
import { useDownloadSelection } from "../hooks/useDownloadSelection";
import React, {
  useCallback,
  useMemo,
} from "react";
import {
  Alert,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  persistChapterReadState,
  prepareReaderOpen,
  type ChapterReadWriteInput,
} from "@features/library";
import MenuSheet from "@shared/ui/overlays/MenuSheet";
import ChapterFilterOverlay from "../components/chapters/ChapterFilterOverlay";
import ChapterRow from "../components/chapters/ChapterRow";
import MangaChapterList from "../components/chapters/MangaChapterList";
import TagPopover from "../components/detail/TagPopover";
import {
  offlineRowDownload,
  offlineReaderTarget,
  requestChapterDownload,
} from "@features/downloads";
import { READER_LANGUAGE_OPTIONS } from "../components/chapters/languageOptions";
import { PretranslateDialog } from "@features/translation";
import { emptyLibrary } from "../domain/mangaLibrary";
import {
  groupNumber,
  visibleGroupLabel,
} from "../domain/chapterGroups";
import type {
  ChapterSourceModule,
  ChapterSortField,
  SharedTag,
  SortDirection,
  ViewerChapterRow,
} from "@shared/contracts";
import { colors, radius } from "@shared/theme";
import type { ProviderId } from "@core/catalog";
import { chapterSourceFor } from "../sources";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function UnknownSourceScreen() {
  return (
    <SafeAreaView style={[styles.safeArea, styles.center]}>
      <Text style={styles.errorText}>Unknown manga source.</Text>
      <Pressable onPress={() => router.back()} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>Go back</Text>
      </Pressable>
    </SafeAreaView>
  );
}

export interface MangaScreenProps {
  /** Raw route param for this manga (per-provider encoding). */
  param: string;
  provider: string;
  thumbnailUrl?: string | null;
  /** Offline mode: load from the download database only, no network. */
  downloadsOnly?: boolean;
}

interface ResolvedMangaScreenProps {
  param: string;
  source: ChapterSourceModule;
  thumbnailUrl?: string | null;
  downloadsOnly?: boolean;
}

export default function MangaScreen({
  param,
  provider,
  thumbnailUrl,
  downloadsOnly = false,
}: MangaScreenProps) {
  const source = chapterSourceFor(provider);
  if (!source) return <UnknownSourceScreen />;
  return (
    <ResolvedMangaScreen
      param={param}
      source={source}
      thumbnailUrl={thumbnailUrl}
      downloadsOnly={downloadsOnly}
    />
  );
}

function ResolvedMangaScreen({
  param,
  source,
  thumbnailUrl,
  downloadsOnly = false,
}: ResolvedMangaScreenProps) {
  const accent = source.accent;
  const {
    identity,
    data,
    language,
    setLanguage,
    progress,
    loading,
    loadError,
    meta,
    rows,
    load,
    refreshProgress,
    overlayVisible,
    setOverlayVisible,
    showRead,
    setShowRead,
    showUnread,
    setShowUnread,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    selectedGroups,
    setSelectedGroups,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    showFab,
    setShowFab,
    menuRow,
    setMenuRow,
    menuVisible,
    setMenuVisible,
    updatingRead,
    setUpdatingRead,
    tagPopover,
    setTagPopover,
    tagNotice,
    setTagNotice,
    pretranslateCandidate,
    setPretranslateCandidate,
    listRef,
    searchInputRef,
  } = useMangaData({
    param,
    source,
    thumbnailUrl,
    downloadsOnly,
  });

const {
    rawGroups,
    availableGroups,
    totalRowCount,
    readCount,
    isNumericQuery,
    searchFilteredGroups,
    listData,
  } = useChapterFilters({
    rows,
    progress,
    selectedGroups,
    setSelectedGroups,
    showRead,
    showUnread,
    sortField,
    sortDir,
    searchQuery,
  });

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
      const target = offlineReaderTarget(downloaded);
      await prepareReaderOpen(target);
      router.push({
        pathname: "/reader/[id]",
        params: {
          id: target.readerParams.id,
          source: target.provider,
          mangaId: target.readerParams.mangaId,
          title: target.chapterTitle,
          mangaTitle: target.mangaTitle,
          chapterTitle: target.chapterTitle,
          ...(target.thumbnailUrl ? { thumbnailUrl: target.thumbnailUrl } : {}),
        },
      });
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

  const {
    downloadCandidates,
    downloadByRowKey,
    downloadContext,
    downloadStatuses,
  } = useDownloadSelection({
    source,
    identity,
    meta,
    thumbnailUrl,
    rawGroups,
  });

  const openTagPopover = (tag: SharedTag, x: number, y: number, width: number, height: number) => {
    setTagPopover({ tag, x, y, width, height });
  };

  const copyTag = async () => {
    if (!tagPopover) return;
    const tag = tagPopover.tag;
    setTagPopover(null);
    try {
      await setStringAsync(tag.label);
      setTagNotice("Tag copied to clipboard");
    } catch (error) {
      Alert.alert(
        "Couldn't copy tag",
        error instanceof Error ? error.message : "Could not access the clipboard.",
      );
    }
  };

  const searchTag = () => {
    if (!tagPopover) return;
    const query = tagPopover.tag.label;
    setTagPopover(null);
    router.push({
      pathname: "/(tabs)/browse",
      params: { tab: "extensions", query },
    });
  };

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
    [buildWriteItems, refreshProgress, setUpdatingRead],
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

  if (loading && !data) {
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
        <MangaDetailSkeleton />
      </SafeAreaView>
    );
  }

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

  const listHeader = (
    <MangaHero
      source={source}
      identity={identity}
      param={param}
      meta={meta}
      thumbnailUrl={thumbnailUrl}
      accent={accent}
      languages={data?.languages}
      language={language}
      setLanguage={setLanguage}
      totalRowCount={totalRowCount}
      listData={listData}
      openChapter={openChapter}
      searchQuery={searchQuery}
      isNumericQuery={isNumericQuery}
      filteredGroupCount={searchFilteredGroups.length}
      sortField={sortField}
      sortDir={sortDir}
      notice={tagNotice}
      onTagPress={openTagPopover}
    />
  );

  const renderRow = ({ item: row }: { item: ViewerChapterRow }) => (
    <ChapterRow
      row={row}
      accent={accent}
      progress={progress}
      updatingRead={updatingRead}
      openChapter={openChapter}
      onLongPress={onLongPressChapter}
      downloadByRowKey={downloadByRowKey}
      downloadStatuses={downloadStatuses}
      downloadContext={downloadContext}
      onPretranslate={setPretranslateCandidate}
    />
  );

return (
    <SafeAreaView style={styles.safeArea}>
            <MangaChapterList
        meta={meta}
        accent={accent}
        downloadCandidates={downloadCandidates}
        downloadContext={downloadContext}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        submitSearch={submitSearch}
        searchInputRef={searchInputRef}
        setOverlayVisible={setOverlayVisible}
        listRef={listRef}
        listData={listData}
        renderRow={renderRow}
        listHeader={listHeader}
        loading={loading}
        loadError={loadError}
        isNumericQuery={isNumericQuery}
        load={load}
        handleScroll={handleScroll}
        onScrollToIndexFailed={onScrollToIndexFailed}
        showFab={showFab}
        scrollToTop={scrollToTop}
      />

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
        sourceLanguages={READER_LANGUAGE_OPTIONS}
        onClose={() => setPretranslateCandidate(null)}
        onDownload={(candidate) => {
          void requestChapterDownload(candidate, downloadContext);
        }}
      />
      <TagPopover
        anchor={tagPopover}
        onClose={() => setTagPopover(null)}
        onCopy={() => void copyTag()}
        onSearch={searchTag}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
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
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
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
});
