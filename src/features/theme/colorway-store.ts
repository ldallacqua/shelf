import {
  DEFAULT_PRESET,
  isColorway,
  OWN,
  type Colorway,
  type Preset,
} from '@/domain/colorway/names'
import {
  colorTokens,
  parseOwnColorway,
  type Colors,
  type OwnColorway,
} from '@/domain/colorway/presets'

import {
  BLACK_STORAGE_KEY,
  BLACK_WALL,
  chromeProperty,
  COLORS_STORAGE_KEY,
  colorwayWall,
  OWN_COLORS_STORAGE_KEY,
  themeColor,
  type Theme,
} from './theme'
import { getTheme, paintChrome, playChange } from './theme-store'

/**
 * The browser side of choosing a colorway: writes the choice, paints the page
 * in it, and tells React. Only the picker loads it, so no other page pays for
 * it: the theme script paints every page in the stored colorway before it is
 * drawn, and a choice made in another tab reaches a page as it loads, or at
 * once where the picker is open.
 *
 * One's own is kept whole (`OwnColorway`): its seeds, the preset it started
 * from, and every color worked out, which the theme script lays on <html> as
 * properties (`--own-light-wall`…) for colorways.css to read.
 *
 * Pure black (`data-black`) is kept here too: it changes every colorway's dark
 * theme, and the walls the browser's chrome takes.
 */

const listeners = new Set<() => void>()

/** Anything that is not a colorway, including nothing stored, means Shelf's own colors. */
export function parseColorway(value: unknown): Colorway {
  return isColorway(value) ? value : DEFAULT_PRESET
}

/** What storage keeps under a key: null for nothing, undefined when storage is blocked. */
function readStored(key: string): string | null | undefined {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return undefined
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Storage is blocked: the colors still apply to this page.
  }
}

let ownRead: { raw: string | null | undefined; own: OwnColorway | undefined } = {
  raw: null,
  own: undefined,
}
/** One's own made on this page, for when storage is blocked and keeps nothing. */
let ownMade: OwnColorway | undefined

/** One's own colorway as the device keeps it, the same object until it changes. */
export function getOwnColorway(): OwnColorway | undefined {
  const raw = readStored(OWN_COLORS_STORAGE_KEY)
  if (raw === undefined) return ownMade
  if (raw !== ownRead.raw) {
    let own: OwnColorway | undefined
    try {
      own = parseOwnColorway(JSON.parse(raw ?? 'null'))
    } catch {
      own = undefined
    }
    ownRead = { raw, own }
  }
  return ownRead.own
}

/** The colorway the page is painted in: Shelf's own when <html> names none. */
export function getColorway(): Colorway {
  return parseColorway(document.documentElement.dataset.colors)
}

/** Whether the page is in pure black with the lights off. */
export function getBlack(): boolean {
  return document.documentElement.hasAttribute('data-black')
}

/**
 * The walls of what is on screen, for the browser's chrome: the colorway's,
 * black with the lights off under pure black, and none for Shelf's own as it is.
 */
function setChromeWalls(walls: Record<Theme, string> | undefined): void {
  const style = document.documentElement.style
  const black = getBlack()
  const shown = walls ?? (black ? themeColor : undefined)
  for (const theme of ['light', 'dark'] as const) {
    const wall = black && theme === 'dark' ? BLACK_WALL : shown?.[theme]
    if (wall) style.setProperty(chromeProperty[theme], wall)
    else style.removeProperty(chromeProperty[theme])
  }
}

/** The walls of a colorway, or none for Shelf's own. */
function wallsOf(colorway: Colorway): Record<Theme, string> | undefined {
  if (colorway === OWN) {
    const own = getOwnColorway()
    return own ? { light: own.colors.light.wall, dark: own.colors.dark.wall } : undefined
  }
  return colorway === DEFAULT_PRESET ? undefined : colorwayWall[colorway]
}

/** Lays one's own colors on <html>, where colorways.css reads them. */
function layOwnColors(colors: Colors): void {
  const style = document.documentElement.style
  for (const theme of ['light', 'dark'] as const) {
    for (const token of colorTokens) {
      style.setProperty(`--own-${theme}-${token}`, colors[theme][token])
    }
  }
  style.setProperty('--own-led', colors.led)
}

function show(colorway: Colorway): void {
  const root = document.documentElement
  if (getColorway() !== colorway) playChange(getTheme())
  if (colorway === DEFAULT_PRESET) delete root.dataset.colors
  else root.dataset.colors = colorway
  paintChrome()
}

function applyPreset(preset: Preset): void {
  if (getColorway() === preset) return
  setChromeWalls(wallsOf(preset))
  show(preset)
}

function applyOwn(own: OwnColorway): void {
  layOwnColors(own.colors)
  setChromeWalls({ light: own.colors.light.wall, dark: own.colors.dark.wall })
  show(OWN)
}

/** What the device keeps, applied: one's own if it is whole, otherwise the preset named. */
function applyStored(): void {
  const stored = parseColorway(readStored(COLORS_STORAGE_KEY))
  if (stored !== OWN) return applyPreset(stored)
  const own = getOwnColorway()
  if (own) applyOwn(own)
  else applyPreset(DEFAULT_PRESET)
}

function notify(): void {
  for (const listener of listeners) listener()
}

function applyBlack(black: boolean): void {
  if (getBlack() === black) return
  if (getTheme() === 'dark') playChange('dark')
  document.documentElement.toggleAttribute('data-black', black)
  setChromeWalls(wallsOf(getColorway()))
  paintChrome()
}

// Another tab chose a colorway, changed its own, or turned pure black on or off.
function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key === BLACK_STORAGE_KEY) {
    applyBlack(readStored(BLACK_STORAGE_KEY) === '1')
  }
  if (
    event.key === null ||
    event.key === COLORS_STORAGE_KEY ||
    event.key === OWN_COLORS_STORAGE_KEY
  ) {
    applyStored()
  }
  notify()
}

export function subscribeToColorway(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

/** Paints the page in a preset, and remembers it. One's own is kept, for coming back to. */
export function setColorway(preset: Preset): void {
  writeStored(COLORS_STORAGE_KEY, preset === DEFAULT_PRESET ? null : preset)
  applyPreset(preset)
  notify()
}

/**
 * Paints the page in one's own colorway, and remembers it. Choosing it plays
 * as a change of light; changing its colors while it is on screen follows the
 * picker at once, as the colors are being picked.
 */
export function setOwnColorway(own: OwnColorway): void {
  ownMade = own
  writeStored(OWN_COLORS_STORAGE_KEY, JSON.stringify(own))
  writeStored(COLORS_STORAGE_KEY, OWN)
  applyOwn(own)
  notify()
}

/** Turns pure black on or off for the lights-off theme, and remembers it. */
export function setBlack(black: boolean): void {
  writeStored(BLACK_STORAGE_KEY, black ? '1' : null)
  applyBlack(black)
  notify()
}
