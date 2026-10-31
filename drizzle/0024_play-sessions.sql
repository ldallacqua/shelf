CREATE TABLE `play_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`seconds` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "play_sessions_seconds" CHECK("play_sessions"."seconds" >= 0)
);
--> statement-breakpoint
CREATE INDEX `play_sessions_entry` ON `play_sessions` (`entry_id`);