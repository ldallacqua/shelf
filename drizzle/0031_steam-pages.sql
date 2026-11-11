ALTER TABLE `games` ADD `steam_cover` text;--> statement-breakpoint
ALTER TABLE `games` ADD `steam_colors` text;--> statement-breakpoint
ALTER TABLE `games` ADD `steam_thumbhash` text;--> statement-breakpoint
ALTER TABLE `games` ADD `steam_page` text;--> statement-breakpoint
ALTER TABLE `games` ADD `steam_page_checked_at` integer;--> statement-breakpoint
CREATE INDEX `games_steam_page_checked_at` ON `games` (`steam_page_checked_at`);