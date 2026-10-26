import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  getSettings,
  subscribeSettings,
  updateSettings,
  type AppSettings,
  type ExtensionRepoSetting,
} from "@core/settings";
import { requestExtensionUninstall } from "@platform/extensions";

import { fetchExtensionRepo, loadExtensionCatalog, normalizeRepoUrl } from "../library/repo";
import { listMissingExtensionGroups } from "../library/migration";
import { cachedInstalledExtensions, refreshExtensionRegistry } from "../registry/registry";
import {
  downloadExtensionApk,
  extensionInstallPermission,
  installExtension,
  verifyExtensionApk,
} from "../installer/installer";
import type {
  ExtensionCatalogEntry,
  ExtensionRepo,
  InstalledExtensionRecord,
} from "@platform/extensions/types";
import type { MissingExtensionGroup } from "../library/migration";

export type BrowseTab = "sources" | "extensions" | "migrate";

export interface UninstallTarget {
  packageName: string;
  name: string;
}

export interface BrowseBanner {
  message: string;
  tone: "info" | "error";
}

const EMPTY_REPOS: ExtensionRepoSetting[] = [];

async function listInstalledExtensionsSafe(): Promise<InstalledExtensionRecord[]> {
  try {
    const { listInstalledExtensions } = await import("@platform/extensions");
    return await listInstalledExtensions();
  } catch {
    return cachedInstalledExtensions();
  }
}

/**
 * Owns browse-tab data and extension lifecycle actions. Presentation only
 * receives the resulting state and callbacks.
 */
