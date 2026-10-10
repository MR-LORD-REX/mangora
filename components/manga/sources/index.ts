import type { ChapterSourceModule, GallerySourceModule } from "@/components/manga/sources/module";

import { brainrotModule } from "./brainrot";
import { comixModule } from "./comix";
import { mangadexModule } from "./mangadex";
import { mangakatanaModule } from "./mangakatana";
import { manhwa18Module } from "./manhwa18";
import { mgekoModule } from "./mgeko";
import { philiaModule } from "./philia";
import { nhGalleryModule } from "./nh";

export type { ChapterSourceModule, GallerySourceModule } from "@/components/manga/sources/module";

/** Chapter-based (has a chapter list) source modules. */
export const chapterSourceModules: Record<string, ChapterSourceModule> = {
  mangadex: mangadexModule,
  mangakatana: mangakatanaModule,
  manhwa18: manhwa18Module,
  mgeko: mgekoModule,
  comix: comixModule,
  brainrot: brainrotModule,
  philia: philiaModule,
};

/** One-shot / gallery style source modules (no chapter list). */
export const gallerySourceModules: Record<string, GallerySourceModule> = {
  nh: nhGalleryModule,
};

export function chapterSourceFor(provider: string | undefined | null): ChapterSourceModule | null {
  if (!provider) return null;
  return chapterSourceModules[provider] ?? null;
}

export function gallerySourceFor(provider: string | undefined | null): GallerySourceModule | null {
  if (!provider) return null;
  return gallerySourceModules[provider] ?? null;
}