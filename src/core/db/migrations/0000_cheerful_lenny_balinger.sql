CREATE TABLE `chapters` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`provider_chapter_id` text NOT NULL,
	`title` text NOT NULL,
	`chapter_number` integer,
	`volume` text,
	`language_code` text,
	`page_count` integer,
	`published_at` integer,
	`last_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_manga_provider_identity_unique` ON `chapters` (`manga_id`,`provider_chapter_id`);--> statement-breakpoint
CREATE INDEX `chapters_manga_index` ON `chapters` (`manga_id`);--> statement-breakpoint
CREATE INDEX `chapters_manga_number_index` ON `chapters` (`manga_id`,`chapter_number`);--> statement-breakpoint
CREATE TABLE `libraries` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `libraries_name_unique` ON `libraries` (`name`);--> statement-breakpoint
CREATE TABLE `library_manga` (
	`library_id` text NOT NULL,
	`manga_id` text NOT NULL,
	`added_at` integer NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`library_id`, `manga_id`),
	FOREIGN KEY (`library_id`) REFERENCES `libraries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `library_manga_library_index` ON `library_manga` (`library_id`);--> statement-breakpoint
CREATE INDEX `library_manga_manga_index` ON `library_manga` (`manga_id`);--> statement-breakpoint
CREATE TABLE `manga` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_manga_id` text NOT NULL,
	`title` text NOT NULL,
	`thumbnail_url` text,
	`description` text,
	`added_at` integer NOT NULL,
	`last_synced_at` integer,
	`last_sync_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manga_provider_identity_unique` ON `manga` (`provider`,`provider_manga_id`);--> statement-breakpoint
CREATE INDEX `manga_provider_index` ON `manga` (`provider`);--> statement-breakpoint
CREATE INDEX `manga_last_synced_index` ON `manga` (`last_synced_at`);--> statement-breakpoint
CREATE TABLE `reading_history` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`chapter_id` text,
	`provider` text NOT NULL,
	`title_snapshot` text NOT NULL,
	`thumbnail_snapshot` text,
	`opened_at` integer NOT NULL,
	`last_page_index` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`manga_id`) REFERENCES `manga`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reading_history_opened_index` ON `reading_history` (`opened_at`);--> statement-breakpoint
CREATE INDEX `reading_history_manga_index` ON `reading_history` (`manga_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reading_history_chapter_unique` ON `reading_history` (`chapter_id`);--> statement-breakpoint
CREATE TABLE `reading_progress` (
	`chapter_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'unread' NOT NULL,
	`last_page_index` integer DEFAULT 0 NOT NULL,
	`last_page_count` integer,
	`started_at` integer,
	`last_read_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reading_progress_status_index` ON `reading_progress` (`status`);