CREATE TABLE `devices` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text,
	`first_seen_at` integer,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `play_sessions` ADD `device_id` text;