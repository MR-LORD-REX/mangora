ALTER TABLE `chapters` ADD `scanlation_group` text;--> statement-breakpoint
ALTER TABLE `chapters` ADD `chapter_group_key` text;--> statement-breakpoint
CREATE INDEX `chapters_manga_group_index` ON `chapters` (`manga_id`,`chapter_group_key`);--> statement-breakpoint
UPDATE `chapters` SET `chapter_group_key` = CAST(`chapter_number` AS TEXT) WHERE `chapter_group_key` IS NULL AND `chapter_number` IS NOT NULL;