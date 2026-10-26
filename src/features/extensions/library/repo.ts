/** Repository fetching/cache boundary. Pure parsing lives in `catalogIndex.ts`. */

import { Directory, File, Paths } from "expo-file-system";

import type { ExtensionRepoSetting } from "@core/settings";
import type { ExtensionRepo } from "@platform/extensions/types";
import {
  candidateRepoUrls,
  normalizeRepoUrl,
  parseExtensionRepo,
} from "./catalogIndex";

export {
  candidateRepoUrls,
  extensionForSource,
  mergeCatalog,
  normalizeRepoUrl,
  parseExtensionRepo,
  parseRepoJson,
} from "./catalogIndex";

const USER_AGENT = "Mangora-Android";

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
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

export async function fetchExtensionRepo(sourceUrl: string): Promise<ExtensionRepo> {
  let lastError: unknown = null;
  for (const candidate of candidateRepoUrls(sourceUrl)) {
    try {
      const raw = await fetchText(candidate);
      return parseExtensionRepo(raw, candidate, sourceUrl);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Could not load this repository.");
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