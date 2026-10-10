CREATE TABLE `translation_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`manga_id` text NOT NULL,
	`chapter_id` text,
	`page_key` text NOT NULL,
	`page_url` text NOT NULL,
	`source_language` text NOT NULL,
	`target_language` text NOT NULL,
	`model` text,
	`prompt_version` text NOT NULL,
	`image_width` integer NOT NULL,
	`image_height` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `translation_pages_identity_unique` ON `translation_pages` (`manga_id`,`page_key`,`source_language`,`target_language`,`prompt_version`);--> statement-breakpoint
CREATE INDEX `translation_pages_manga_index` ON `translation_pages` (`manga_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `translation_regions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`region_id` integer NOT NULL,
	`source_text` text NOT NULL,
	`translated_text` text,
	`geometry_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `translation_pages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `translation_regions_page_index` ON `translation_regions` (`page_id`);--> statement-breakpoint
CREATE TABLE `translation_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`success` integer NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`error_code` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `translation_usage_model_time_index` ON `translation_usage` (`model`,`occurred_at`);