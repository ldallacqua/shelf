/**
 * Where a game's sheet rises from the bottom (spec 12): on a phone, and on a
 * tablet held upright, where a column down the right would leave the shelf a
 * strip. Anywhere else it stands down the right edge. The `sheet-bottom` and
 * `sheet-side` variants in `globals.css` are the same query, for the styles.
 */
export const SHEET_FROM_BOTTOM = '(width < 40rem), (width < 64rem) and (orientation: portrait)'
