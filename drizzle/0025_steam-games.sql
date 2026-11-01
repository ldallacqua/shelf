ALTER TABLE `games` ADD `steam_app_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `games_steam_app` ON `games` (`steam_app_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `moderator` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- The owner, 1 Nov 2026: "pode ser alguma flag no banco de moderador ou algo assim pra deixar a
-- gente adicionar". Only their account has `refresh_all` (migration 0019). Nothing where it is not.
UPDATE `users` SET `moderator` = true WHERE `refresh_all` = true;
