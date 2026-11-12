import type { Preset } from '@/domain/colorway/names'

import { themeColor, type Theme } from './theme'

/*
 * Apart from theme.ts, which every page's script imports: only the theme
 * script, on the server, and the picker's store read the presets' walls.
 */

/** Each preset's wall per theme, for the browser's own chrome. Kept equal to colorways.css by a test. */
export const colorwayWall: Record<Preset, Record<Theme, string>> = {
  violet: themeColor,
  ocean: { light: '#e8eff6', dark: '#060e16' },
  ember: { light: '#f0eded', dark: '#0f0c0b' },
  arcade: { light: '#efecf9', dark: '#0e0a1a' },
  crimson: { light: '#edeef0', dark: '#0c0d0f' },
  graphite: { light: '#eeeeee', dark: '#0d0d0d' },
  lilac: { light: '#f0ebff', dark: '#0e0b16' },
  mint: { light: '#dcf5eb', dark: '#03100b' },
  peach: { light: '#ffe9df', dark: '#160a05' },
  sky: { light: '#e1f0ff', dark: '#050e17' },
  rose: { light: '#ffe7ee', dark: '#15090d' },
}
