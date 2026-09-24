CREATE TABLE `piece_progress` (
	`piece_key` text NOT NULL,
	`phrase_index` integer NOT NULL,
	`best_score` real DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `piece_progress_key_idx` ON `piece_progress` (`piece_key`,`phrase_index`);--> statement-breakpoint
CREATE TABLE `pieces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`bpm` integer NOT NULL,
	`beats_per_bar` integer NOT NULL,
	`total_beats` real NOT NULL,
	`data` text NOT NULL
);