export function useBrowseExtensions() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tab, setTab] = useState<BrowseTab>("sources");
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<ExtensionRepo[]>([]);
  const [installed, setInstalled] = useState<InstalledExtensionRecord[]>([]);
  const [missing, setMissing] = useState<MissingExtensionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [banner, setBanner] = useState<BrowseBanner | null>(null);

  const [repoOpen, setRepoOpen] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [repoBusy, setRepoBusy] = useState(false);
  const [repoError, setRepoError] = useState<string | null>(null);

  const [pendingInstall, setPendingInstall] = useState<ExtensionCatalogEntry | null>(null);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [uninstallTarget, setUninstallTarget] = useState<UninstallTarget | null>(null);
  const [uninstallBusy, setUninstallBusy] = useState(false);
  const [progressPackage, setProgressPackage] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);

  const installRef = useRef<(extension: ExtensionCatalogEntry) => Promise<void>>(
    async () => {},
  );

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
    () => JSON.stringify(settings?.extensionRepos ?? EMPTY_REPOS),
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
      setBanner({
        message: error instanceof Error ? error.message : "Refresh failed.",
        tone: "error",
      });
      setLoading(false);
    }
    setCatalogLoading(true);
    try {
      const catalog = await loadExtensionCatalog(settings.extensionRepos);
      setRepos(catalog.repos);
      if (catalog.errors.length > 0) {
        setBanner({
          message: `Could not refresh ${catalog.errors.length} repository${
            catalog.errors.length === 1 ? "" : "s"
          }. Showing cached data where available.`,
          tone: "info",
        });
      }
      setMissing(await listMissingExtensionGroups());
    } catch (error) {
      setBanner({
        message: error instanceof Error ? error.message : "Refresh failed.",
        tone: "error",
      });
    } finally {
      setCatalogLoading(false);
    }
  }, [settings]);

  useEffect(() => {
    if (!settings) return;
    void load();
  }, [repoKey, settings?.extensionRepos.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const beginInstall = useCallback(
    async (extension: ExtensionCatalogEntry) => {
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
      await installRef.current(extension);
    },
    [settings?.extensionTermsAcceptedAt],
  );

  const performInstall = useCallback(async (extension: ExtensionCatalogEntry) => {
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
      setBanner({
        message: `Installer opened for ${extension.name}. Confirm it, then return here.`,
        tone: "info",
      });
      setPendingInstall(null);
    } catch (error) {
      setBanner({
        message:
          error instanceof Error ? error.message : "Extension install failed.",
        tone: "error",
      });
    } finally {
      setProgressPackage(null);
      setProgressPercent(0);
    }
  }, []);

  installRef.current = performInstall;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      void (async () => {
        await refreshExtensionRegistry(true);
        setInstalled(await listInstalledExtensionsSafe());
        setMissing(await listMissingExtensionGroups());
        if (permissionOpen && (await extensionInstallPermission())) {
          setPermissionOpen(false);
          if (pendingInstall) await performInstall(pendingInstall);
        }
      })();
    });
    return () => subscription.remove();
  }, [pendingInstall, performInstall, permissionOpen]);

  const handleInstall = useCallback(
    (extension: ExtensionCatalogEntry) => {
      void beginInstall(extension);
    },
    [beginInstall],
  );

  const requestUninstall = useCallback((packageName: string, name: string) => {
    setUninstallTarget({ packageName, name });
  }, []);

  const confirmUninstall = useCallback(async () => {
    if (!uninstallTarget || uninstallBusy) return;
    setUninstallBusy(true);
    try {
      await requestExtensionUninstall(uninstallTarget.packageName);
      setBanner({
        message: `Android uninstall confirmation opened for ${uninstallTarget.name}. The extension stays installed unless you approve it.`,
        tone: "info",
      });
      setUninstallTarget(null);
    } catch (error) {
      setBanner({
        message:
          error instanceof Error
            ? error.message
            : `Could not open Android uninstall for ${uninstallTarget.name}.`,
        tone: "error",
      });
      setUninstallTarget(null);
    } finally {
      setUninstallBusy(false);
    }
  }, [uninstallBusy, uninstallTarget]);

  const openSource = useCallback(
    (sourceId: string, onOpenSource: (sourceId: string) => void) => {
      const current = settings?.sourceLastUsedAt ?? {};
      void updateSettings({
        sourceLastUsedAt: { ...current, [sourceId]: Date.now() },
      }).catch(console.error);
      onOpenSource(sourceId);
    },
    [settings?.sourceLastUsedAt],
  );

  const togglePin = useCallback(
    (sourceId: string) => {
      const current = new Set(settings?.pinnedSourceIds ?? []);
      if (current.has(sourceId)) current.delete(sourceId);
      else current.add(sourceId);
      void updateSettings({ pinnedSourceIds: [...current] }).catch(console.error);
    },
    [settings?.pinnedSourceIds],
  );

  const removeFromRecent = useCallback(
    (sourceId: string) => {
      const next = { ...(settings?.sourceLastUsedAt ?? {}) };
      delete next[sourceId];
      void updateSettings({ sourceLastUsedAt: next }).catch(console.error);
    },
    [settings?.sourceLastUsedAt],
  );

  const acceptTerms = useCallback(async () => {
    await updateSettings({ extensionTermsAcceptedAt: Date.now() });
    const target = pendingInstall;
    setTermsOpen(false);
    if (target) await performInstall(target);
  }, [pendingInstall, performInstall]);

  const addRepository = useCallback(async () => {
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
      setRepos((current) => [
        ...current.filter((item) => item.url !== repo.url),
        repo,
      ]);
      setBanner({ message: `Added ${repo.name}.`, tone: "info" });
    } catch (error) {
      setRepoError(
        error instanceof Error ? error.message : "Could not load repository.",
      );
    } finally {
      setRepoBusy(false);
    }
  }, [repoInput, settings]);

  const removeRepository = useCallback(
    async (url: string) => {
      if (!settings) return;
      await updateSettings({
        extensionRepos: settings.extensionRepos.filter(
          (entry) => entry.url !== url,
        ),
      });
    },
    [settings],
  );

  return {
    settings,
    tab,
    setTab,
    query,
    setQuery,
    repos,
    installed,
    missing,
    loading,
    catalogLoading,
    banner,
    setBanner,
    repoOpen,
    setRepoOpen,
    repoInput,
    setRepoInput,
    repoBusy,
    repoError,
    setRepoError,
    pendingInstall,
    setPendingInstall,
    permissionOpen,
    setPermissionOpen,
    termsOpen,
    setTermsOpen,
    uninstallTarget,
    setUninstallTarget,
    uninstallBusy,
    progressPackage,
    progressPercent,
    handleInstall,
    requestUninstall,
    confirmUninstall,
    openSource,
    togglePin,
    removeFromRecent,
    acceptTerms,
    addRepository,
    removeRepository,
    load,
  };
}
