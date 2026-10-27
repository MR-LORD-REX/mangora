/**
 * Maturity gate for extension sources.
 *
 * Built-in provider integrations were removed; maturity comes from the
 * extension registry record for the source, never from the display name.
 */
import {
  cachedExtensionSource,
  sourceIdFromProvider,
} from "../registry/registry";

export function isMatureProvider(
  provider: string | null | undefined,
): boolean {
  const sourceId = sourceIdFromProvider(provider);
  if (!sourceId) return false;
  return cachedExtensionSource(sourceId)?.nsfw ?? false;
}