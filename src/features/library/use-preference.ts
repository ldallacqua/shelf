'use client'

import { useSyncExternalStore } from 'react'

import {
  densityPreference,
  dimensionPreference,
  readPreference,
  subscribeToPreferences,
  wallSizePreference,
  writePreference,
  type Density,
  type Dimension,
  type WallSize,
} from './preferences'

/**
 * Whether this device draws the shelf in 2D or 3D, and a way to change it.
 * The server always draws 2D; the stored choice, or the device's default,
 * follows once the page has hydrated.
 */
export function useDimension(): [Dimension, (value: Dimension) => void] {
  const value = useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(dimensionPreference),
    () => dimensionPreference.fallback,
  )
  return [value, (next) => writePreference(dimensionPreference, next)]
}

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
