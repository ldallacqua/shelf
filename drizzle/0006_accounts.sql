CREATE TABLE `libraries` (
	`user_id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `libraries_key_unique` ON `libraries` (`key`);--> statement-breakpoint
DROP INDEX `shelves_slug`;--> statement-breakpoint
ALTER TABLE `shelves` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `shelves_user_slug` ON `shelves` (`user_id`,`slug`);--> statement-breakpoint
DROP INDEX `tags_slug`;--> statement-breakpoint
ALTER TABLE `tags` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_slug` ON `tags` (`user_id`,`slug`);--> statement-breakpoint
DROP INDEX `entry_versions_game`;--> statement-breakpoint
ALTER TABLE `entry_versions` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_versions_user_game` ON `entry_versions` (`user_id`,`game_id`);--> statement-breakpoint
CREATE INDEX `entry_versions_game` ON `entry_versions` (`game_id`);--> statement-breakpoint
ALTER TABLE `entries` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `entries_user` ON `entries` (`user_id`);--> statement-breakpoint
ALTER TABLE `removed_entries` ADD `user_id` text REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `removed_entries_user` ON `removed_entries` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `username` text;--> statement-breakpoint
ALTER TABLE `users` ADD `shelf_public` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);