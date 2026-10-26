/**
 * Public catalog synchronization API.
 *
 * Downloads, library and manga refresh all consume the same provider adapter
 * and upsert path. This layer owns provider transport and catalog writes; UI
 * features own when a refresh should happen.
 */

export { canonicalId } from "./identity";
export { syncProviderManga, trySyncProviderManga } from "./catalogSync";
export { getProviderAdapter } from "./providerAdapters";
export type {
  ProviderAdapter,
  ProviderCatalogSnapshot,
  ProviderId,
} from "./providerAdapters";
