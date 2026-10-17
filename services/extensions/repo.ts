/**
 * repo.ts
 * ---------------------------------------------------------------------------
 * Repository discovery. The user supplies a Mihon/Keiyoushi index.json URL;
 * nothing is hard-coded. Parsing quotes 64-bit source ids before JSON.parse
 * because they exceed Number.MAX_SAFE_INTEGER.
 * ---------------------------------------------------------------------------
 */

import { Directory, File, Paths } from "expo-file-system";

import type { ExtensionRepoSetting } from "@/services/settings/settingsStore";
import type {
  ExtensionCatalogEntry,
  ExtensionRepo,
  RepoExtension,
  RepoSource,
} from "./types";

const USER_AGENT = "Mangora-Android";

/** Quotes only long numeric ids, leaving versionCode and other numbers alone. */
export function parseRepoJson(raw: string): unknown {
  return JSON.parse(raw.replace(/"id"\s*:\s*(-?\d{6,})/g, '"id":"$1"'));
}

/**
 * Turns a GitHub blob URL into its raw equivalent. Repo home pages fall back
 * to Keiyoushi's `repo` branch and are retried against main/master.
 */
export function normalizeRepoUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.hostname === "github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      const [owner, repo, kind, ...rest] = parts;
      if (owner && repo) {
        if (kind === "blob" && rest.length >= 2) {
          const branch = rest[0];
          const path = rest.slice(1).join("/");
          return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
        }
        if (kind === "raw" && rest.length >= 2) {
          return `https://raw.githubusercontent.com/${owner}/${repo}/${rest.join("/")}`;
        }
        return `https://raw.githubusercontent.com/${owner}/${repo}/repo/index.json`;
      }
    }
    if (url.hostname === "raw.githubusercontent.com") return url.toString();
    if (url.pathname.toLowerCase().endsWith(".json")) return url.toString();
    return `${trimmed}/index.json`;
  } catch {
    return trimmed;
  }
}

function candidates(input: string): string[] {
  const canonical = normalizeRepoUrl(input);
  const list = [canonical];
  // A repo home page has no branch in it. Try common branch names too.
  const match = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/repo\/index\.json$/.exec(
    canonical,
  );
  if (match) {
    list.push(
      `https://cdn.jsdelivr.net/gh/${match[1]}/${match[2]}@repo/index.json`,
      `https://raw.githubusercontent.com/${match[1]}/${match[2]}/main/index.json`,
      `https://raw.githubusercontent.com/${match[1]}/${match[2]}/master/index.json`,
    );
  }
  return Array.from(new Set(list));
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSource(raw: unknown): RepoSource | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = value.id == null ? "" : String(value.id);
  const name = typeof value.name === "string" ? value.name : "";
  if (!id || !name) return null;
  return {
    id,
    name,
    language:
      typeof value.language === "string" ? value.language : "all",
    homeUrl: typeof value.homeUrl === "string" ? value.homeUrl : null,
  };
}

function normalizeExtension(raw: unknown): RepoExtension | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const resources = (value.resources ?? {}) as Record<string, unknown>;
  const apkUrl =
    typeof resources.apkUrl === "string" ? resources.apkUrl : "";
  const packageName =
    typeof value.packageName === "string" ? value.packageName : "";
  if (!apkUrl || !packageName) return null;
  const sources = Array.isArray(value.sources)
    ? value.sources.map(normalizeSource).filter((s): s is RepoSource => s != null)
    : [];
  return {
    name: typeof value.name === "string" ? value.name : packageName,
    packageName,
    resources: {
      apkUrl,
      iconUrl:
        typeof resources.iconUrl === "string" ? resources.iconUrl : null,
      jarUrl: typeof resources.jarUrl === "string" ? resources.jarUrl : null,
    },
    extensionLib:
      value.extensionLib == null ? "1.6" : String(value.extensionLib),
    versionCode:
      value.versionCode == null ? "0" : String(value.versionCode),
    versionName:
      value.versionName == null ? "" : String(value.versionName),
    contentWarning:
      typeof value.contentWarning === "string" ? value.contentWarning : null,
    sources,
  };
}

