CREATE TABLE `download_folders` (
	`id` text PRIMARY KEY NOT NULL,
	`tree_uri` text NOT NULL,
	`label` text,
	`downloads_dir_uri` text,
	`granted_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `downloads` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_manga_id` text NOT NULL,
	`provider_chapter_id` text NOT NULL,
	`manga_title` text NOT NULL,
	`thumbnail_url` text,
	`thumbnail_path` text,
	`chapter_title` text NOT NULL,
	`chapter_index` text,
	`chapter_number` integer,
	`scanlation_group` text,
	`chapter_group_key` text,
	`language_code` text,
	`page_count` integer,
	`downloaded_pages` integer DEFAULT 0 NOT NULL,
	`byte_size` integer,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`file_uri` text,
	`file_name` text,
	`folder_uri` text,
	`pages_dir_uri` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
CREATE INDEX `downloads_manga_index` ON `downloads` (`manga_id`);--> statement-breakpoint
CREATE INDEX `downloads_provider_index` ON `downloads` (`provider`);--> statement-breakpoint
CREATE INDEX `downloads_status_index` ON `downloads` (`status`);--> statement-breakpoint
CREATE INDEX `downloads_updated_index` ON `downloads` (`updated_at`);