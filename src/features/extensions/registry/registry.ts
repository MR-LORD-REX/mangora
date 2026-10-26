/**
 * In-memory extension registry.
 *
 * This is the feature's only installed-extension source of truth. It is
 * refreshed at startup and after install/uninstall, and exposes a stable
 * snapshot for `useSyncExternalStore`. Reader, library and browse consumers
 * must not reconstruct source identity from display names.
 */

import {
  hasNativeExtensions,
  listInstalledExtensions,
  listNativeSources,
} from "@platform/extensions";
import type {
  ExtensionSourceRecord,
  InstalledExtensionRecord,
} from "@platform/extensions/types";

export interface ExtensionRegistrySnapshot {
  installed: InstalledExtensionRecord[];
  sources: ExtensionSourceRecord[];
}

const EMPTY_SNAPSHOT: ExtensionRegistrySnapshot = Object.freeze({
  installed: Object.freeze([]) as unknown as InstalledExtensionRecord[],
  sources: Object.freeze([]) as unknown as ExtensionSourceRecord[],
});

let snapshot: ExtensionRegistrySnapshot = EMPTY_SNAPSHOT;
let refreshing: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function extensionProviderFor(sourceId: string): `ext:${string}` {
  return `ext:${sourceId}`;
}

export function sourceIdFromProvider(
  provider: string | null | undefined,
): string | null {
  if (!provider?.startsWith("ext:")) return null;
  return provider.slice(4);
}

export function isExtensionProvider(
  provider: string | null | undefined,
): boolean {
  return sourceIdFromProvider(provider) != null;
}

export function getExtensionRegistrySnapshot(): ExtensionRegistrySnapshot {
  return snapshot;
}

export function cachedInstalledExtensions(): InstalledExtensionRecord[] {
  return snapshot.installed;
}

export function cachedExtensionSources(): ExtensionSourceRecord[] {
  return snapshot.sources;
}

export function cachedExtensionSource(
  sourceId: string | null | undefined,
): ExtensionSourceRecord | null {
  if (!sourceId) return null;
  return snapshot.sources.find((source) => source.id === sourceId) ?? null;
}

export async function refreshExtensionRegistry(force = false): Promise<void> {
  if (!hasNativeExtensions()) {
    if (snapshot !== EMPTY_SNAPSHOT) {
      snapshot = EMPTY_SNAPSHOT;
      listeners.forEach((listener) => listener());
    }
    return;
  }
  if (refreshing && !force) return refreshing;
  refreshing = (async () => {
    try {
      const [installed, sources] = await Promise.all([
        listInstalledExtensions(),
        listNativeSources(),
      ]);
      snapshot = { installed, sources };
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