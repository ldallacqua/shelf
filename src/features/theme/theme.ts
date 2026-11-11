import { DEFAULT_PRESET, isPreset, type Preset } from '@/domain/colorway/presets'

/**
 * The theme rules, with no browser or React in them.
 *
 * A visitor's choice is one of three: follow the device, light, or dark.
 * What the page actually shows is one of two: light or dark.
 *
 * Apart from the theme, the device keeps a colorway (issue 206): the colors
 * the room is painted in, in both themes. Shelf's own is violet, which is
 * theme.css with no `data-colors` on <html>.
 */
export const THEME_STORAGE_KEY = 'shelf:theme'
export const COLORS_STORAGE_KEY = 'shelf:colors'

export const themeChoices = ['system', 'light', 'dark'] as const
export type ThemeChoice = (typeof themeChoices)[number]
export type Theme = 'light' | 'dark'

/** Wall color per theme, for the browser's own chrome. Kept equal to the tokens by a test. */
export const themeColor: Record<Theme, string> = {
  light: '#eceef2',
  dark: '#0b0d12',
}

/** Each colorway's wall per theme, for the same. Kept equal to colorways.css by a test. */
export const colorwayWall: Record<Preset, Record<Theme, string>> = {
  violet: themeColor,
  ocean: { light: '#e8eff6', dark: '#060e16' },
  ember: { light: '#f0eded', dark: '#0f0c0b' },
  arcade: { light: '#efecf9', dark: '#0e0a1a' },
  crimson: { light: '#edeef0', dark: '#0c0d0f' },
  graphite: { light: '#eeeeee', dark: '#0d0d0d' },
}

/** Anything that is not a known choice, including nothing stored, means "follow the device". */
export function parseThemeChoice(value: unknown): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** Anything that is not a preset, including nothing stored, means Shelf's own colors. */
export function parseColorway(value: unknown): Preset {
  return isPreset(value) ? value : DEFAULT_PRESET
}

export function resolveTheme(choice: ThemeChoice, deviceIsDark: boolean): Theme {
  if (choice === 'system') return deviceIsDark ? 'dark' : 'light'
  return choice
}

/** Which way the light is changing, for the theme-change animation. */
export function changeDirection(to: Theme): 'to-dark' | 'to-light' {
  return to === 'dark' ? 'to-dark' : 'to-light'
}

/**
 * The script that runs in <head> before the first paint, so the page never
 * flashes the wrong theme or the wrong colors. It must stand alone: no
 * imports, no modern syntax that could fail to parse, and it must never throw
 * (storage can be blocked).
 */
export function themeScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY)
  const colorsKey = JSON.stringify(COLORS_STORAGE_KEY)
  // Each colorway's walls, light then dark: also the list of colorways it knows.
  const walls = JSON.stringify(
    Object.fromEntries(
      Object.entries(colorwayWall).map(([name, wall]) => [name, [wall.light, wall.dark]]),
    ),
  )
  return (
    `(function(){var d=document.documentElement,c='system',t='light',k=${JSON.stringify(DEFAULT_PRESET)},w=${walls};` +
    `try{var s=localStorage.getItem(${key});if(s==='light'||s==='dark')c=s}catch(e){}` +
    `try{t=c==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):c}catch(e){}` +
    `try{var p=localStorage.getItem(${colorsKey});if(p&&Object.prototype.hasOwnProperty.call(w,p))k=p}catch(e){}` +
    `d.setAttribute('data-theme',t);d.setAttribute('data-theme-choice',c);` +
    `if(k!==${JSON.stringify(DEFAULT_PRESET)})d.setAttribute('data-colors',k);` +
    `var m=document.createElement('meta');m.name='theme-color';m.content=w[k][t==='dark'?1:0];` +
    `document.head.appendChild(m)})()`
  )
}
