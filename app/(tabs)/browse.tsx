import { router, type Href } from "expo-router";
import {
  AlertTriangle,
  ArrowRightLeft,
  Blocks,
  Check,
  Download,
  FolderDown,
  Languages,
  Link2,
  Package,
  Pin,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X,
  ExternalLink,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Modal,
  Pressable,
  SectionList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";
import SourceTabs from "@/components/sources/SourceTabs";
import TermsModal from "@/components/extensions/TermsModal";
import { colors, radius } from "@/constants/theme";
import {
  downloadExtensionApk,
  extensionInstallPermission,
  installExtension,
  openExtensionInstallSettings,
  verifyExtensionApk,
} from "@/services/extensions/installer";
import {
  listMissingExtensionGroups,
  type MissingExtensionGroup,
} from "@/services/extensions/migration";
import {
  fetchExtensionRepo,
  loadExtensionCatalog,
  mergeCatalog,
  normalizeRepoUrl,
} from "@/services/extensions/repo";
import {
  cachedInstalledExtensions,
  refreshExtensionRegistry,
} from "@/services/extensions/registry";
import type {
  ExtensionCatalogEntry,
  ExtensionRepo,
  InstalledExtensionRecord,
} from "@/services/extensions/types";
import {
  getSettings,
  subscribeSettings,
  updateSettings,
  type AppSettings,
  type ExtensionRepoSetting,
} from "@/services/settings/settingsStore";

type TabKey = "sources" | "extensions" | "migrate";
type ContentFilter = "all" | "sfw" | "nsfw";
type StatusFilter = "all" | "installed" | "available";

const TABS = [
  { key: "sources", label: "Sources", icon: FolderDown },
  { key: "extensions", label: "Extensions", icon: Package },
  { key: "migrate", label: "Migrate", icon: ArrowRightLeft },
];

const CONTENT_OPTIONS: { key: ContentFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sfw", label: "Safe" },
  { key: "nsfw", label: "Mature" },
];

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "installed", label: "Installed" },
  { key: "available", label: "Available" },
];

function matchesQuery(query: string, ...values: (string | null | undefined)[]) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value?.toLowerCase().includes(needle));
}

function sourceLanguages(extension: ExtensionCatalogEntry): string[] {
  return Array.from(new Set(extension.sources.map((source) => source.language)));
}

type InstalledSource = InstalledExtensionRecord["sources"][number];
type SourceRow = { extension: InstalledExtensionRecord; source: InstalledSource };

function sourceLanguageLabel(lang: string): string {
  if (lang === "en") return "English";
  if (lang === "all" || lang === "multi") return "Multi";
  return lang.toUpperCase();
}

