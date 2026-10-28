CREATE TABLE `achievement_progress` (
	`user_id` text NOT NULL,
	`set_id` text NOT NULL,
	`external_id` text NOT NULL,
	`copy_id` text NOT NULL,
	`read_at` integer,
	`played_at` integer,
	`tried_at` integer NOT NULL,
	`problem` text,
	PRIMARY KEY(`user_id`, `set_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_id`) REFERENCES `achievement_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`copy_id`) REFERENCES `copies`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "achievement_progress_problem" CHECK("achievement_progress"."problem" is null or "achievement_progress"."problem" in ('private', 'unreachable'))
);
--> statement-breakpoint
CREATE INDEX `achievement_progress_copy` ON `achievement_progress` (`copy_id`);--> statement-breakpoint
CREATE TABLE `achievement_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_set_id` text NOT NULL,
	`title` text,
	`count` integer,
	`defined_at` integer,
	`changed_at` integer,
	`rates_at` integer,
	`tried_at` integer,
	`failed` integer DEFAULT false NOT NULL,
	CONSTRAINT "achievement_sets_provider" CHECK("achievement_sets"."provider" in ('steam')),
	CONSTRAINT "achievement_sets_count" CHECK("achievement_sets"."count" is null or "achievement_sets"."count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievement_sets_provider_game` ON `achievement_sets` (`provider`,`provider_set_id`);--> statement-breakpoint
CREATE TABLE `achievement_unlocks` (
	`user_id` text NOT NULL,
	`set_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`unlocked_at` integer,
	PRIMARY KEY(`user_id`, `set_id`, `achievement_id`),
	FOREIGN KEY (`user_id`,`set_id`) REFERENCES `achievement_progress`(`user_id`,`set_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`set_id`,`achievement_id`) REFERENCES `achievements`(`set_id`,`achievement_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `achievements` (
	`set_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`translations` text,
	`icon` text,
	`icon_locked` text,
	`hidden` integer DEFAULT false NOT NULL,
	`rate` real,
	`first_seen_at` integer NOT NULL,
	PRIMARY KEY(`set_id`, `achievement_id`),
	FOREIGN KEY (`set_id`) REFERENCES `achievement_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "achievements_rate" CHECK("achievements"."rate" is null or ("achievements"."rate" between 0 and 100))
);
