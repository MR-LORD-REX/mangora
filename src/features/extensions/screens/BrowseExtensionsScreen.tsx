import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  Download,
  FolderDown,
  Link2,
  Package,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppHeader from "@shared/ui/layout/AppHeader";
import ChipTabBar from "@shared/ui/navigation/ChipTabBar";
import FilterChip from "@shared/ui/navigation/FilterChip";
import { colors } from "@shared/theme";

import EmptyState from "../components/browse/EmptyState";
import BrowseSkeleton from "../components/browse/BrowseSkeleton";
import { ExtensionCatalogRow } from "../components/browse/ExtensionCatalogRow";
import RepoIntro from "../components/browse/RepoIntro";
import { SourceListRow } from "../components/browse/SourceListRow";
import { browseStyles as styles } from "../components/browse/BrowseStyles";
import {
  buildExtensionRows,
  buildInstalledByPackage,
  buildMigrateRows,
  buildSourceRows,
  buildSourceSections,
  collectLanguages,
  installLabel,
  type ContentFilter,
  type StatusFilter,
} from "../domain/browseFilters";
import { useBrowseExtensions } from "../hooks/useBrowseExtensions";
import { openExtensionInstallSettings } from "../installer/installer";
import { mergeCatalog } from "../library/repo";
import TermsModal from "../components/installation/TermsModal";

const TABS = [
  { key: "sources", label: "Sources", icon: FolderDown },
  { key: "extensions", label: "Extensions", icon: Package },
  { key: "migrate", label: "Migrate", icon: ArrowRightLeft },
] as const;

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

export interface BrowseExtensionsScreenProps {
  onOpenSource: (sourceId: string) => void;
  initialTab?: "sources" | "extensions" | "migrate";
  initialQuery?: string;
}

