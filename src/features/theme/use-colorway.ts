'use client'

import { useSyncExternalStore } from 'react'

import { DEFAULT_PRESET, type Preset } from '@/domain/colorway/presets'

import { getColorway, setColorway, subscribeToTheme } from './theme-store'

/**
 * The colorway this device paints Shelf in, and a way to change it. On the
 * server, and until the page has hydrated, it reports Shelf's own; the real one
 * follows at once, without a hydration warning.
 */
export function useColorway(): { colorway: Preset; setColorway: (colorway: Preset) => void } {
  const colorway = useSyncExternalStore(subscribeToTheme, getColorway, () => DEFAULT_PRESET)
  return { colorway, setColorway }
}
