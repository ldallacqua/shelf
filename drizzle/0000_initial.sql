CREATE TABLE `copies` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`platform_id` integer NOT NULL,
	`format` text NOT NULL,
	`game_id` text,
	`acquired_on` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`platform_id`) REFERENCES `platforms`(`igdb_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "copies_format" CHECK("copies"."format" in ('physical', 'digital'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `copies_one_per_platform_and_format` ON `copies` (`entry_id`,`platform_id`,`format`);--> statement-breakpoint
CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
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
	CONSTRAINT "entries_status" CHECK("entries"."status" in ('playing', 'backlog', 'completed', 'dropped', 'wishlist')),
	CONSTRAINT "entries_rating" CHECK("entries"."rating" is null or ("entries"."rating" between 0 and 100))
);
--> statement-breakpoint
CREATE TABLE `entry_tags` (
	`entry_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`entry_id`, `tag_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `entry_versions` (
	`entry_id` text NOT NULL,
	`game_id` text NOT NULL,
	`relation` text NOT NULL,
	PRIMARY KEY(`entry_id`, `game_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "entry_versions_relation" CHECK("entry_versions"."relation" in ('primary', 'edition', 'port', 'remaster', 'expanded', 'remake', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_versions_game` ON `entry_versions` (`game_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `entry_versions_one_primary` ON `entry_versions` (`entry_id`) WHERE "entry_versions"."relation" = 'primary';--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`igdb_id` integer,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`version_title` text,
	`released_on` text,
	`year` integer,
	`cover` text,
	`colors` text,
	`thumbhash` text,
	`summary` text,
	`storyline` text,
	`igdb_rating` integer,
	`igdb_rating_count` integer DEFAULT 0 NOT NULL,
	`length` text,
	`genres` text DEFAULT '[]' NOT NULL,
	`themes` text DEFAULT '[]' NOT NULL,
	`modes` text DEFAULT '[]' NOT NULL,
	`perspectives` text DEFAULT '[]' NOT NULL,
	`platforms` text DEFAULT '[]' NOT NULL,
	`franchises` text DEFAULT '[]' NOT NULL,
	`series` text DEFAULT '[]' NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`developers` text DEFAULT '[]' NOT NULL,
	`publishers` text DEFAULT '[]' NOT NULL,
	`screenshots` text DEFAULT '[]' NOT NULL,
	`artworks` text DEFAULT '[]' NOT NULL,
	`releases` text DEFAULT '[]' NOT NULL,
	`store_ids` text DEFAULT '[]' NOT NULL,
	`lineage` text DEFAULT '[]' NOT NULL,
	`igdb_url` text,
	`igdb_updated_at` integer,
	`fetched_at` integer NOT NULL,
	`checked_at` integer NOT NULL,
	CONSTRAINT "games_kind" CHECK("games"."kind" in ('main', 'remake', 'remaster', 'expanded', 'port', 'bundle', 'expansion', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `games_igdb_id` ON `games` (`igdb_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `games_slug` ON `games` (`slug`);--> statement-breakpoint
CREATE INDEX `games_checked_at` ON `games` (`checked_at`);--> statement-breakpoint
CREATE TABLE `igdb_token` (
	`id` integer PRIMARY KEY NOT NULL,
	`access_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "igdb_token_one_row" CHECK("igdb_token"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `library_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "library_meta_one_row" CHECK("library_meta"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `platforms` (
	`igdb_id` integer PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`short` text NOT NULL,
	`family` text NOT NULL,
	`generation` integer,
	`shape` text NOT NULL,
	`plastic` text NOT NULL,
	CONSTRAINT "platforms_family" CHECK("platforms"."family" in ('playstation', 'xbox', 'nintendo', 'pc', 'sega', 'other')),
	CONSTRAINT "platforms_shape" CHECK("platforms"."shape" in ('bluRay', 'keepCase', 'switch', 'jewel', 'ds', 'vita', 'psp', 'boxTall', 'boxWide', 'boxSmall')),
	CONSTRAINT "platforms_plastic" CHECK("platforms"."plastic" in ('blue', 'red', 'green', 'white', 'black', 'clear'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platforms_key` ON `platforms` (`key`);--> statement-breakpoint
CREATE TABLE `play_time` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`copy_id` text,
	`source` text NOT NULL,
	`minutes` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`copy_id`) REFERENCES `copies`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "play_time_source" CHECK("play_time"."source" in ('manual')),
	CONSTRAINT "play_time_minutes" CHECK("play_time"."minutes" >= 0)
);
--> statement-breakpoint
CREATE INDEX `play_time_entry` ON `play_time` (`entry_id`);--> statement-breakpoint
CREATE TABLE `shelves` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`sort` text DEFAULT 'title' NOT NULL,
	`group` text DEFAULT 'none' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shelves_slug` ON `shelves` (`slug`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_slug` ON `tags` (`slug`);--> statement-breakpoint
CREATE TABLE `vocab` (
	`kind` text NOT NULL,
	`id` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	PRIMARY KEY(`kind`, `id`)
);
