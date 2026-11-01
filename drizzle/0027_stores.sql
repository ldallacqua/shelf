ALTER TABLE `copies` ADD `stores` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `wanted_stores` text;--> statement-breakpoint
ALTER TABLE `games` ADD `store_links` text;--> statement-breakpoint
UPDATE `copies` SET `stores` = '["steam"]' WHERE `format` = 'digital' AND `platform_id` IN (6, 14, 3) AND `id` IN (SELECT `copy_id` FROM `source_items` WHERE `source` = 'steam' AND `copy_id` IS NOT NULL);
