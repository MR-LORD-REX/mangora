import type { ChapterSourceModule } from "@/components/manga/sources/module";
import { extensionModuleFor } from "./extension";
import { sourceIdFromProvider } from "@/services/extensions/registry";

export type { ChapterSourceModule } from "@/components/manga/sources/module";

export function chapterSourceFor(
  provider: string | undefined | null,
): ChapterSourceModule | null {
  if (!provider) return null;
  const extensionSourceId = sourceIdFromProvider(provider);
  if (extensionSourceId) return extensionModuleFor(extensionSourceId);
  return null;
}