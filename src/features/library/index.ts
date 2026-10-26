/**
 * Public API for the library feature.
 *
 * Routes and composition pass navigation in; this feature owns membership,
 * cards, filters and library synchronization.
 */

export { default as LibraryScreen } from "./screens/LibraryScreen";
export type { LibraryScreenProps } from "./screens/LibraryScreen";
export { default as LibraryFilterSheet } from "./components/filters/LibraryFilterSheet";
export { default as AddToLibraryButton } from "./components/membership/AddToLibraryButton";
export type { AddToLibraryButtonProps } from "./components/membership/AddToLibraryButton";
export { default as LibraryCard } from "./components/cards/LibraryCard";
export {
  CreateLibraryDialog,
  BulkDeleteLibrariesDialog,
} from "./components/membership/LibraryDialogs";
export { useLibraryScreen } from "./hooks/useLibraryScreen";
export {
  hasActiveLibraryFilters,
  downloadedMangaToLibraryCards,
} from "./domain/libraryCards";
export { libraryIdentityIds } from "./domain/libraryIdentity";
export { syncLibrary, syncAllLibraries, getTrackedChapterProgress, listTrackedManga } from "./sync/librarySync";
export type { TrackedChapterProgress, TrackedProgressLookup, TrackedIdentity } from "./sync/librarySync";
export type { ProviderId } from "@core/catalog";
export { prepareReaderOpen, persistChapterReadState } from "./tracking/readerTracking";
export type { ReaderOpenInput, ChapterReadWriteInput } from "./tracking/readerTracking";
