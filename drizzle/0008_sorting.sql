PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`status` text NOT NULL,
	`rating` integer,
	`notes` text,
	`notes_public` integer DEFAULT false NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`display_copy_id` text,
	`added_at` integer NOT NULL,
	`completed_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "entries_status" CHECK("__new_entries"."status" in ('playing', 'backlog', 'completed', 'dropped', 'wishlist', 'unsorted')),
	CONSTRAINT "entries_rating" CHECK("__new_entries"."rating" is null or ("__new_entries"."rating" between 0 and 100))
);
--> statement-breakpoint
INSERT INTO `__new_entries`("id", "user_id", "status", "rating", "notes", "notes_public", "featured", "display_copy_id", "added_at", "completed_on", "created_at", "updated_at") SELECT "id", "user_id", "status", "rating", "notes", "notes_public", "featured", "display_copy_id", "added_at", "completed_on", "created_at", "updated_at" FROM `entries`;--> statement-breakpoint
DROP TABLE `entries`;--> statement-breakpoint
ALTER TABLE `__new_entries` RENAME TO `entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `entries_user` ON `entries` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_source_items` (
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
	`kind` text,
	`parent_store_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`copy_id`) REFERENCES `copies`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "source_items_source" CHECK("__new_source_items"."source" in ('steam', 'playstation', 'xbox', 'nintendo')),
	CONSTRAINT "source_items_evidence" CHECK("__new_source_items"."evidence" in ('owned', 'played', 'listed')),
	CONSTRAINT "source_items_decision" CHECK("__new_source_items"."decision" in ('pending', 'copy', 'not_mine', 'not_a_game', 'removed')),
	CONSTRAINT "source_items_resolved_by" CHECK("__new_source_items"."resolved_by" is null or "__new_source_items"."resolved_by" in ('store_id', 'title', 'owner')),
	CONSTRAINT "source_items_format" CHECK("__new_source_items"."format" is null or "__new_source_items"."format" in ('physical', 'digital', 'subscription')),
	CONSTRAINT "source_items_minutes" CHECK("__new_source_items"."minutes" >= 0),
	CONSTRAINT "source_items_kind" CHECK("__new_source_items"."kind" is null or "__new_source_items"."kind" in ('game', 'demo', 'software', 'media', 'part', 'unknown'))
);
--> statement-breakpoint
INSERT INTO `__new_source_items`("id", "user_id", "source", "store_id", "title", "platform_id", "year", "evidence", "minutes", "last_played_at", "first_seen_at", "last_seen_at", "igdb_id", "resolved_by", "title_tried_at", "decision", "format", "copy_id", "decided_at", "kind", "parent_store_id") SELECT "id", "user_id", "source", "store_id", "title", "platform_id", "year", "evidence", "minutes", "last_played_at", "first_seen_at", "last_seen_at", "igdb_id", "resolved_by", "title_tried_at", "decision", "format", "copy_id", "decided_at", NULL, NULL FROM `source_items`;--> statement-breakpoint
DROP TABLE `source_items`;--> statement-breakpoint
ALTER TABLE `__new_source_items` RENAME TO `source_items`;--> statement-breakpoint
CREATE UNIQUE INDEX `source_items_user_store` ON `source_items` (`user_id`,`source`,`store_id`);--> statement-breakpoint
CREATE INDEX `source_items_copy` ON `source_items` (`copy_id`);--> statement-breakpoint
-- A game a sync put in the backlog, untouched since, was never mine to call backlog: it is
-- unsorted (ADR 003, decision 2 as amended). Only entries made after their library linked
-- that source, fed by it, and never edited.
UPDATE `entries` SET `status` = 'unsorted'
WHERE `status` = 'backlog'
  AND `created_at` = `updated_at`
  AND EXISTS (
    SELECT 1 FROM `copies`
    JOIN `source_items` ON `source_items`.`copy_id` = `copies`.`id`
    JOIN `platform_links` ON `platform_links`.`user_id` = `source_items`.`user_id`
      AND `platform_links`.`source` = `source_items`.`source`
    WHERE `copies`.`entry_id` = `entries`.`id`
      AND `entries`.`created_at` >= `platform_links`.`linked_at`
  );--> statement-breakpoint
-- Those libraries' data files are addressed by version, and kept a year: new addresses.
UPDATE `libraries` SET `version` = `version` + 1
WHERE `user_id` IN (SELECT DISTINCT `user_id` FROM `entries` WHERE `status` = 'unsorted');