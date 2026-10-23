CREATE TABLE `platform_links` (
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`name` text,
	`daily` integer DEFAULT true NOT NULL,
	`linked_at` integer NOT NULL,
	`read_at` integer,
	`synced_at` integer,
	`problem` text,
	PRIMARY KEY(`user_id`, `source`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "platform_links_source" CHECK("platform_links"."source" in ('steam', 'playstation', 'xbox', 'nintendo')),
	CONSTRAINT "platform_links_problem" CHECK("platform_links"."problem" is null or "platform_links"."problem" in ('private', 'unreachable', 'unset'))
);
--> statement-breakpoint
CREATE INDEX `platform_links_synced` ON `platform_links` (`synced_at`);--> statement-breakpoint
CREATE TABLE `source_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`store_id` text NOT NULL,
	`title` text NOT NULL,
	`platform_id` integer,
	`year` integer,
	`evidence` text NOT NULL,
	`minutes` integer DEFAULT 0 NOT NULL,
	`last_played_at` integer,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`igdb_id` integer,
	`resolved_by` text,
	`title_tried_at` integer,
	`decision` text DEFAULT 'pending' NOT NULL,
	`format` text,
	`copy_id` text,
	`decided_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`copy_id`) REFERENCES `copies`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "source_items_source" CHECK("source_items"."source" in ('steam', 'playstation', 'xbox', 'nintendo')),
	CONSTRAINT "source_items_evidence" CHECK("source_items"."evidence" in ('owned', 'played', 'listed')),
	CONSTRAINT "source_items_decision" CHECK("source_items"."decision" in ('pending', 'copy', 'not_mine', 'not_a_game', 'removed')),
	CONSTRAINT "source_items_resolved_by" CHECK("source_items"."resolved_by" is null or "source_items"."resolved_by" in ('store_id', 'title', 'owner')),
	CONSTRAINT "source_items_format" CHECK("source_items"."format" is null or "source_items"."format" in ('physical', 'digital', 'subscription')),
	CONSTRAINT "source_items_minutes" CHECK("source_items"."minutes" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_items_user_store` ON `source_items` (`user_id`,`source`,`store_id`);--> statement-breakpoint
CREATE INDEX `source_items_copy` ON `source_items` (`copy_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_play_time` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`copy_id` text,
	`source` text NOT NULL,
	`minutes` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`copy_id`) REFERENCES `copies`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "play_time_source" CHECK("__new_play_time"."source" in ('manual', 'steam', 'playstation', 'xbox', 'nintendo')),
	CONSTRAINT "play_time_minutes" CHECK("__new_play_time"."minutes" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_play_time`("id", "entry_id", "copy_id", "source", "minutes", "updated_at") SELECT "id", "entry_id", "copy_id", "source", "minutes", "updated_at" FROM `play_time`;--> statement-breakpoint
DROP TABLE `play_time`;--> statement-breakpoint
ALTER TABLE `__new_play_time` RENAME TO `play_time`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `play_time_entry` ON `play_time` (`entry_id`);