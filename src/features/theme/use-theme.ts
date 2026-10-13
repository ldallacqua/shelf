'use client'

import { useSyncExternalStore } from 'react'

import type { Theme, ThemeChoice } from './theme'
import { getTheme, getThemeChoice, setThemeChoice, subscribeToTheme } from './theme-store'

type UseTheme = {
  /** What the visitor picked: follow the device, light, or dark. */
  choice: ThemeChoice
  /** What the page shows right now. */
  theme: Theme
  setChoice: (choice: ThemeChoice) => void
}

/**
 * The current theme and a way to change it.
 * On the server, and until the page has hydrated, it reports "system" and
 * "light"; the real values follow at once, without a hydration warning.
 */
export function useTheme(): UseTheme {
  const choice = useSyncExternalStore(subscribeToTheme, getThemeChoice, () => 'system' as const)
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, () => 'light' as const)
  return { choice, theme, setChoice: setThemeChoice }
}
