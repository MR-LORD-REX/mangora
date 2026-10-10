/**
 * providers.ts
 * ---------------------------------------------------------------------------
 * Provider metadata shared across features. `MATURE_PROVIDERS` drives Safe
 * mode (Browse hides them) and the age-restricted share gate (plan S9/S14.4).
 * ---------------------------------------------------------------------------
 */

/** Providers whose content is adult-oriented. */
export const MATURE_PROVIDERS: Record<string, boolean> = {
  nh: true,
  manhwa18: true,
};

export function isMatureProvider(
  provider: string | null | undefined,
): boolean {
  return Boolean(provider && MATURE_PROVIDERS[provider]);
}