const SourceListRow = React.memo(function SourceListRow({
  source,
  extensionName,
  nsfw,
  pinned,
  onOpen,
  onTogglePin,
}: {
  source: InstalledSource;
  extensionName: string;
  nsfw: boolean;
  pinned: boolean;
  onOpen: (sourceId: string) => void;
  onTogglePin: (sourceId: string) => void;
}) {
  return (
    <Pressable
      onPress={() => onOpen(source.id)}
      style={({ pressed }) => [styles.sourceRow, pressed && styles.pressed]}
    >
      <View style={styles.sourceIcon}>
        <Text style={styles.sourceInitial}>
          {source.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{source.name}</Text>
        <Text style={styles.rowMeta}>
          {sourceLanguageLabel(source.lang)} {"\u00b7"} {extensionName}
        </Text>
      </View>
      {nsfw ? (
        <View style={styles.matureChip}>
          <Text style={styles.matureText}>18+</Text>
        </View>
      ) : null}
      <Pressable
        onPress={(event) => {
          event.stopPropagation();
          onTogglePin(source.id);
        }}
        hitSlop={10}
        accessibilityLabel={pinned ? "Unpin source" : "Pin source"}
        style={({ pressed }) => [styles.pinButton, pressed && styles.pressed]}
      >
        <Pin
          color={pinned ? colors.accent : colors.textFaint}
          fill={pinned ? colors.accent : "transparent"}
          size={18}
        />
      </Pressable>
    </Pressable>
  );
});

const ExtensionCatalogRow = React.memo(function ExtensionCatalogRow({
  item,
  record,
  label,
  busy,
  percent,
  onInstall,
}: {
  item: ExtensionCatalogEntry;
  record?: InstalledExtensionRecord;
  label: string;
  busy: boolean;
  percent: number;
  onInstall: (extension: ExtensionCatalogEntry) => void;
}) {
  const installedNow = label === "Installed";
  const nsfw =
    record?.nsfw || item.contentWarning?.toUpperCase().includes("NSFW");
  return (
    <View style={styles.extensionCard}>
      {item.resources.iconUrl ? (
        <Image
          source={{ uri: item.resources.iconUrl }}
          style={styles.extensionIcon}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.extensionIcon, styles.extensionIconEmpty]}>
          <Blocks color={colors.accent} size={22} />
        </View>
      )}
      <View style={styles.extensionBody}>
        <View style={styles.extensionTitleRow}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {item.name}
          </Text>
          {nsfw ? (
            <View style={styles.matureChip}>
              <Text style={styles.matureText}>18+</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          v{item.versionName || item.versionCode} {"\u00b7"} {item.sources.length} source
          {item.sources.length === 1 ? "" : "s"} {"\u00b7"}{" "}
          {sourceLanguages(item)
            .map((value) => value.toUpperCase())
            .join(", ")}
        </Text>
        <View style={styles.extensionFooter}>
          <View style={styles.extensionStatus}>
            {record?.error ? (
              <Text style={styles.errorText} numberOfLines={2}>
                {record.error}
              </Text>
            ) : (
              <Text style={styles.sourcePreview} numberOfLines={1}>
                {item.sources.map((source) => source.name).join(" \u00b7 ")}
              </Text>
            )}
          </View>
          <Pressable
            disabled={busy || installedNow}
            onPress={() => onInstall(item)}
            style={({ pressed }) => [
              styles.installButton,
              installedNow && styles.installedButton,
              busy && styles.busyButton,
              pressed && !installedNow && !busy && styles.pressed,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : installedNow ? (
              <Check color={colors.success} size={16} />
            ) : (
              <Download color={colors.onAccent} size={16} />
            )}
            <Text style={[styles.installLabel, installedNow && styles.installedLabel]}>
              {busy ? `${percent}%` : label}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

export default function BrowseScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tab, setTab] = useState<TabKey>("sources");
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<ExtensionRepo[]>([]);
  const [installed, setInstalled] = useState<InstalledExtensionRecord[]>([]);
  const [missing, setMissing] = useState<MissingExtensionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [repoOpen, setRepoOpen] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [repoBusy, setRepoBusy] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);
  const [content, setContent] = useState<ContentFilter>("all");
  const [language, setLanguage] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [pendingInstall, setPendingInstall] =
    useState<ExtensionCatalogEntry | null>(null);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [progressPackage, setProgressPackage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    let active = true;
    void getSettings().then((value) => {
      if (active) setSettings(value);
    });
    const unsubscribe = subscribeSettings((value) => setSettings(value));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const repoKey = useMemo(
    () => JSON.stringify(settings?.extensionRepos ?? []),
    [settings?.extensionRepos],
  );



  const load = useCallback(async () => {
    if (!settings) return;
    setBanner(null);
    let installedList: InstalledExtensionRecord[] = [];
    try {
      installedList = await listInstalledExtensionsSafe();
      setInstalled(installedList);
      setLoading(false);
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Refresh failed.");
      setLoading(false);
    }
    setCatalogLoading(true);
    try {
      const catalog = await loadExtensionCatalog(settings.extensionRepos);
      setRepos(catalog.repos);
      if (catalog.errors.length > 0) {
        setBanner(
          `Could not refresh ${catalog.errors.length} repository${
            catalog.errors.length === 1 ? "" : "s"
          }. Showing cached data where available.`,
        );
      }
      setMissing(await listMissingExtensionGroups());
    } catch (error) {
      setBanner(error instanceof Error ? error.message : "Refresh failed.");
    } finally {
      setCatalogLoading(false);
    }
  }, [settings, repoKey]);

  useEffect(() => {
    if (!settings) return;
    void load();
  }, [repoKey, settings?.extensionRepos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      void (async () => {
        await refreshExtensionRegistry(true);
        const nextInstalled = await listInstalledExtensionsSafe();
        setInstalled(nextInstalled);
        setMissing(await listMissingExtensionGroups());
        if (permissionOpen && (await extensionInstallPermission())) {
          setPermissionOpen(false);
          if (pendingInstall) await beginInstall(pendingInstall);
        }
      })();
    });
    return () => subscription.remove();
  }, [permissionOpen, pendingInstall]);

  const catalog = useMemo(() => mergeCatalog(repos), [repos]);
  const installedByPackage = useMemo(() => {
    const map = new Map<string, InstalledExtensionRecord>();
    installed.forEach((extension) => map.set(extension.packageName, extension));
    return map;
  }, [installed]);

  const languages = useMemo(() => {
    const values = new Set<string>();
    catalog.forEach((extension) =>
      extension.sources.forEach((source) => values.add(source.language)),
    );
    installed.forEach((extension) =>
      extension.sources.forEach((source) => values.add(source.lang)),
    );
    return Array.from(values).sort();
  }, [catalog, installed]);

  const sourceRows = useMemo(
    () =>
      installed
        .flatMap((extension) =>
          extension.sources.map((source) => ({ extension, source })),
        )
        .filter(({ extension, source }) => {
          if (content === "sfw" && extension.nsfw) return false;
          if (content === "nsfw" && !extension.nsfw) return false;
          if (language !== "all" && source.lang !== language) return false;
          return matchesQuery(query, source.name, source.lang, extension.name);
        })
        .sort((a, b) => a.source.name.localeCompare(b.source.name)),
    [installed, content, language, query],
  );

  const pinnedIds = useMemo(
    () => new Set(settings?.pinnedSourceIds ?? []),
    [settings?.pinnedSourceIds],
  );
  const lastUsedAt = settings?.sourceLastUsedAt ?? {};
  const sourceSections = useMemo(() => {
    const byName = (a: SourceRow, b: SourceRow) =>
      a.source.name.localeCompare(b.source.name);
    const pinned = sourceRows
      .filter((row) => pinnedIds.has(row.source.id))
      .sort(byName);
    const unpinned = sourceRows.filter((row) => !pinnedIds.has(row.source.id));
    const recentlyUsed = unpinned
      .filter((row) => Boolean(lastUsedAt[row.source.id]))
      .sort(
        (a, b) =>
          (lastUsedAt[b.source.id] ?? 0) - (lastUsedAt[a.source.id] ?? 0) ||
          byName(a, b),
      );
    const english = unpinned
      .filter((row) => row.source.lang === "en")
      .sort(byName);
    const multi = unpinned
      .filter((row) => row.source.lang === "all" || row.source.lang === "multi")
      .sort(byName);
    const other = unpinned
      .filter(
        (row) =>
          row.source.lang !== "en" &&
          row.source.lang !== "all" &&
          row.source.lang !== "multi",
      )
      .sort(byName);
    return [
      { title: "Pinned", data: pinned },
      { title: "Last used", data: recentlyUsed },
      { title: "English", data: english },
      { title: "Multi", data: multi },
      { title: "Other", data: other },
    ].filter((section) => section.data.length > 0);
  }, [lastUsedAt, pinnedIds, sourceRows]);

  const extensionRows = useMemo(
    () =>
      catalog.filter((extension) => {
        const isInstalled = installedByPackage.has(extension.packageName);
        if (status === "installed" && !isInstalled) return false;
        if (status === "available" && isInstalled) return false;
        const nsfw =
          extension.contentWarning?.toUpperCase().includes("NSFW") ?? false;
        if (content === "sfw" && nsfw) return false;
        if (content === "nsfw" && !nsfw) return false;
        if (
          language !== "all" &&
          !extension.sources.some((source) => source.language === language)
        ) {
          return false;
        }
        return matchesQuery(
          query,
          extension.name,
          extension.packageName,
          ...extension.sources.map((source) => source.name),
        );
      }),
    [catalog, installedByPackage, status, content, language, query],
  );

  const migrateRows = useMemo(() => {
    return missing
      .map((group) => ({
        ...group,
        extension:
          catalog.find((entry) =>
            entry.sources.some((source) => source.id === group.sourceId),
          ) ?? null,
      }))
      .filter((group) =>
        matchesQuery(
          query,
          group.sourceId,
          group.extension?.name,
          ...group.records.map((record) => record.title),
        ),
      );
  }, [missing, catalog, query]);

  const installRef = useRef<(extension: ExtensionCatalogEntry) => Promise<void>>(
    async () => {},
  );
  const handleInstall = useCallback((extension: ExtensionCatalogEntry) => {
    void installRef.current(extension);
  }, []);
  const handleOpenSource = useCallback(
    (sourceId: string) => {
      const current = settings?.sourceLastUsedAt ?? {};
      void updateSettings({
        sourceLastUsedAt: { ...current, [sourceId]: Date.now() },
      }).catch(console.error);
      router.push(`/extensions/source/${encodeURIComponent(sourceId)}` as Href);
    },
    [settings?.sourceLastUsedAt],
  );
  const handleTogglePin = useCallback(
    (sourceId: string) => {
      const current = new Set(settings?.pinnedSourceIds ?? []);
      if (current.has(sourceId)) current.delete(sourceId);
      else current.add(sourceId);
      void updateSettings({ pinnedSourceIds: [...current] }).catch(console.error);
    },
    [settings?.pinnedSourceIds],
  );

  async function beginInstall(extension: ExtensionCatalogEntry) {
    setPendingInstall(extension);
    const allowed = await extensionInstallPermission();
    if (!allowed) {
      setPermissionOpen(true);
      return;
    }
    if (!settings?.extensionTermsAcceptedAt) {
      setTermsOpen(true);
      return;
    }
    await performInstall(extension);
  }

  async function performInstall(extension: ExtensionCatalogEntry) {
    setTermsOpen(false);
    setPermissionOpen(false);
    setBanner(null);
    setProgressPackage(extension.packageName);
    setProgressPercent(0);
    try {
      const file = await downloadExtensionApk(extension, (progress) => {
        if (progress.total > 0) {
          setProgressPercent(
            Math.min(100, Math.round((progress.written / progress.total) * 100)),
          );
        }
      });
      await verifyExtensionApk(file, extension);
      await installExtension(file);
      setBanner(
        `Installer opened for ${extension.name}. Confirm it, then return here.`,
      );
      setPendingInstall(null);
    } catch (error) {
      setBanner(
        error instanceof Error ? error.message : "Extension install failed.",
      );
    } finally {
      setProgressPackage(null);
      setProgressPercent(0);
    }
  }

  async function acceptTerms() {
    await updateSettings({ extensionTermsAcceptedAt: Date.now() });
    const target = pendingInstall;
    setTermsOpen(false);
    if (target) await performInstall(target);
  }

  async function addRepository() {
    const url = repoInput.trim();
    if (!url || !settings) return;
    setRepoBusy(true);
    setRepoError(null);
    try {
      const repo = await fetchExtensionRepo(url);
      const canonical = normalizeRepoUrl(url);
      if (
        settings.extensionRepos.some(
          (entry) => normalizeRepoUrl(entry.url) === canonical,
        )
      ) {
        throw new Error("This repository is already added.");
      }
      const next: ExtensionRepoSetting[] = [
        ...settings.extensionRepos,
        { url, name: repo.name, addedAt: Date.now() },
      ];
      await updateSettings({ extensionRepos: next });
      setRepoInput("");
      setRepoOpen(false);
      setRepos((current) => [...current.filter((item) => item.url !== repo.url), repo]);
      setBanner(`Added ${repo.name}.`);
    } catch (error) {
      setRepoError(error instanceof Error ? error.message : "Could not load repository.");
    } finally {
      setRepoBusy(false);
    }
  }

  async function removeRepository(url: string) {
    if (!settings) return;
    await updateSettings({
      extensionRepos: settings.extensionRepos.filter((entry) => entry.url !== url),
    });
  }

  installRef.current = beginInstall;

  const installedVersion = (extension: ExtensionCatalogEntry) => {
    const record = installedByPackage.get(extension.packageName);
    if (!record) return null;
    return Number(record.versionCode);
  };

  const installLabel = (extension: ExtensionCatalogEntry) => {
    const version = installedVersion(extension);
    if (version == null) return "Download";
    if (version >= Number(extension.versionCode)) return "Installed";
    return "Update";
  };

  const renderInstallButton = (extension: ExtensionCatalogEntry) => {
    const label = installLabel(extension);
    const busy = progressPackage === extension.packageName;
    const installedNow = label === "Installed";
    return (
      <Pressable
        disabled={busy || installedNow}
        onPress={() => void beginInstall(extension)}
        style={({ pressed }) => [
          styles.installButton,
          installedNow && styles.installedButton,
          busy && styles.busyButton,
          pressed && !installedNow && !busy && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.onAccent} size="small" />
        ) : installedNow ? (
          <Check color={colors.success} size={16} />
        ) : (
          <Download color={colors.onAccent} size={16} />
        )}
        <Text style={[styles.installLabel, installedNow && styles.installedLabel]}>
          {busy ? `${progressPercent}%` : label}
        </Text>
      </Pressable>
    );
  };

  const headerActions = [
    {
      key: "filter",
      icon: SlidersHorizontal,
      active: content !== "all" || language !== "all" || status !== "all",
      onPress: () => setFilterOpen(true),
    },
    { key: "refresh", icon: RefreshCw, onPress: () => void load() },
    {
      key: "repo",
      icon: Plus,
      onPress: () => {
        setRepoError(null);
        setRepoOpen(true);
      },
    },
  ];
  if (loading) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <AppHeader
          title="Browse"
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder="Search sources and extensions"
          actions={headerActions}
        />
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.mutedText}>Loading repositories...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <AppHeader
        title="Browse"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={
          tab === "sources"
            ? "Search installed sources"
            : tab === "extensions"
              ? "Search extensions"
              : "Search missing manga"
        }
        actions={headerActions}
      />

      <SourceTabs
        tabs={TABS.map((item) => ({
          key: item.key,
          label:
            item.key === "sources"
              ? sourceRows.length
                ? `Sources \u00b7 ${sourceRows.length}`
                : "Sources"
              : item.key === "extensions"
                ? catalog.length
                  ? `Extensions \u00b7 ${catalog.length}`
                  : "Extensions"
                : migrateRows.length
                  ? `Migrate \u00b7 ${migrateRows.length}`
                  : "Migrate",
          icon: item.icon,
        }))}
        activeKey={tab}
        onSelect={(key) => setTab(key as TabKey)}
      />

      {banner ? (
        <View style={styles.banner}>
          <AlertTriangle color={colors.gold} size={16} />
          <Text style={styles.bannerText}>{banner}</Text>
          <Pressable onPress={() => setBanner(null)} hitSlop={8}>
            <X color={colors.textFaint} size={16} />
          </Pressable>
        </View>
      ) : null}

      {(settings?.extensionRepos.length ?? 0) === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyContent}>
          <RepoIntro onAdd={() => setRepoOpen(true)} />
        </ScrollView>
      ) : tab === "sources" ? (
        <SectionList
          sections={sourceSections}
          keyExtractor={(item) => `${item.extension.packageName}:${item.source.id}`}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={40}
          windowSize={9}
          removeClippedSubviews
          stickySectionHeadersEnabled={false}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <SourceListRow
              source={item.source}
              extensionName={item.extension.name}
              nsfw={item.extension.nsfw}
              pinned={pinnedIds.has(item.source.id)}
              onOpen={handleOpenSource}
              onTogglePin={handleTogglePin}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No active sources"
              body={
                installed.length === 0
                  ? "Install an extension from the Extensions tab. Sources appear here once the package is active."
                  : "No installed source matches this search and filter."
              }
              action="Open Extensions"
              onAction={() => setTab("extensions")}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : tab === "extensions" ? (
        <FlatList
          data={extensionRows}
          keyExtractor={(item) => item.packageName}
          contentContainerStyle={styles.listContent}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={40}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => (
            <ExtensionCatalogRow
              item={item}
              record={installedByPackage.get(item.packageName)}
              label={installLabel(item)}
              busy={progressPackage === item.packageName}
              percent={progressPercent}
              onInstall={handleInstall}
            />
          )}
          ListEmptyComponent={
            catalogLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={colors.accent} />
                <Text style={styles.mutedText}>Loading repository catalog...</Text>
              </View>
            ) : (
              <EmptyState
                title="No extensions found"
                body={
                  catalog.length === 0
                    ? "Add a repository, then refresh to browse its extensions."
                    : "No extension matches this search and filter."
                }
                action={catalog.length === 0 ? "Add repository" : undefined}
                onAction={catalog.length === 0 ? () => setRepoOpen(true) : undefined}
              />
            )
          }
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={migrateRows}
          keyExtractor={(item) => item.sourceId}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.migrateCard}>
              <View style={styles.migrateHead}>
                <View style={styles.migrateIcon}>
                  <ArrowRightLeft color={colors.gold} size={18} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.extension?.name ?? `Source ${item.sourceId.slice(-6)}`}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {item.records.length} record
                    {item.records.length === 1 ? "" : "s"} waiting for this source
                  </Text>
                </View>
              </View>
              <View style={styles.recordList}>
                {item.records.slice(0, 3).map((record) => (
                  <Text
                    key={`${record.provider}:${record.providerMangaId}`}
                    style={styles.recordTitle}
                    numberOfLines={1}
                  >
                    {record.title}
                  </Text>
                ))}
                {item.records.length > 3 ? (
                  <Text style={styles.rowMeta}>+{item.records.length - 3} more</Text>
                ) : null}
              </View>
              {item.extension ? (
                renderInstallButton(item.extension)
              ) : (
                <Text style={styles.mutedText}>
                  Add the repository that publishes this source to restore it.
                </Text>
              )}
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              title="Nothing to migrate"
              body="Every catalog or reading record that belongs to an extension still has its source installed."
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
      <Modal
        visible={repoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setRepoOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setRepoOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Repositories</Text>
              <Pressable onPress={() => setRepoOpen(false)} hitSlop={8}>
                <X color={colors.textMuted} size={20} />
              </Pressable>
            </View>
            <Text style={styles.sheetBody}>
              Paste a repository URL of extension provider . 
            </Text>
            <View style={styles.inputRow}>
              <Link2 color={colors.textFaint} size={17} />
              <TextInput
                value={repoInput}
                onChangeText={setRepoInput}
                placeholder="https://github.com/owner/repo/blob/repo/index.json"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
              />
            </View>
            {repoError ? <Text style={styles.errorText}>{repoError}</Text> : null}
            <Pressable
              onPress={() => void addRepository()}
              disabled={repoBusy || !repoInput.trim()}
              style={({ pressed }) => [
                styles.primaryButton,
                (repoBusy || !repoInput.trim()) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {repoBusy ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Plus color={colors.onAccent} size={17} />
              )}
              <Text style={styles.primaryLabel}>Add repository</Text>
            </Pressable>

            <ScrollView style={styles.repoList} showsVerticalScrollIndicator={false}>
              {(settings?.extensionRepos ?? []).map((repo) => (
                <View key={repo.url} style={styles.repoRow}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {repo.name}
                    </Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
                      {repo.url}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => void removeRepository(repo.url)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.trashButton, pressed && styles.pressed]}
                  >
                    <Trash2 color={colors.danger} size={17} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={filterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setFilterOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Filter {tab}</Text>
              <Pressable onPress={() => setFilterOpen(false)} hitSlop={8}>
                <X color={colors.textMuted} size={20} />
              </Pressable>
            </View>

            <Text style={styles.filterLabel}>Content</Text>
            <View style={styles.chipRow}>
              {CONTENT_OPTIONS.map((option) => (
                <FilterChip
                  key={option.key}
                  label={option.label}
                  selected={content === option.key}
                  onPress={() => setContent(option.key)}
                />
              ))}
            </View>

            <Text style={styles.filterLabel}>Language</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.chipRow}>
                <FilterChip
                  label="All"
                  selected={language === "all"}
                  onPress={() => setLanguage("all")}
                />
                {languages.map((value) => (
                  <FilterChip
                    key={value}
                    label={value.toUpperCase()}
                    selected={language === value}
                    onPress={() => setLanguage(value)}
                  />
                ))}
              </View>
            </ScrollView>

            {tab === "extensions" ? (
              <>
                <Text style={styles.filterLabel}>Install state</Text>
                <View style={styles.chipRow}>
                  {STATUS_OPTIONS.map((option) => (
                    <FilterChip
                      key={option.key}
                      label={option.label}
                      selected={status === option.key}
                      onPress={() => setStatus(option.key)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <Pressable
              onPress={() => {
                setContent("all");
                setLanguage("all");
                setStatus("all");
                setFilterOpen(false);
              }}
              style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}
            >
              <Text style={styles.resetLabel}>Reset filters</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={permissionOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setPermissionOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => setPermissionOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Allow extension installs</Text>
            <Text style={styles.sheetBody}>
              Android needs permission to install packages from Mangora. Open
              the system setting, enable it, then come back and confirm.
            </Text>
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => setPermissionOpen(false)}
                style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
              >
                <Text style={styles.secondaryLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void openExtensionInstallSettings()}
                style={({ pressed }) => [styles.primaryButtonCompact, pressed && styles.pressed]}
              >
                <Text style={styles.primaryLabel}>Open settings</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <TermsModal
        visible={termsOpen}
        extensionName={pendingInstall?.name ?? "this extension"}
        onCancel={() => {
          setTermsOpen(false);
          setPendingInstall(null);
        }}
        onAccept={() => void acceptTerms()}
      />
    </SafeAreaView>
  );
}

async function listInstalledExtensionsSafe(): Promise<InstalledExtensionRecord[]> {
  try {
    const { listInstalledExtensions } = await import("@/services/extensions/native");
    return await listInstalledExtensions();
  } catch {
    return cachedInstalledExtensions();
  }
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        selected && styles.filterChipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.filterChipText, selected && styles.filterChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function RepoIntro({ onAdd }: { onAdd: () => void }) {
  return (
    <View style={styles.introCard}>
      <View style={styles.introIcon}>
        <Link2 color={colors.accent} size={26} />
      </View>
      <Text style={styles.introTitle}>Add a source repository</Text>
      <Text style={styles.introBody}>
        Mangora is a reader and translator. Paste the repository link of 
        extesion provider you want to use; its extensions will appear in the 
        Extensions tab after you install them.
      </Text>
      <Pressable
        onPress={onAdd}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
      >
        <Plus color={colors.onAccent} size={17} />
        <Text style={styles.primaryLabel}>Add repository</Text>
      </Pressable>
      <Pressable 
      
        onPress={() => Linking.openURL('https://t.me/MangoraApp/31')}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
      >
        <Text style={styles.primaryLabel}>Read the guide</Text>
        <ExternalLink size={15} color={colors.onAccent} />
      </Pressable>
      <Text style={styles.hintText}>
        Example: a GitHub index.json link. Nothing is preloaded.
      </Text>
    </View>
  );
}

function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Languages color={colors.textFaint} size={22} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryLabel}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  mutedText: { color: colors.textFaint, fontSize: 13, lineHeight: 19 },
  listContent: { padding: 14, paddingBottom: 110, gap: 10 },
  emptyContent: { padding: 20, paddingTop: 32 },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 14,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.goldSoft,
  },
  bannerText: { color: colors.gold, fontSize: 12, flex: 1, lineHeight: 17 },

  sectionHeader: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3,
    marginTop: 10,
    marginBottom: 2,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sourceIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceInitial: { color: colors.accent, fontSize: 19, fontWeight: "800" },
  pinButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  rowMeta: { color: colors.textFaint, fontSize: 12, marginTop: 4 },
  matureChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: colors.dangerSoft,
  },
  matureText: { color: colors.danger, fontSize: 10, fontWeight: "800" },

  extensionCard: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  extensionIcon: {
    width: 50,
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHigh,
  },
  extensionIconEmpty: { alignItems: "center", justifyContent: "center" },
  extensionBody: { flex: 1, minWidth: 0 },
  extensionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  extensionFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  extensionStatus: { flex: 1, minWidth: 0 },
  sourcePreview: { color: colors.textMuted, fontSize: 12 },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 16 },

  installButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    minWidth: 104,
    justifyContent: "center",
  },
  busyButton: { backgroundColor: colors.accentSoft },
  installedButton: { backgroundColor: colors.surfaceHigh, minWidth: 104 },
  installLabel: { color: colors.onAccent, fontSize: 12, fontWeight: "800" },
  installedLabel: { color: colors.success },

  migrateCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 12,
  },
  migrateHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  migrateIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  recordList: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 10,
    gap: 5,
  },
  recordTitle: { color: colors.textMuted, fontSize: 12 },

  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingBottom: 34,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  sheetBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  sheetActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 20 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginTop: 16,
  },
  input: { flex: 1, color: colors.text, fontSize: 13, paddingVertical: 12 },
  primaryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.full,
    marginTop: 14,
  },
  primaryButtonCompact: {
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.full,
  },
  primaryLabel: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
  secondaryButton: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },

  repoList: { maxHeight: 240, marginTop: 14 },
  repoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  trashButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.dangerSoft,
  },

  filterLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 14,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  filterChipSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  filterChipText: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  filterChipTextSelected: { color: colors.accent, fontWeight: "800" },
  resetButton: { alignSelf: "flex-start", marginTop: 20 },
  resetLabel: { color: colors.accent, fontSize: 13, fontWeight: "700" },

  introCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 22,
    alignItems: "center",
  },
  introIcon: {
    width: 58,
    height: 58,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  introTitle: {
    color: colors.text,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 14,
    textAlign: "center",
  },
  introBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
  hintText: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 12,
    textAlign: "center",
  },
  emptyState: { alignItems: "center", paddingVertical: 52, paddingHorizontal: 20 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 6,
    maxWidth: 330,
  },
});
