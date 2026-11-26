ALTER TABLE `attempts` ADD `level_id` text;--> statement-breakpoint
ALTER TABLE `attempts` ADD `drill_id` text;--> statement-breakpoint
CREATE INDEX `attempts_drill_idx` ON `attempts` (`drill_id`,`created_at`);