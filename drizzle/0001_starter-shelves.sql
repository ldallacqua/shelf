-- The starter smart shelves (spec 5.5): present from day one, and the owner's to change.
-- Written once, by this migration, so every new library has them. STARTER_SHELVES in
-- src/domain/library/shelves.ts is the same list (seeds write it), and a test keeps the two alike.
INSERT OR IGNORE INTO `shelves` (`id`, `slug`, `name`, `query`, `sort`, `group`, `position`, `created_at`, `updated_at`) VALUES
  ('5f0c1a00-0000-4000-a000-000000000001', 'playing-now', 'Playing now', 'status:playing', 'title', 'none', 0, 1792000000000, 1792000000000),
  ('5f0c1a00-0000-4000-a000-000000000002', 'backlog', 'Backlog', 'status:backlog', 'added', 'none', 1, 1792000000000, 1792000000000),
  ('5f0c1a00-0000-4000-a000-000000000003', 'short-ones', 'Short ones', 'status:backlog length:<10', 'length', 'none', 2, 1792000000000, 1792000000000),
  ('5f0c1a00-0000-4000-a000-000000000004', 'on-the-shelf', 'On the shelf', 'format:physical', 'title', 'platform', 3, 1792000000000, 1792000000000),
  ('5f0c1a00-0000-4000-a000-000000000005', 'favorites', 'Favorites', 'rating:>=9', '-rating', 'none', 4, 1792000000000, 1792000000000),
  ('5f0c1a00-0000-4000-a000-000000000006', 'wishlist', 'Wishlist', 'status:wishlist', 'title', 'none', 5, 1792000000000, 1792000000000);
