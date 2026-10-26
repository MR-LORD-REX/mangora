/** Builds the provider manga ids that represent the same library membership. */
export function libraryIdentityIds(
  providerMangaId: string,
  aliases: readonly string[],
): string[] {
  return [providerMangaId, ...aliases].filter((id) => Boolean(id));
}
