type MigrationConfig = {
  journal: {
    entries: {
      idx: number;
      when: number;
      tag: string;
      breakpoints: boolean;
    }[];
  };
  migrations: Record<string, string>;
};

/** Bundled migration payload consumed by the Expo SQLite Drizzle migrator. */
const migrations: MigrationConfig = {
  journal: {
    entries: [
      {
        idx: 0,
        when: 1788536734407,
        tag: "0000_cheerful_lenny_balinger",
        breakpoints: true,
      },
      {
        idx: 1,
        when: 1788536986670,
        tag: "0001_cloudy_boomerang",
        breakpoints: true,
      },
      {
        idx: 2,
        when: 1788704917598,
        tag: "0002_chapter_scanlation_groups",
        breakpoints: true,
      },
      {
        idx: 3,
        when: 1788719057972,
        tag: "0003_sad_komodo",
        breakpoints: true,
      },
      {
        idx: 4,
        when: 1788801204374,
        tag: "0004_left_morlun",
        breakpoints: true,
      },      {
        idx: 5,
        when: 1789291591838,
        tag: "0005_download_library",
        breakpoints: true,
      },
      {
        idx: 6,
        when: 1792550000000,
        tag: "0006_reader_cache",
        breakpoints: true,
      },
    ],
  },
  migrations: {
    m0000: `CREATE TABLE \`chapters\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`manga_id\` text NOT NULL,
\t\`provider_chapter_id\` text NOT NULL,
\t\`title\` text NOT NULL,
\t\`chapter_number\` integer,
\t\`volume\` text,
\t\`language_code\` text,
\t\`page_count\` integer,
\t\`published_at\` integer,
\t\`last_synced_at\` integer,
\t\`created_at\` integer NOT NULL,
\t\`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`chapters_manga_provider_identity_unique\` ON \`chapters\` (\`manga_id\`,\`provider_chapter_id\`);--> statement-breakpoint
CREATE INDEX \`chapters_manga_index\` ON \`chapters\` (\`manga_id\`);--> statement-breakpoint
CREATE INDEX \`chapters_manga_number_index\` ON \`chapters\` (\`manga_id\`,\`chapter_number\`);--> statement-breakpoint
CREATE TABLE \`libraries\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`name\` text NOT NULL,
\t\`created_at\` integer NOT NULL,
\t\`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`libraries_name_unique\` ON \`libraries\` (\`name\`);--> statement-breakpoint
CREATE TABLE \`library_manga\` (
\t\`library_id\` text NOT NULL,
\t\`manga_id\` text NOT NULL,
\t\`added_at\` integer NOT NULL,
\t\`pinned\` integer DEFAULT false NOT NULL,
\tPRIMARY KEY(\`library_id\`, \`manga_id\`),
\tFOREIGN KEY (\`library_id\`) REFERENCES \`libraries\`(\`id\`) ON UPDATE no action ON DELETE cascade,
\tFOREIGN KEY (\`manga_id\`) REFERENCES \`manga\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`library_manga_library_index\` ON \`library_manga\` (\`library_id\`);--> statement-breakpoint
CREATE INDEX \`library_manga_manga_index\` ON \`library_manga\` (\`manga_id\`);--> statement-breakpoint
CREATE TABLE \`manga\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`provider\` text NOT NULL,
\t\`provider_manga_id\` text NOT NULL,
\t\`title\` text NOT NULL,
\t\`thumbnail_url\` text,
\t\`description\` text,
\t\`added_at\` integer NOT NULL,
\t\`last_synced_at\` integer,
\t\`last_sync_error\` text,
\t\`created_at\` integer NOT NULL,
\t\`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`manga_provider_identity_unique\` ON \`manga\` (\`provider\`,\`provider_manga_id\`);--> statement-breakpoint
CREATE INDEX \`manga_provider_index\` ON \`manga\` (\`provider\`);--> statement-breakpoint
CREATE INDEX \`manga_last_synced_index\` ON \`manga\` (\`last_synced_at\`);--> statement-breakpoint
CREATE TABLE \`reading_history\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`manga_id\` text NOT NULL,
\t\`chapter_id\` text,
\t\`provider\` text NOT NULL,
\t\`title_snapshot\` text NOT NULL,
\t\`thumbnail_snapshot\` text,
\t\`opened_at\` integer NOT NULL,
\t\`last_page_index\` integer DEFAULT 0 NOT NULL,
\tFOREIGN KEY (\`manga_id\`) REFERENCES \`manga\`(\`id\`) ON UPDATE no action ON DELETE cascade,
\tFOREIGN KEY (\`chapter_id\`) REFERENCES \`chapters\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`reading_history_opened_index\` ON \`reading_history\` (\`opened_at\`);--> statement-breakpoint
CREATE INDEX \`reading_history_manga_index\` ON \`reading_history\` (\`manga_id\`);--> statement-breakpoint
CREATE UNIQUE INDEX \`reading_history_chapter_unique\` ON \`reading_history\` (\`chapter_id\`);--> statement-breakpoint
CREATE TABLE \`reading_progress\` (
\t\`chapter_id\` text PRIMARY KEY NOT NULL,
\t\`status\` text DEFAULT 'unread' NOT NULL,
\t\`last_page_index\` integer DEFAULT 0 NOT NULL,
\t\`last_page_count\` integer,
\t\`started_at\` integer,
\t\`last_read_at\` integer,
\t\`completed_at\` integer,
\tFOREIGN KEY (\`chapter_id\`) REFERENCES \`chapters\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`reading_progress_status_index\` ON \`reading_progress\` (\`status\`);`,
  m0001: "ALTER TABLE `reading_history` ADD `reader_params_json` text NOT NULL DEFAULT '';",
  m0002: `ALTER TABLE \`chapters\` ADD \`scanlation_group\` text;
--> statement-breakpoint
ALTER TABLE \`chapters\` ADD \`chapter_group_key\` text;
--> statement-breakpoint
CREATE INDEX \`chapters_manga_group_index\` ON \`chapters\` (\`manga_id\`,\`chapter_group_key\`);
--> statement-breakpoint
UPDATE \`chapters\` SET \`chapter_group_key\` = CAST(\`chapter_number\` AS TEXT) WHERE \`chapter_group_key\` IS NULL AND \`chapter_number\` IS NOT NULL;`,
  m0003: `CREATE TABLE \`app_settings\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`settings_json\` text NOT NULL,
\t\`created_at\` integer NOT NULL,
\t\`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX \`app_settings_updated_index\` ON \`app_settings\` (\`updated_at\`);`,
  m0004: `CREATE TABLE \`translation_pages\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`manga_id\` text NOT NULL,
\t\`chapter_id\` text,
\t\`page_key\` text NOT NULL,
\t\`page_url\` text NOT NULL,
\t\`source_language\` text NOT NULL,
\t\`target_language\` text NOT NULL,
\t\`model\` text,
\t\`prompt_version\` text NOT NULL,
\t\`image_width\` integer NOT NULL,
\t\`image_height\` integer NOT NULL,
\t\`created_at\` integer NOT NULL,
\t\`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`translation_pages_identity_unique\` ON \`translation_pages\` (\`manga_id\`,\`page_key\`,\`source_language\`,\`target_language\`,\`prompt_version\`);--> statement-breakpoint
CREATE INDEX \`translation_pages_manga_index\` ON \`translation_pages\` (\`manga_id\`,\`updated_at\`);--> statement-breakpoint
CREATE TABLE \`translation_regions\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`page_id\` text NOT NULL,
\t\`region_id\` integer NOT NULL,
\t\`source_text\` text NOT NULL,
\t\`translated_text\` text,
\t\`geometry_json\` text NOT NULL,
\t\`created_at\` integer NOT NULL,
\t\`updated_at\` integer NOT NULL,
\tFOREIGN KEY (\`page_id\`) REFERENCES \`translation_pages\`(\`id\`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX \`translation_regions_page_index\` ON \`translation_regions\` (\`page_id\`);--> statement-breakpoint
CREATE TABLE \`translation_usage\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`model\` text NOT NULL,
\t\`occurred_at\` integer NOT NULL,
\t\`success\` integer NOT NULL,
\t\`input_tokens\` integer,
\t\`output_tokens\` integer,
\t\`error_code\` text,
\t\`created_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX \`translation_usage_model_time_index\` ON \`translation_usage\` (\`model\`,\`occurred_at\`);`,
  m0005: `CREATE TABLE \`download_folders\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`tree_uri\` text NOT NULL,
	\`label\` text,
	\`downloads_dir_uri\` text,
	\`granted_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE \`downloads\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`manga_id\` text NOT NULL,
	\`provider\` text NOT NULL,
	\`provider_manga_id\` text NOT NULL,
	\`provider_chapter_id\` text NOT NULL,
	\`manga_title\` text NOT NULL,
	\`thumbnail_url\` text,
	\`thumbnail_path\` text,
	\`chapter_title\` text NOT NULL,
	\`chapter_index\` text,
	\`chapter_number\` integer,
	\`scanlation_group\` text,
	\`chapter_group_key\` text,
	\`language_code\` text,
	\`page_count\` integer,
	\`downloaded_pages\` integer DEFAULT 0 NOT NULL,
	\`byte_size\` integer,
	\`status\` text DEFAULT 'queued' NOT NULL,
	\`error\` text,
	\`file_uri\` text,
	\`file_name\` text,
	\`folder_uri\` text,
	\`pages_dir_uri\` text,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL,
	\`completed_at\` integer
);
--> statement-breakpoint
CREATE INDEX \`downloads_manga_index\` ON \`downloads\` (\`manga_id\`);--> statement-breakpoint
CREATE INDEX \`downloads_provider_index\` ON \`downloads\` (\`provider\`);--> statement-breakpoint
CREATE INDEX \`downloads_status_index\` ON \`downloads\` (\`status\`);--> statement-breakpoint
CREATE INDEX \`downloads_updated_index\` ON \`downloads\` (\`updated_at\`);`,
  m0006: `CREATE TABLE \`reader_cache_chapters\` (
\t\`id\` text PRIMARY KEY NOT NULL,
\t\`source\` text NOT NULL,
\t\`provider_manga_id\` text NOT NULL,
\t\`provider_chapter_id\` text NOT NULL,
\t\`manga_id\` text NOT NULL,
\t\`chapter_id\` text NOT NULL,
\t\`manga_title\` text,
\t\`chapter_title\` text,
\t\`manga_key\` text NOT NULL,
\t\`chapter_key\` text NOT NULL,
\t\`directory_uri\` text NOT NULL,
\t\`page_count\` integer DEFAULT 0 NOT NULL,
\t\`byte_size\` integer DEFAULT 0 NOT NULL,
\t\`complete\` integer DEFAULT false NOT NULL,
\t\`last_accessed_at\` integer NOT NULL,
\t\`created_at\` integer NOT NULL,
\t\`updated_at\` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX \`reader_cache_chapter_identity_unique\` ON \`reader_cache_chapters\` (\`chapter_id\`);--> statement-breakpoint
CREATE INDEX \`reader_cache_last_accessed_index\` ON \`reader_cache_chapters\` (\`last_accessed_at\`);`,
  },
};

export default migrations;
