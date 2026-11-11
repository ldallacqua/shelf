CREATE TABLE `admin_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job` text NOT NULL,
	`stage` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`steps` integer DEFAULT 0 NOT NULL,
	`checked` integer DEFAULT 0 NOT NULL,
	`changed` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`finished_at` integer,
	CONSTRAINT "admin_runs_state" CHECK("admin_runs"."state" in ('running', 'done', 'failed', 'stopped'))
);
--> statement-breakpoint
CREATE INDEX `admin_runs_started_at` ON `admin_runs` (`started_at`);