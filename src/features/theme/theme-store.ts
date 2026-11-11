import { DEFAULT_PRESET, type Preset } from '@/domain/colorway/presets'

import {
  changeDirection,
  COLORS_STORAGE_KEY,
  colorwayWall,
  parseColorway,
  parseThemeChoice,
  resolveTheme,
  THEME_STORAGE_KEY,
  type Theme,
  type ThemeChoice,
} from './theme'

/**
 * The browser side of the theme and the colorway: reads and writes the stored
 * choices, applies them to the page, and tells React when they change. There
 * is no provider; the page's <html> element is the single source, set first by
 * the theme script.
 */

// A little longer than the longest lighting transition (300ms delay + 700ms).
const CHANGE_WINDOW_MS = 1100

const listeners = new Set<() => void>()
let changeTimer: ReturnType<typeof setTimeout> | undefined

function deviceIsDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function readStoredChoice(): ThemeChoice {
  try {
    return parseThemeChoice(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function readStoredColorway(): Preset {
  try {
    return parseColorway(window.localStorage.getItem(COLORS_STORAGE_KEY))
  } catch {
    return DEFAULT_PRESET
  }
}

function applyWithoutAnimation(choice: ThemeChoice): void {
  apply(choice, false)
}

/**
 * Plays a change of the room's colors as a change of light, about a second.
 * A new colorway goes the way of the theme it is in: its lighting stays, and
 * only the colors glide.
 */
function playChange(to: Theme): void {
  if (prefersReducedMotion()) return
  const root = document.documentElement
  root.dataset.themeChanging = changeDirection(to)
  clearTimeout(changeTimer)
  changeTimer = setTimeout(() => {
    delete root.dataset.themeChanging
  }, CHANGE_WINDOW_MS)
}

/** The browser's own chrome, the color of the wall. */
function paintChrome(): void {
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', colorwayWall[getColorway()][getTheme()])
}

function apply(choice: ThemeChoice, animate = true): void {
  const root = document.documentElement
  const theme = resolveTheme(choice, deviceIsDark())

  if (animate && root.dataset.theme !== theme) playChange(theme)

  root.dataset.theme = theme
  root.dataset.themeChoice = choice
  paintChrome()
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

function onDeviceChange(): void {
  if (getThemeChoice() === 'system') {
    apply('system')
    notify()
  }
}

// Another tab changed a choice.
function onStorage(event: StorageEvent): void {
  if (event.key === null || event.key === THEME_STORAGE_KEY) apply(readStoredChoice())
  if (event.key === null || event.key === COLORS_STORAGE_KEY) applyColorway(readStoredColorway())
  if (event.key === null || event.key === THEME_STORAGE_KEY || event.key === COLORS_STORAGE_KEY) {
    notify()
  }
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    // The theme script sets the theme before React starts. It cannot have run
    // if the whole document was drawn in the browser, as Next.js does for its
    // own error pages; in that case, apply the stored choice now.
    if (!document.documentElement.dataset.theme) {
      applyWithoutAnimation(readStoredChoice())
      const colorway = readStoredColorway()
      if (colorway !== DEFAULT_PRESET) document.documentElement.dataset.colors = colorway
      paintChrome()
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onDeviceChange)
    window.addEventListener('storage', onStorage)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      window
        .matchMedia('(prefers-color-scheme: dark)')
        .removeEventListener('change', onDeviceChange)
      window.removeEventListener('storage', onStorage)
    }
  }
}

export function getThemeChoice(): ThemeChoice {
  return parseThemeChoice(document.documentElement.dataset.themeChoice)
}

export function getTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // Storage is blocked: the choice still applies to this page.
  }
  apply(choice)
  notify()
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
