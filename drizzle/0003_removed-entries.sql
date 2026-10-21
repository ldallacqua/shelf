CREATE TABLE `removed_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`title` text NOT NULL,
	`snapshot` text NOT NULL,
	`removed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `removed_entries_at` ON `removed_entries` (`removed_at`);