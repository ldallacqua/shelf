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
	CONSTRAINT "entries_status" CHECK("__new_entries"."status" in ('playing', 'backlog', 'someday', 'completed', 'retired', 'dropped', 'wishlist', 'unsorted')),
	CONSTRAINT "entries_rating" CHECK("__new_entries"."rating" is null or ("__new_entries"."rating" between 0 and 100))
);
--> statement-breakpoint
INSERT INTO `__new_entries`("id", "user_id", "status", "rating", "notes", "notes_public", "featured", "display_copy_id", "added_at", "completed_on", "created_at", "updated_at") SELECT "id", "user_id", "status", "rating", "notes", "notes_public", "featured", "display_copy_id", "added_at", "completed_on", "created_at", "updated_at" FROM `entries`;--> statement-breakpoint
DROP TABLE `entries`;--> statement-breakpoint
ALTER TABLE `__new_entries` RENAME TO `entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `entries_user` ON `entries` (`user_id`);