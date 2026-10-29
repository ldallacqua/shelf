-- Steam's older image path answers 404 for a game out in 2026, where the newer one has every
-- game's (checked 29 Oct 2026). Syncs write the newer address since #96; the artwork stored
-- before moves to it, file for file. Nothing else is touched.
UPDATE `achievements` SET `icon` = replace(`icon`, 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/', 'https://shared.akamai.steamstatic.com/community_assets/images/apps/') WHERE `icon` LIKE 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/%';--> statement-breakpoint
UPDATE `achievements` SET `icon_locked` = replace(`icon_locked`, 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/', 'https://shared.akamai.steamstatic.com/community_assets/images/apps/') WHERE `icon_locked` LIKE 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/%';
