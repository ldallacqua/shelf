ALTER TABLE `games` ADD `steam_reviews` text;--> statement-breakpoint
ALTER TABLE `games` ADD `steam_reviews_checked_at` integer;--> statement-breakpoint
CREATE INDEX `games_steam_reviews_checked_at` ON `games` (`steam_reviews_checked_at`);