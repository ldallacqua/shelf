/**
 * The shape "Mine" shares with its skeleton (`mine-skeleton.tsx`), so the one
 * stands exactly where the other will: the groups it is made of, each after
 * the first set off by a rule, and the cards a copy and a version sit in.
 */

/** The groups, one under another. */
export const mineGroups = 'mt-3 grid gap-6'

/** The first group: status, rating, hours. */
export const mineGroup = 'grid gap-5'

/** Every group after the first. */
export const mineGroupRuled = 'grid gap-4 border-t border-line pt-6'

/** A group's own heading, as a field's label is written. */
export const mineHeading = 'text-sm font-semibold'

/** A copy I own, or a version of the game: one card each. */
export const mineCard = 'grid gap-3 rounded-panel border border-line bg-surface-raised p-3'

/** Where a new copy is put together, set apart from the copies I have. */
export const mineNewCard = 'grid gap-3 rounded-panel border border-dashed border-line-strong p-3'
