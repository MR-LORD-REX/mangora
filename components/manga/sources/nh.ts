import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";

import type { GallerySourceModule } from "@/components/manga/sources/module";
import type { ChapterMeta, SharedTag } from "@/components/manga/types";
import { providerAccent } from "@/constants/theme";
import type { NhGallery, NhTag } from "@/services/nh/nh.types";
import { nhClient } from "@/services/nh/nhShared";
import { prepareReaderOpen } from "@/services/library/readerTracking";

function tagSection(title: string, tags: NhTag[]): { title: string; tags: SharedTag[] } {
  return {
    title,
    tags: (tags ?? []).map((tag) => ({
      key: `${tag.type}:${tag.id}`,
      label: tag.label,
      raw: tag,
    })),
  };
}

export const nhGalleryModule: GallerySourceModule = {
  provider: "nh",
  accent: providerAccent.nh,
  label: "NHentai",

  decodeIdentity(param: string) {
    return param;
  },

  async load(identity) {
    const gallery: NhGallery = await nhClient.getById(identity);
    const cover = gallery.thumbUrl || gallery.coverUrl;

    const meta: ChapterMeta = {
      title: gallery.title,
      subtitle: gallery.titleJapanese ?? null,
      coverUrl: cover,
      description: null,
      sourceUrl: gallery.webUrl,
      tagSections: [
        tagSection("Artists", gallery.artists),
        tagSection("Groups", gallery.groups),
        tagSection("Parodies", gallery.parodies),
        tagSection("Characters", gallery.characters),
        tagSection("Tags", gallery.contentTags),
        tagSection(
          "Languages",
          gallery.tags.filter((tag) => tag.type === "language"),
        ),
        tagSection("Categories", gallery.categories),
      ].filter((section) => section.tags.length > 0),
    };

    return {
      meta,
      galleryCode: gallery.id,
      pageCount: gallery.pageCount,
      favorites: gallery.favorites,
      uploadedAt: gallery.uploadedAt || null,
      library: { id: gallery.id },
    };
  },

  progressQuery(identity) {
    return { provider: "nh", providerMangaIds: [identity] };
  },

  library(identity) {
    return { id: identity };
  },

  async read(identity, meta) {
    const galleryId = identity;
    await prepareReaderOpen({
      provider: "nh",
      providerMangaId: galleryId,
      providerChapterId: galleryId,
      mangaTitle: meta.title,
      chapterTitle: "Gallery",
      thumbnailUrl: meta.coverUrl ?? null,
      readerParams: {
        id: galleryId,
        source: "nh",
        mangaTitle: meta.title,
        chapterTitle: "Gallery",
        ...(meta.coverUrl ? { thumbnailUrl: meta.coverUrl } : {}),
      },
    });
    router.push({
      pathname: "/reader/[id]",
      params: {
        id: galleryId,
        source: "nh",
        title: meta.title,
        mangaTitle: meta.title,
        chapterTitle: "Gallery",
        ...(meta.coverUrl ? { thumbnailUrl: meta.coverUrl } : {}),
      },
    });
  },

  openTag(tag: SharedTag) {
    const nhTag = tag.raw as NhTag | undefined;
    if (!nhTag) return;
    const filterQuery = `${nhTag.type}:"${nhTag.name}"`;
    router.push({
      pathname: "/(nh)/main",
      params: { filterTag: filterQuery },
    });
  },

  openSite(identity, meta) {
    if (meta.sourceUrl) {
      void WebBrowser.openBrowserAsync(meta.sourceUrl);
    }
  },
};