export function parseExtensionRepo(
  raw: string,
  canonicalUrl: string,
  sourceUrl: string,
): ExtensionRepo {
  const data = parseRepoJson(raw) as Record<string, unknown>;
  const extensionList = data.extensionList as Record<string, unknown> | undefined;
  const list = Array.isArray(extensionList?.extensions)
    ? extensionList.extensions
    : Array.isArray(data.extensions)
      ? data.extensions
      : Array.isArray(data)
        ? data
        : [];
  const extensions = list
    .map(normalizeExtension)
    .filter((e): e is RepoExtension => e != null);
  return {
    url: canonicalUrl,
    sourceUrl,
    name:
      typeof data.name === "string"
        ? data.name
        : new URL(canonicalUrl).hostname,
    badgeLabel:
      typeof data.badgeLabel === "string" ? data.badgeLabel : null,
    signingKey:
      typeof data.signingKey === "string"
        ? data.signingKey.trim().toLowerCase()
        : null,
    fetchedAt: Date.now(),
    extensions,
  };
}

function cacheDirectory(): Directory {
  const dir = new Directory(Paths.document, "mangora-extensions");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function cacheFile(): File {
  return new File(cacheDirectory(), "repo-cache.json");
}

async function readCache(): Promise<Record<string, ExtensionRepo>> {
  try {
    const file = cacheFile();
    if (!file.exists) return {};
    return JSON.parse(await file.text()) as Record<string, ExtensionRepo>;
  } catch {
    return {};
  }
}

async function writeCache(cache: Record<string, ExtensionRepo>): Promise<void> {
  try {
    cacheFile().write(JSON.stringify(cache));
  } catch (error) {
    console.warn("Failed to cache extension repositories:", error);
  }
}

export async function fetchExtensionRepo(
  sourceUrl: string,
): Promise<ExtensionRepo> {
  let lastError: unknown = null;
  for (const candidate of candidates(sourceUrl)) {
    try {
      const raw = await fetchText(candidate);
      return parseExtensionRepo(raw, candidate, sourceUrl);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not load this repository.");
}

export interface CatalogLoadResult {
  repos: ExtensionRepo[];
  errors: { url: string; message: string }[];
}

export async function loadExtensionCatalog(
  settings: ExtensionRepoSetting[],
): Promise<CatalogLoadResult> {
  const cache = await readCache();
  const nextCache: Record<string, ExtensionRepo> = {};
  const repos: ExtensionRepo[] = [];
  const errors: { url: string; message: string }[] = [];

  await Promise.all(
    settings.map(async (setting) => {
      const canonical = normalizeRepoUrl(setting.url);
      try {
        const repo = await fetchExtensionRepo(setting.url);
        nextCache[repo.url] = repo;
        repos.push(repo);
      } catch (error) {
        const cached = cache[canonical];
        if (cached) repos.push({ ...cached, sourceUrl: setting.url });
        errors.push({
          url: setting.url,
          message: error instanceof Error ? error.message : "Fetch failed",
        });
      }
    }),
  );

  await writeCache({ ...cache, ...nextCache });
  repos.sort((a, b) => a.name.localeCompare(b.name));
  return { repos, errors };
}

export function mergeCatalog(repos: ExtensionRepo[]): ExtensionCatalogEntry[] {
  const byPackage = new Map<string, ExtensionCatalogEntry>();
  for (const repo of repos) {
    for (const extension of repo.extensions) {
      const entry: ExtensionCatalogEntry = {
        ...extension,
        repoUrl: repo.url,
        signingKey: repo.signingKey,
      };
      const previous = byPackage.get(extension.packageName);
      if (
        !previous ||
        Number(extension.versionCode) > Number(previous.versionCode)
      ) {
        byPackage.set(extension.packageName, entry);
      }
    }
  }
  return Array.from(byPackage.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function extensionForSource(
  repos: ExtensionRepo[],
  sourceId: string,
): ExtensionCatalogEntry | null {
  return (
    mergeCatalog(repos).find((extension) =>
      extension.sources.some((source) => source.id === sourceId),
    ) ?? null
  );
}