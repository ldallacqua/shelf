/**
 * The presets' names, in the order the picker shows them: all that every page
 * needs to know of colorways, for the theme script and the theme store. Their
 * seeds, and everything worked out from them, are elsewhere (`presets.ts`,
 * `derive.ts`), loaded only where colorways are chosen.
 */
export const presetNames = ['violet', 'ocean', 'ember', 'arcade', 'crimson', 'graphite'] as const
export type Preset = (typeof presetNames)[number]

/** Shelf's own colors: theme.css, with no colorway on <html>. */
export const DEFAULT_PRESET: Preset = 'violet'

export const isPreset = (value: unknown): value is Preset =>
  typeof value === 'string' && (presetNames as readonly string[]).includes(value)
