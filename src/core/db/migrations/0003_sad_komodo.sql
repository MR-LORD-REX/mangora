CREATE TABLE `app_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`settings_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `app_settings_updated_index` ON `app_settings` (`updated_at`);