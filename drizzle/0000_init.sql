CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer,
	`mode` text NOT NULL,
	`created_at` integer NOT NULL,
	`instrument_id` text NOT NULL,
	`target` text NOT NULL,
	`answer` text NOT NULL,
	`correct` integer NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`response_ms` integer NOT NULL,
	`replays` integer DEFAULT 0 NOT NULL,
	`target_pitch_class` integer,
	`target_octave` integer,
	`answer_pitch_class` integer,
	`answer_octave` integer,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `attempts_created_at_idx` ON `attempts` (`created_at`);--> statement-breakpoint
CREATE INDEX `attempts_mode_idx` ON `attempts` (`mode`);--> statement-breakpoint
CREATE INDEX `attempts_instrument_idx` ON `attempts` (`instrument_id`);--> statement-breakpoint
CREATE INDEX `attempts_session_idx` ON `attempts` (`session_id`);--> statement-breakpoint
CREATE TABLE `recordings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`name` text NOT NULL,
	`instrument_id` text NOT NULL,
	`bpm` integer,
	`duration_ms` integer NOT NULL,
	`events` text NOT NULL,
	`source_ref` text
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mode` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`settings` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
