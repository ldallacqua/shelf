import { DEFAULT_PRESET } from '@/domain/colorway/names'

import { COLORS_STORAGE_KEY, colorwayWall, THEME_STORAGE_KEY } from './theme'

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

/**
 * Applies the stored theme and colorway before the first paint. Render it in
 * <head>, from a server component only: React does not run a script it renders
 * in the browser. It lives apart from theme.ts, which every page's script
 * imports, so the script's own text never reaches a browser but in the page.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
}
