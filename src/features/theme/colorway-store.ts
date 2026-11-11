import { DEFAULT_PRESET, isPreset, type Preset } from '@/domain/colorway/names'

import { COLORS_STORAGE_KEY } from './theme'
import { getTheme, paintChrome, playChange } from './theme-store'

/**
 * The browser side of choosing a colorway: writes the choice, paints the page
 * in it, and tells React. Only the picker loads it, so no other page pays for
 * it: the theme script paints every page in the stored colorway before it is
 * drawn, and a choice made in another tab reaches a page as it loads, or at
 * once where the picker is open.
 */

const listeners = new Set<() => void>()

/** Anything that is not a preset, including nothing stored, means Shelf's own colors. */
export function parseColorway(value: unknown): Preset {
  return isPreset(value) ? value : DEFAULT_PRESET
}

function readStoredColorway(): Preset {
  try {
    return parseColorway(window.localStorage.getItem(COLORS_STORAGE_KEY))
  } catch {
    return DEFAULT_PRESET
  }
}

function applyColorway(colorway: Preset): void {
  const root = document.documentElement
  if (getColorway() === colorway) return
  playChange(getTheme())
  if (colorway === DEFAULT_PRESET) delete root.dataset.colors
  else root.dataset.colors = colorway
  paintChrome()
}

function notify(): void {
  for (const listener of listeners) listener()
}

// Another tab chose a colorway.
function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== COLORS_STORAGE_KEY) return
  applyColorway(readStoredColorway())
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

/** The colorway the page is painted in: Shelf's own when <html> names none. */
export function getColorway(): Preset {
  return parseColorway(document.documentElement.dataset.colors)
}

export function setColorway(colorway: Preset): void {
  try {
    if (colorway === DEFAULT_PRESET) window.localStorage.removeItem(COLORS_STORAGE_KEY)
    else window.localStorage.setItem(COLORS_STORAGE_KEY, colorway)
  } catch {
    // Storage is blocked: the colors still apply to this page.
  }
  applyColorway(colorway)
  notify()
}
