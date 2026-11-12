import { DEFAULT_PRESET, OWN } from '@/domain/colorway/names'
import { colorTokens } from '@/domain/colorway/presets'

import {
  BLACK_STORAGE_KEY,
  BLACK_WALL,
  chromeProperty,
  COLORS_STORAGE_KEY,
  colorwayWall,
  OWN_COLORS_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from './theme'

/**
 * The script that runs in <head> before the first paint, so the page never
 * flashes the wrong theme or the wrong colors. It must stand alone: no
 * imports, no modern syntax that could fail to parse, and it must never throw
 * (storage can be blocked).
 */
export function themeScript(): string {
  const key = JSON.stringify(THEME_STORAGE_KEY)
  const colorsKey = JSON.stringify(COLORS_STORAGE_KEY)
  const ownKey = JSON.stringify(OWN_COLORS_STORAGE_KEY)
  const own = JSON.stringify(OWN)
  const preset = JSON.stringify(DEFAULT_PRESET)
  const tokens = JSON.stringify(colorTokens)
  const blackKey = JSON.stringify(BLACK_STORAGE_KEY)
  // Each colorway's walls, light then dark: also the list of colorways it knows.
  const walls = JSON.stringify(
    Object.fromEntries(
      Object.entries(colorwayWall).map(([name, wall]) => [name, [wall.light, wall.dark]]),
    ),
  )
  // One's own is painted only if every color it keeps is #rrggbb: anything else
  // in storage leaves the page in Shelf's own colors. The loops count down, as
  // the script may hold no "<".
  return (
    `(function(){var d=document.documentElement,c='system',t='light',k=${preset},w=${walls},b=0;` +
    `try{var s=localStorage.getItem(${key});if(s==='light'||s==='dark')c=s}catch(e){}` +
    `try{t=c==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):c}catch(e){}` +
    `try{var p=localStorage.getItem(${colorsKey});` +
    `if(p===${own}){var o=JSON.parse(localStorage.getItem(${ownKey})).colors,T=${tokens},x=/^#[0-9a-f]{6}$/i,ok=x.test(o.led),i;` +
    `for(i=T.length;ok&&i--;)ok=x.test(o.light[T[i]])&&x.test(o.dark[T[i]]);` +
    `if(ok){for(i=T.length;i--;){d.style.setProperty('--own-light-'+T[i],o.light[T[i]]);d.style.setProperty('--own-dark-'+T[i],o.dark[T[i]])}` +
    `d.style.setProperty('--own-led',o.led);w[p]=[o.light.wall,o.dark.wall];k=p}}` +
    `else if(p&&Object.prototype.hasOwnProperty.call(w,p))k=p}catch(e){}` +
    `try{b=localStorage.getItem(${blackKey})==='1'}catch(e){}` +
    `d.setAttribute('data-theme',t);d.setAttribute('data-theme-choice',c);` +
    `if(k!==${preset})d.setAttribute('data-colors',k);` +
    `if(b){d.setAttribute('data-black','');w[k]=[w[k][0],${JSON.stringify(BLACK_WALL)}]}` +
    `if(k!==${preset}||b){d.style.setProperty(${JSON.stringify(chromeProperty.light)},w[k][0]);d.style.setProperty(${JSON.stringify(chromeProperty.dark)},w[k][1])}` +
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
