ALTER TABLE `games` ADD `steam_app_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `games_steam_app` ON `games` (`steam_app_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `moderator` integer DEFAULT false NOT NULL;