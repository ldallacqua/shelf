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

/**
 * A group's or a field's label, as every label on the page is written: small mono capitals in the
 * muted color, as "Story" under About and each row of Details, and as a visitor sees this same
 * Mine. Martian Mono does numbers and labels, Archivo names and values (Foundations, Type), so what
 * I chose stands out, and not the word above it.
 */
export const mineHeading = 'readout text-[0.625rem] text-muted'

/** A copy I own, or a version of the game: one card each. */
export const mineCard = 'grid gap-3 rounded-panel border border-line bg-surface-raised p-3'

/** Where a new copy is put together, set apart from the copies I have. */
export const mineNewCard = 'grid gap-3 rounded-panel border border-dashed border-line-strong p-3'

/** The line "Mine" is written on, alone as every section's heading is, with what is being saved. */
export const mineTop = 'flex items-baseline justify-between gap-3'

/**
 * The line Play stands on, under the heading, as Steam's play bar is under its game's art: Play and
 * its menu, then the saves' state. In the app it is always there, so its place is kept from the
 * start; in a browser only a game Steam can start has one.
 */
export const minePlay =
  'flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2 pointer-coarse:min-h-11'