/** Browse installed sources, repository extensions and missing-source migration. */
export default function BrowseExtensionsScreen({
  onOpenSource,
  initialTab = "sources",
  initialQuery = "",
}: BrowseExtensionsScreenProps) {
  const state = useBrowseExtensions();
  const [content, setContent] = useState<ContentFilter>("all");
  const [language, setLanguage] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    if (initialTab !== "sources") state.setTab(initialTab);
    if (initialQuery) state.setQuery(initialQuery);
  }, [initialQuery, initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const catalog = useMemo(() => mergeCatalog(state.repos), [state.repos]);
  const installedByPackage = useMemo(
    () => buildInstalledByPackage(state.installed),
    [state.installed],
  );
  const languages = useMemo(
    () => collectLanguages(catalog, state.installed),
    [catalog, state.installed],
  );
  const pinnedIds = useMemo(
    () => new Set(state.settings?.pinnedSourceIds ?? []),
    [state.settings?.pinnedSourceIds],
  );
  const lastUsedAt = useMemo(
    () => state.settings?.sourceLastUsedAt ?? {},
    [state.settings?.sourceLastUsedAt],
  );
  const sourceRows = useMemo(
    () =>
      buildSourceRows(state.installed, content, language, state.query),
    [content, language, state.installed, state.query],
  );
  const sourceSections = useMemo(
    () => buildSourceSections(sourceRows, pinnedIds, lastUsedAt),
    [lastUsedAt, pinnedIds, sourceRows],
  );
  const extensionRows = useMemo(
    () =>
      buildExtensionRows(
        catalog,
        installedByPackage,
        status,
        content,
        language,
        state.query,
      ),
    [catalog, content, installedByPackage, language, state.query, status],
  );
  const migrateRows = useMemo(
    () => buildMigrateRows(state.missing, catalog, state.query),
    [catalog, state.missing, state.query],
  );

  const handleOpen = (sourceId: string) =>
    state.openSource(sourceId, onOpenSource);

  const headerActions = [
    {
      key: "filter",
      icon: SlidersHorizontal,
      active: content !== "all" || language !== "all" || status !== "all",
      onPress: () => setFilterOpen(true),
    },
    { key: "refresh", icon: RefreshCw, onPress: () => void state.load() },
    {
      key: "repo",
      icon: Plus,
      onPress: () => {
        state.setRepoError(null);
        state.setRepoOpen(true);
      },
    },
  ];

  const renderInstallButton = (extension: Parameters<typeof installLabel>[0]) => {
    const label = installLabel(extension, installedByPackage);
    const busy = state.progressPackage === extension.packageName;
    const installedNow = label === "Installed";
    return (
      <Pressable
        disabled={busy || installedNow}
        onPress={() => state.handleInstall(extension)}
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
          {busy ? `${state.progressPercent}%` : label}
        </Text>
      </Pressable>
    );
  };


  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <AppHeader
        title="Browse"
        query={state.query}
        onQueryChange={state.setQuery}
        searchPlaceholder={
          state.tab === "sources"
            ? "Search installed sources"
            : state.tab === "extensions"
              ? "Search extensions"
              : "Search missing manga"
        }
        actions={headerActions}
      />

      <ChipTabBar
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
        activeKey={state.tab}
        onSelect={(key) => state.setTab(key as typeof state.tab)}
      />

      {state.loading ? <BrowseSkeleton /> : null}

      {!state.loading && state.banner ? (
        <View style={styles.banner}>
          <AlertTriangle
            color={state.banner.tone === "error" ? colors.danger : colors.gold}
            size={16}
          />
          <Text
            style={[
              styles.bannerText,
              state.banner.tone === "error" && { color: colors.danger },
            ]}
          >
            {state.banner.message}
          </Text>
          <Pressable onPress={() => state.setBanner(null)} hitSlop={8}>
            <X color={colors.textFaint} size={16} />
          </Pressable>
        </View>
      ) : null}

      {!state.loading && (state.settings?.extensionRepos.length ?? 0) === 0 ? (
        <ScrollView contentContainerStyle={styles.emptyContent}>
          <RepoIntro onAdd={() => state.setRepoOpen(true)} />
        </ScrollView>
      ) : state.loading ? null : state.tab === "sources" ? (
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
          renderItem={({ item, section }) => (
            <SourceListRow
              source={item.source}
              extensionName={item.extension.name}
              packageName={item.extension.packageName}
              nsfw={item.extension.nsfw}
              pinned={pinnedIds.has(item.source.id)}
              recentlyUsed={section.title === "Last used"}
              onOpen={handleOpen}
              onTogglePin={state.togglePin}
              onRemoveFromRecent={state.removeFromRecent}
              onRequestUninstall={state.requestUninstall}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No active sources"
              body={
                state.installed.length === 0
                  ? "Install an extension from the Extensions tab. Sources appear here once the package is active."
                  : "No installed source matches this search and filter."
              }
              action="Open Extensions"
              onAction={() => state.setTab("extensions")}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      ) : state.tab === "extensions" ? (
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
              label={installLabel(item, installedByPackage)}
              busy={state.progressPackage === item.packageName}
              percent={state.progressPercent}
              onInstall={state.handleInstall}
              onRequestUninstall={state.requestUninstall}
            />
          )}
          ListEmptyComponent={
            state.catalogLoading ? (
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
                onAction={catalog.length === 0 ? () => state.setRepoOpen(true) : undefined}
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
        visible={state.repoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => state.setRepoOpen(false)}
      >
        <Pressable style={styles.scrim} onPress={() => state.setRepoOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Repositories</Text>
              <Pressable onPress={() => state.setRepoOpen(false)} hitSlop={8}>
                <X color={colors.textMuted} size={20} />
              </Pressable>
            </View>
            <Text style={styles.sheetBody}>
              Paste a repository URL of an extension provider.
            </Text>
            <View style={styles.inputRow}>
              <Link2 color={colors.textFaint} size={17} />
              <TextInput
                value={state.repoInput}
                onChangeText={state.setRepoInput}
                placeholder="https://github.com/owner/repo/blob/repo/index.json"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={styles.input}
              />
            </View>
            {state.repoError ? (
              <Text style={styles.errorText}>{state.repoError}</Text>
            ) : null}
            <Pressable
              onPress={() => void state.addRepository()}
              disabled={state.repoBusy || !state.repoInput.trim()}
              style={({ pressed }) => [
                styles.primaryButton,
                (state.repoBusy || !state.repoInput.trim()) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {state.repoBusy ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Plus color={colors.onAccent} size={17} />
              )}
              <Text style={styles.primaryLabel}>Add repository</Text>
            </Pressable>
            <ScrollView style={styles.repoList} showsVerticalScrollIndicator={false}>
              {(state.settings?.extensionRepos ?? []).map((repo) => (
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
                    onPress={() => void state.removeRepository(repo.url)}
                    hitSlop={8}
                    style={({ pressed }) => [
                      styles.trashButton,
                      pressed && styles.pressed,
                    ]}
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
              <Text style={styles.sheetTitle}>Filter {state.tab}</Text>
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
            {state.tab === "extensions" ? (
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
        visible={state.permissionOpen}
        transparent
        animationType="fade"
        onRequestClose={() => state.setPermissionOpen(false)}
      >
        <Pressable
          style={styles.scrim}
          onPress={() => state.setPermissionOpen(false)}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Allow extension installs</Text>
            <Text style={styles.sheetBody}>
              Android needs permission to install packages from Mangora. Open the
              system setting, enable it, then come back and confirm.
            </Text>
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => state.setPermissionOpen(false)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void openExtensionInstallSettings()}
                style={({ pressed }) => [
                  styles.primaryButtonCompact,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.primaryLabel}>Open settings</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={state.uninstallTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!state.uninstallBusy) state.setUninstallTarget(null);
        }}
      >
        <Pressable
          style={styles.scrim}
          onPress={() => {
            if (!state.uninstallBusy) state.setUninstallTarget(null);
          }}
        >
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>
              Uninstall {state.uninstallTarget?.name ?? "extension"}?
            </Text>
            <Text style={styles.sheetBody}>
              Mangora will open Android uninstall confirmation. The extension
              and its sources are removed only if you approve there. Your manga
              library and reading data are not deleted.
            </Text>
            <View style={styles.sheetActions}>
              <Pressable
                disabled={state.uninstallBusy}
                onPress={() => state.setUninstallTarget(null)}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  state.uninstallBusy && styles.disabled,
                  pressed && !state.uninstallBusy && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryLabel}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={state.uninstallBusy}
                onPress={() => void state.confirmUninstall()}
                style={({ pressed }) => [
                  styles.destructiveButton,
                  state.uninstallBusy && styles.disabled,
                  pressed && !state.uninstallBusy && styles.pressed,
                ]}
              >
                {state.uninstallBusy ? (
                  <ActivityIndicator color={colors.onAccent} size="small" />
                ) : (
                  <Trash2 color={colors.onAccent} size={16} />
                )}
                <Text style={styles.primaryLabel}>
                  {state.uninstallBusy ? "Opening..." : "Continue"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <TermsModal
        visible={state.termsOpen}
        extensionName={state.pendingInstall?.name ?? "this extension"}
        onCancel={() => {
          state.setTermsOpen(false);
          state.setPendingInstall(null);
        }}
        onAccept={() => void state.acceptTerms()}
      />
    </SafeAreaView>
  );
}
