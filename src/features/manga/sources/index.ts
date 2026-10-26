import type { ChapterSourceModule } from "@shared/contracts";
import { extensionModuleFor } from "./extension";
import { sourceIdFromProvider } from "@features/extensions/registry/registry";

export function chapterSourceFor(
  provider: string | undefined | null,
): ChapterSourceModule | null {
  if (!provider) return null;
  const extensionSourceId = sourceIdFromProvider(provider);
  if (extensionSourceId) return extensionModuleFor(extensionSourceId);
  return null;
}