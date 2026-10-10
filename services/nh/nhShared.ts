/**
 * nhShared.ts - shared NhClient + TaxonomyStore singletons.
 * ---------------------------------------------------------------------------
 * Every screen and component that talks to nhentai MUST import from here
 * instead of creating its own NhClient. This ensures:
 *   1. A single shared HTTP session (throttle + headers) for the app.
 *   2. The TaxonomyStore cache is shared and only synced once.
 *
 * The nhentai v2 JSON API is Cloudflare-free for data reads, so there is no
 * challenge UI, no clearance cookie and no WebView anywhere in this module.
 * ---------------------------------------------------------------------------
 */

import { NH_DEFAULTS, type NhTagType } from '@/services/nh/nh.constants';
import { NhClient, TaxonomyStore } from '@/services/nh/nh';

export const nhClient = new NhClient();

export const nhTaxonomy = new TaxonomyStore(nhClient);

/** hydrate() + a background sync only when stale. Call once at the (nh) layout. */
export async function bootstrapNh(): Promise<void> {
  try {
    await nhTaxonomy.bootstrap();
  } catch {
    // Taxonomy is optional - static seed tags keep the UI usable offline.
  }
}

/**
 * Makes sure a taxonomy type has entries to suggest from. Only `tag` ships
 * with a static seed, so artist/group/parody/character sections fetch the
 * popular feed lazily the first time they are opened. Safe to call from the
 * filter sheet: concurrent calls for the same type share one fetch, and a
 * failure never rejects (the section simply keeps its search box).
 */
const ensureInFlight = new Map<NhTagType, Promise<void>>();

export function ensureNhTaxonomy(type: NhTagType): Promise<void> {
  if (nhTaxonomy.get(type).length > 0) return Promise.resolve();
  const pending = ensureInFlight.get(type);
  if (pending) return pending;

  const run = (async () => {
    // `TaxonomyStore.sync()` shares a single in-flight promise, so a boot
    // sync running at the same time would swallow our call. Loop until the
    // requested type has data or two fetch rounds returned nothing.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (nhTaxonomy.get(type).length > 0) return;
      const updatedBefore = nhTaxonomy.getSnapshot().updatedAt;
      try {
        await nhTaxonomy.sync([type], NH_DEFAULTS.taxonomySyncPages);
      } catch {
        return;
      }
      if (nhTaxonomy.get(type).length === 0) {
        // Nothing came back and no other sync ran in the meantime.
        if (nhTaxonomy.getSnapshot().updatedAt === updatedBefore) return;
      } else {
        return;
      }
    }
  })();
  ensureInFlight.set(type, run);
  void run.finally(() => ensureInFlight.delete(type));
  return run;
}
