/**
 * Public API for extensions.
 *
 * Cross-feature consumers and routes import only this module. Internal files
 * import concrete sibling modules so the facade stays out of internal cycles.
 */

export {
  buildFilterSelection,
  createFilterDraft,
  editableFilters,
  filterBlocks,
  filterChanged,
  filterDefault,
  filterGroupLabel,
  filterSchema,
  filterValueLabel,
  removeFilterPath,
} from "./filters/filters";
export type {
  ExtensionFilterSelection,
  FilterBlock,
  FilterChip,
  FilterDraft,
  FilterSummary,
} from "./filters/filters";

export {
  cachedExtensionSource,
  cachedExtensionSources,
  cachedInstalledExtensions,
  extensionProviderFor,
  getExtensionRegistrySnapshot,
  isExtensionProvider,
  refreshExtensionRegistry,
  sourceIdFromProvider,
  subscribeExtensionRegistry,
} from "./registry/registry";
export type { ExtensionRegistrySnapshot } from "./registry/registry";

export {
  downloadExtensionApk,
  extensionInstallPermission,
  installExtension,
  openExtensionInstallSettings,
  verifyExtensionApk,
} from "./installer/installer";
export type {
  ExtensionDownloadProgress,
  VerifiedExtensionApk,
} from "./installer/installer";

export {
  extensionForSource,
  fetchExtensionRepo,
  loadExtensionCatalog,
  mergeCatalog,
  normalizeRepoUrl,
  parseExtensionRepo,
  parseRepoJson,
} from "./library/repo";
export type { CatalogLoadResult } from "./library/repo";

export {
  listExtensionMangaRecords,
  listMissingExtensionGroups,
} from "./library/migration";
export type {
  ExtensionMangaRecord,
  MissingExtensionGroup,
} from "./library/migration";

export { useExtensionRegistry } from "./hooks/useExtensionRegistry";

export { default as BrowseExtensionsScreen } from "./screens/BrowseExtensionsScreen";
export type { BrowseExtensionsScreenProps } from "./screens/BrowseExtensionsScreen";
export { default as ExtensionSourceScreen } from "./screens/ExtensionSourceScreen";
export type { ExtensionSourceScreenProps } from "./screens/ExtensionSourceScreen";
export { default as ExtensionFilterSheet } from "./components/catalog/ExtensionFilterSheet";
export { default as TermsModal } from "./components/installation/TermsModal";

export type {
  ExtensionCatalogEntry,
  ExtensionFilterPatch,
  ExtensionRepo,
  ExtensionSourceRecord,
  InstalledExtensionRecord,
  NativeChapter,
  NativeFilter,
  NativeManga,
  NativeMangaDetails,
  NativeMangaPage,
  NativePageList,
  RepoExtension,
  RepoSource,
} from "@platform/extensions/types";
