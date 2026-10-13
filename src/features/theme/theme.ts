/**
 * The theme rules, with no browser or React in them.
 *
 * A visitor's choice is one of three: follow the device, light, or dark.
 * What the page actually shows is one of two: light or dark.
 */
export const THEME_STORAGE_KEY = 'shelf:theme'

export const themeChoices = ['system', 'light', 'dark'] as const
export type ThemeChoice = (typeof themeChoices)[number]
export type Theme = 'light' | 'dark'

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

/**
 * The script that runs in <head> before the first paint, so the page never
 * flashes the wrong theme. It must stand alone: no imports, no modern syntax
 * that could fail to parse, and it must never throw (storage can be blocked).
 */
export function themeScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY)
  const light = JSON.stringify(themeColor.light)
  const dark = JSON.stringify(themeColor.dark)
  return (
    `(function(){var d=document.documentElement,c='system',t='light';` +
    `try{var s=localStorage.getItem(${key});if(s==='light'||s==='dark')c=s}catch(e){}` +
    `try{t=c==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):c}catch(e){}` +
    `d.setAttribute('data-theme',t);d.setAttribute('data-theme-choice',c);` +
    `var m=document.createElement('meta');m.name='theme-color';m.content=t==='dark'?${dark}:${light};` +
    `document.head.appendChild(m)})()`
  )
}
