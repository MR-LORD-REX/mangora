import {
  cachedExtensionSource,
  sourceIdFromProvider,
} from "@features/extensions/registry/registry";

/** Human-readable source name for library, downloads and share surfaces. */
export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return "Unknown source";
  const sourceId = sourceIdFromProvider(provider);
  if (sourceId) return cachedExtensionSource(sourceId)?.name ?? "Extension source";
  return provider;
}