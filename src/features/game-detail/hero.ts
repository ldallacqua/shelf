/** Marks the open game's cover, for the cover growing out of the shelf to land on. */
export const HERO_COVER = 'data-hero-cover'

/**
 * Where a game opened over the shelf stands in the middle of the window, as
 * wide as its page (spec 7.2): past here, a panel at the window's edge is too
 * far to read without turning my head. The `game-centered` variant in
 * `globals.css` and the keyframes in `game-detail.css` are the same query.
 */
export const GAME_CENTERED = '(width >= 150rem) and (height >= 45rem)'
