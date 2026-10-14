'use client'

import { useSyncExternalStore } from 'react'

import {
  densityPreference,
  readPreference,
  subscribeToPreferences,
  wallSizePreference,
  writePreference,
  type Density,
  type WallSize,
} from './preferences'

/** How boxes stand on the shelf on this device, and a way to change it. */
export function useDensity(): [Density, (value: Density) => void] {
  const value = useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(densityPreference),
    () => densityPreference.fallback,
  )
  return [value, (next) => writePreference(densityPreference, next)]
}

/** How large covers are on the wall on this device, and a way to change it. */
export function useWallSize(): [WallSize, (value: WallSize) => void] {
  const value = useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(wallSizePreference),
    () => wallSizePreference.fallback,
  )
  return [value, (next) => writePreference(wallSizePreference, next)]
}
