/**
 * registry.ts
 * ---------------------------------------------------------------------------
 * Small in-memory mirror of the native installed-source list. The manga
 * viewer needs the extension's display name synchronously while rendering,
 * so the list is refreshed at startup and after every install.
 * ---------------------------------------------------------------------------
 */

import {
  hasNativeExtensions,
  listInstalledExtensions,
  listNativeSources,
} from "./native";
import type { ExtensionSourceRecord, InstalledExtensionRecord } from "./types";
import type { ProviderId } from "@/services/db/repositories/catalogRepository";

let installed: InstalledExtensionRecord[] = [];
let sources: ExtensionSourceRecord[] = [];
let refreshing: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function extensionProviderFor(sourceId: string): ProviderId {
  return `ext:${sourceId}` as ProviderId;
}

export function sourceIdFromProvider(provider: string | null | undefined): string | null {
  if (!provider?.startsWith("ext:")) return null;
  return provider.slice(4);
}

export function isExtensionProvider(provider: string | null | undefined): boolean {
  return Boolean(provider?.startsWith("ext:"));
}

export function cachedInstalledExtensions(): InstalledExtensionRecord[] {
  return installed;
}

export function cachedExtensionSources(): ExtensionSourceRecord[] {
  return sources;
}

export function cachedExtensionSource(sourceId: string | null | undefined) {
  if (!sourceId) return null;
  return sources.find((source) => source.id === sourceId) ?? null;
}

export async function refreshExtensionRegistry(force = false): Promise<void> {
  if (!hasNativeExtensions()) {
    installed = [];
    sources = [];
    listeners.forEach((listener) => listener());
    return;
  }
  if (refreshing && !force) return refreshing;
  refreshing = (async () => {
    try {
      const [nextInstalled, nextSources] = await Promise.all([
        listInstalledExtensions(),
        listNativeSources(),
      ]);
      installed = nextInstalled;
      sources = nextSources;
    } catch (error) {
      console.warn("Failed to read installed extensions:", error);
    } finally {
      refreshing = null;
      listeners.forEach((listener) => listener());
    }
  })();
  return refreshing;
}

export function subscribeExtensionRegistry(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}