PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_platform_links` (
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text,
	`daily` integer DEFAULT true NOT NULL,
	`linked_at` integer NOT NULL,
	`read_at` integer,
	`synced_at` integer,
	`problem` text,
	`secret` text,
	PRIMARY KEY(`user_id`, `source`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "platform_links_source" CHECK("__new_platform_links"."source" in ('steam', 'playstation', 'xbox', 'nintendo')),
	CONSTRAINT "platform_links_problem" CHECK("__new_platform_links"."problem" is null or "__new_platform_links"."problem" in ('private', 'unreachable', 'unset', 'signed-out'))
);
--> statement-breakpoint
INSERT INTO `__new_platform_links`("user_id", "source", "external_id", "name", "daily", "linked_at", "read_at", "synced_at", "problem", "secret") SELECT "user_id", "source", "external_id", "name", "daily", "linked_at", "read_at", "synced_at", "problem", NULL FROM `platform_links`;--> statement-breakpoint
DROP TABLE `platform_links`;--> statement-breakpoint
ALTER TABLE `__new_platform_links` RENAME TO `platform_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `platform_links_synced` ON `platform_links` (`synced_at`);