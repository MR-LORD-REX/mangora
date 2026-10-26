import type {
  ChapterMeta,
  ChapterSourceModule,
  LibraryMangaInput,
} from "@shared/contracts";

export function emptyLibrary(
  source: ChapterSourceModule,
  identity: string,
  meta: ChapterMeta,
): LibraryMangaInput {
  const lib = source.library(identity, meta);
  return {
    provider: source.provider,
    providerMangaId: lib.id,
    providerMangaAliases: lib.aliases,
    title: meta.title,
    thumbnailUrl: meta.coverUrl ?? null,
    description: meta.description ?? null,
  };
}
