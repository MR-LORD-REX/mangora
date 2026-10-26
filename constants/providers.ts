/**
 * providers.ts
 * ---------------------------------------------------------------------------
 * Provider metadata shared by sharing and safe-mode gates.
 * Built-in provider integrations were removed; extension maturity comes from
 * the registry record for the extension that owns the source.
 * ---------------------------------------------------------------------------
 */

import {
  cachedExtensionSource,
  sourceIdFromProvider,
} from "@features/extensions/registry/registry";

export function isMatureProvider(
  provider: string | null | undefined,
): boolean {
  const sourceId = sourceIdFromProvider(provider);
  if (!sourceId) return false;
  return cachedExtensionSource(sourceId)?.nsfw ?? false;
}