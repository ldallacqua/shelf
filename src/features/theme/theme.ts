/**
 * The theme rules, with no browser or React in them.
 *
 * A visitor's choice is one of three: follow the device, light, or dark.
 * What the page actually shows is one of two: light or dark.
 *
 * Apart from the theme, the device keeps a colorway (issue 206): the colors
 * the room is painted in, in both themes. Shelf's own is violet, which is
 * theme.css with no `data-colors` on <html>. One's own is kept whole, worked
 * out, under a key of its own.
 */
export const THEME_STORAGE_KEY = 'shelf:theme'
export const COLORS_STORAGE_KEY = 'shelf:colors'
export const OWN_COLORS_STORAGE_KEY = 'shelf:colors:own'
/** The room takes the colors of the game in focus: '1', or nothing. */
export const FOLLOW_STORAGE_KEY = 'shelf:colors:follow'
/** Pure black with the lights off, for OLED screens: '1', or nothing. */
export const BLACK_STORAGE_KEY = 'shelf:black'
/** The wall with the lights off when pure black is on. */
export const BLACK_WALL = '#000000'

export type Theme = 'light' | 'dark'

/**
 * The wall of the colorway on screen, per theme, as properties on <html>, for
 * the browser's own chrome when the theme changes. Set only for a colorway that
 * isn't Shelf's own, which is `themeColor`.
 */
export const chromeProperty: Record<Theme, string> = {
  light: '--chrome-light',
  dark: '--chrome-dark',
}

export const themeChoices = ['system', 'light', 'dark'] as const
export type ThemeChoice = (typeof themeChoices)[number]
/** Wall color per theme, for the browser's own chrome. Kept equal to the tokens by a test. */
export const themeColor: Record<Theme, string> = {
  light: '#eceef2',
  dark: '#0b0d12',
}

/** Anything that is not a known choice, including nothing stored, means "follow the device". */
export function parseThemeChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function resolveTheme(choice: ThemeChoice, deviceIsDark: boolean): Theme {
  if (choice === 'system') return deviceIsDark ? 'dark' : 'light'
  return choice
}

/** Which way the light is changing, for the theme-change animation. */
export function changeDirection(to: Theme): 'to-dark' | 'to-light' {
  return to === 'dark' ? 'to-dark' : 'to-light'
}
