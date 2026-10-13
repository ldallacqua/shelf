import {
  changeDirection,
  parseThemeChoice,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeColor,
  type Theme,
  type ThemeChoice,
} from './theme'

/**
 * The browser side of the theme: reads and writes the stored choice, applies
 * it to the page, and tells React when it changes. There is no provider; the
 * page's <html> element is the single source, set first by the theme script.
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

function applyWithoutAnimation(choice: ThemeChoice): void {
  apply(choice, false)
}

function apply(choice: ThemeChoice, animate = true): void {
  const root = document.documentElement
  const theme = resolveTheme(choice, deviceIsDark())

  if (animate && root.dataset.theme !== theme && !prefersReducedMotion()) {
    root.dataset.themeChanging = changeDirection(theme)
    clearTimeout(changeTimer)
    changeTimer = setTimeout(() => {
      delete root.dataset.themeChanging
    }, CHANGE_WINDOW_MS)
  }

  root.dataset.theme = theme
  root.dataset.themeChoice = choice
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor[theme])
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

// Another tab changed the choice.
function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== THEME_STORAGE_KEY) return
  apply(readStoredChoice())
  notify()
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) {
    // The theme script sets the theme before React starts. It cannot have run
    // if the whole document was drawn in the browser, as Next.js does for its
    // own error pages; in that case, apply the stored choice now.
    if (!document.documentElement.dataset.theme) applyWithoutAnimation(readStoredChoice())

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
