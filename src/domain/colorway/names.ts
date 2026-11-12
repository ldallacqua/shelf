/**
 * The colorways' names: the presets, in the order the picker shows them, and
 * one's own. All that the theme script needs to know of colorways. Their seeds,
 * and everything worked out from them, are elsewhere (`presets.ts`,
 * `derive.ts`), loaded only where colorways are chosen.
 */
export const presetNames = ['violet', 'ocean', 'ember', 'arcade', 'crimson', 'graphite'] as const
export type Preset = (typeof presetNames)[number]

/** Shelf's own colors: theme.css, with no colorway on <html>. */
export const DEFAULT_PRESET: Preset = 'violet'

export const isPreset = (value: unknown): value is Preset =>
  typeof value === 'string' && (presetNames as readonly string[]).includes(value)

/** A colorway of one's own, worked out on the device from three colors picked by hand. */
export const OWN = 'own'
export type Colorway = Preset | typeof OWN

export const isColorway = (value: unknown): value is Colorway => value === OWN || isPreset(value)
