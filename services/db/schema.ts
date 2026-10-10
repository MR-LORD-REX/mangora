import {
    index,
    integer,
    primaryKey,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
};

export const libraries = sqliteTable(
  "libraries",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("libraries_name_unique").on(table.name)],
);

export const manga = sqliteTable(
  "manga",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerMangaId: text("provider_manga_id").notNull(),
    title: text("title").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    description: text("description"),
    addedAt: integer("added_at", { mode: "number" }).notNull(),
    lastSyncedAt: integer("last_synced_at", { mode: "number" }),
    lastSyncError: text("last_sync_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("manga_provider_identity_unique").on(
      table.provider,
      table.providerMangaId,
    ),
    index("manga_provider_index").on(table.provider),
    index("manga_last_synced_index").on(table.lastSyncedAt),
  ],
);

export const libraryManga = sqliteTable(
  "library_manga",
  {
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    mangaId: text("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    addedAt: integer("added_at", { mode: "number" }).notNull(),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.libraryId, table.mangaId] }),
    index("library_manga_library_index").on(table.libraryId),
    index("library_manga_manga_index").on(table.mangaId),
  ],
);

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    mangaId: text("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    providerChapterId: text("provider_chapter_id").notNull(),
    title: text("title").notNull(),
    chapterNumber: integer("chapter_number", { mode: "number" }),
    scanlationGroup: text("scanlation_group"),
    chapterGroupKey: text("chapter_group_key"),
    volume: text("volume"),
    languageCode: text("language_code"),
    pageCount: integer("page_count", { mode: "number" }),
    publishedAt: integer("published_at", { mode: "number" }),
    lastSyncedAt: integer("last_synced_at", { mode: "number" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("chapters_manga_provider_identity_unique").on(
      table.mangaId,
      table.providerChapterId,
    ),
    index("chapters_manga_index").on(table.mangaId),
    index("chapters_manga_number_index").on(table.mangaId, table.chapterNumber),
    index("chapters_manga_group_index").on(table.mangaId, table.chapterGroupKey),
  ],
);

export const readingProgress = sqliteTable(
  "reading_progress",
  {
    chapterId: text("chapter_id")
      .primaryKey()
      .references(() => chapters.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["unread", "reading", "completed"],
    })
      .notNull()
      .default("unread"),
    lastPageIndex: integer("last_page_index", { mode: "number" })
      .notNull()
      .default(0),
    lastPageCount: integer("last_page_count", { mode: "number" }),
    startedAt: integer("started_at", { mode: "number" }),
    lastReadAt: integer("last_read_at", { mode: "number" }),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [index("reading_progress_status_index").on(table.status)],
);

export const readingHistory = sqliteTable(
  "reading_history",
  {
    id: text("id").primaryKey(),
    mangaId: text("manga_id")
      .notNull()
      .references(() => manga.id, { onDelete: "cascade" }),
    chapterId: text("chapter_id").references(() => chapters.id, {
      onDelete: "cascade",
    }),
    provider: text("provider").notNull(),
    titleSnapshot: text("title_snapshot").notNull(),
    thumbnailSnapshot: text("thumbnail_snapshot"),
    readerParamsJson: text("reader_params_json").notNull(),
    openedAt: integer("opened_at", { mode: "number" }).notNull(),
    lastPageIndex: integer("last_page_index", { mode: "number" })
      .notNull()
      .default(0),
  },
  (table) => [
    index("reading_history_opened_index").on(table.openedAt),
    index("reading_history_manga_index").on(table.mangaId),
    uniqueIndex("reading_history_chapter_unique").on(table.chapterId),
  ],
);

export const appSettings = sqliteTable(
  "app_settings",
  {
    id: text("id").primaryKey(),
    settingsJson: text("settings_json").notNull(),
    ...timestamps,
  },
  (table) => [index("app_settings_updated_index").on(table.updatedAt)],
);

/**
 * Per-page translation records (the reader's DB cache).
 *
 * After a page has been translated the reader upserts one row here plus its
 * regions, keyed by (manga, page, source, target, prompt version). Revisiting
 * the same page with the same source -> target pair restores the overlay from
 * the DB instead of spending another OCR/translation pass. `prompt_version`
 * lets future prompt changes invalidate stale rows.
 */
export const translationPages = sqliteTable(
  "translation_pages",
  {
    id: text("id").primaryKey(),
    mangaId: text("manga_id").notNull(),
    chapterId: text("chapter_id"),
    /** Stable per-manga page key (the page url). */
    pageKey: text("page_key").notNull(),
    pageUrl: text("page_url").notNull(),
    sourceLanguage: text("source_language").notNull(),
    targetLanguage: text("target_language").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version").notNull(),
    imageWidth: integer("image_width", { mode: "number" }).notNull(),
    imageHeight: integer("image_height", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("translation_pages_identity_unique").on(
      table.mangaId,
      table.pageKey,
      table.sourceLanguage,
      table.targetLanguage,
      table.promptVersion,
    ),
    index("translation_pages_manga_index").on(table.mangaId, table.updatedAt),
  ],
);

export const translationRegions = sqliteTable(
  "translation_regions",
  {
    id: text("id").primaryKey(),
    pageId: text("page_id")
      .notNull()
      .references(() => translationPages.id, { onDelete: "cascade" }),
    regionId: integer("region_id", { mode: "number" }).notNull(),
    sourceText: text("source_text").notNull(),
    translatedText: text("translated_text"),
    /** kind + paste/erase boxes in natural page pixels (JSON). */
    geometryJson: text("geometry_json").notNull(),
    ...timestamps,
  },
  (table) => [index("translation_regions_page_index").on(table.pageId)],
);

/**
 * One downloaded chapter / gallery archive.
 *
 * The row is the source of truth for both the download queue and offline
 * reading: `status` drives the UI badges, `fileUri` points at the .cbz inside
 * the user-picked SAF folder, and `pagesDirUri` points at the per-page files
 * in the app cache that the reader actually renders while offline.
 */
export const downloads = sqliteTable(
  "downloads",
  {
    /** Canonical chapter id (`<provider>:<providerMangaId>:<providerChapterId>`). */
    id: text("id").primaryKey(),
    mangaId: text("manga_id").notNull(),
    provider: text("provider").notNull(),
    providerMangaId: text("provider_manga_id").notNull(),
    providerChapterId: text("provider_chapter_id").notNull(),
    /** Snapshot used by the offline "Downloaded" strips. */
    mangaTitle: text("manga_title").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    /** Local copy of the cover so the strip renders without a network. */
    thumbnailPath: text("thumbnail_path"),
    chapterTitle: text("chapter_title").notNull(),
    /** Display index (chapter number / upload index) used in the file name. */
    chapterIndex: text("chapter_index"),
    chapterNumber: integer("chapter_number", { mode: "number" }),
    scanlationGroup: text("scanlation_group"),
    chapterGroupKey: text("chapter_group_key"),
    languageCode: text("language_code"),
    pageCount: integer("page_count", { mode: "number" }),
    downloadedPages: integer("downloaded_pages", { mode: "number" })
      .notNull()
      .default(0),
    byteSize: integer("byte_size", { mode: "number" }),
    status: text("status", {
      enum: ["queued", "running", "paused", "failed", "completed"],
    })
      .notNull()
      .default("queued"),
    error: text("error"),
    /** SAF uri of the finished `.cbz` (null until the archive is written). */
    fileUri: text("file_uri"),
    fileName: text("file_name"),
    /** SAF folder that holds the archive: `<root>/downloads/<provider>/<manga>`. */
    folderUri: text("folder_uri"),
    /** App-cache directory holding the individual page files. */
    pagesDirUri: text("pages_dir_uri"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    index("downloads_manga_index").on(table.mangaId),
    index("downloads_provider_index").on(table.provider),
    index("downloads_status_index").on(table.status),
    index("downloads_updated_index").on(table.updatedAt),
  ],
);

/**
 * The one user-picked storage folder (SAF tree) every download is written to.
 * `treeUri` is the persisted `content://` uri; `downloadsDirUri` is the
 * `downloads/` child created inside it.
 */
export const downloadFolders = sqliteTable("download_folders", {
  id: text("id").primaryKey(),
  treeUri: text("tree_uri").notNull(),
  /** Display path such as "Internal storage/mangora". */
  label: text("label"),
  downloadsDirUri: text("downloads_dir_uri"),
  grantedAt: integer("granted_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});
/** One Gemini API attempt - the source of truth for RPM/TPM/RPD meters. */
export const translationUsage = sqliteTable(
  "translation_usage",
  {
    id: text("id").primaryKey(),
    model: text("model").notNull(),
    occurredAt: integer("occurred_at", { mode: "number" }).notNull(),
    success: integer("success", { mode: "boolean" }).notNull(),
    inputTokens: integer("input_tokens", { mode: "number" }),
    outputTokens: integer("output_tokens", { mode: "number" }),
    errorCode: text("error_code"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("translation_usage_model_time_index").on(table.model, table.occurredAt),
  ],
);
export const schema = {
  downloads,
  downloadFolders,
  libraries,
  manga,
  libraryManga,
  chapters,
  readingProgress,
  readingHistory,
  appSettings,
  translationPages,
  translationRegions,
  translationUsage,
};

export type Library = typeof libraries.$inferSelect;
export type NewLibrary = typeof libraries.$inferInsert;
export type Manga = typeof manga.$inferSelect;
export type NewManga = typeof manga.$inferInsert;
export type LibraryManga = typeof libraryManga.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type NewChapter = typeof chapters.$inferInsert;
export type ReadingProgress = typeof readingProgress.$inferSelect;
export type ReadingHistory = typeof readingHistory.$inferSelect;
export type AppSettingsRow = typeof appSettings.$inferSelect;
export type NewAppSettingsRow = typeof appSettings.$inferInsert;
export type TranslationPages = typeof translationPages.$inferSelect;
export type NewTranslationPages = typeof translationPages.$inferInsert;
export type TranslationRegions = typeof translationRegions.$inferSelect;
export type NewTranslationRegions = typeof translationRegions.$inferInsert;
export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
export type DownloadFolder = typeof downloadFolders.$inferSelect;
export type NewDownloadFolder = typeof downloadFolders.$inferInsert;
export type TranslationUsage = typeof translationUsage.$inferSelect;
export type NewTranslationUsage = typeof translationUsage.$inferInsert;

