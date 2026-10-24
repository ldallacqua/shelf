-- The title rung now asks IGDB for each way a title may be spelled, a dash between words as a
-- hyphen or a colon, and leaves out Nintendo's platform names ("– Nintendo Switch 2 Edition",
-- "for Nintendo Switch"). What it could not match is tried again at the next sync, not a week
-- after it was last tried.
UPDATE `source_items` SET `title_tried_at` = NULL
WHERE `decision` = 'pending'
  AND `igdb_id` IS NULL
  AND `title_tried_at` IS NOT NULL;
