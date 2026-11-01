ALTER TABLE `translation_usage` ADD COLUMN `provider` text DEFAULT 'gemini' NOT NULL;--> statement-breakpoint
ALTER TABLE `translation_usage` ADD COLUMN `endpoint_key` text DEFAULT 'gemini' NOT NULL;--> statement-breakpoint
CREATE INDEX `translation_usage_endpoint_time_index` ON `translation_usage` (`provider`,`endpoint_key`,`occurred_at`);
