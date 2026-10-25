-- The title rung now asks IGDB, last, for the names holding every word of a title, so a name
-- IGDB punctuates otherwise is found ("DEAD OR ALIVE Xtreme 3 Scarlet" is its "Dead or Alive
-- Xtreme 3: Scarlet"). What it could not match is tried again at the next sync, not a week
-- after it was last tried.
UPDATE `source_items` SET `title_tried_at` = NULL
WHERE `decision` = 'pending'
  AND `igdb_id` IS NULL
  AND `title_tried_at` IS NOT NULL;
