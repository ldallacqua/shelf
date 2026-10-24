-- Steam's store gives a mode sold apart a page that names no game (Black Ops II's zombies),
-- which the sync took as a game, and nothing matched. It now looks for that game by title:
-- the store is asked once more about what it called a game and nothing has matched.
UPDATE `source_items` SET `kind` = NULL
WHERE `source` = 'steam'
  AND `kind` = 'game'
  AND `decision` = 'pending'
  AND `igdb_id` IS NULL;
