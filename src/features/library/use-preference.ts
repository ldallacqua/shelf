'use client'

import { useSyncExternalStore } from 'react'

import {
  densityPreference,
  dimensionPreference,
  readPreference,
  subscribeToPreferences,
  TOO_SMALL_FOR_3D,
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

const subscribeToSmall = (listener: () => void) => {
  const query = window.matchMedia(TOO_SMALL_FOR_3D)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/**
 * Whether the window is too small for the 3D shelf, as it is now: turning a
 * tablet or resizing a window can change it. The server cannot tell: it says no.
 */
export function useTooSmallFor3d(): boolean {
  return useSyncExternalStore(
    subscribeToSmall,
    () => window.matchMedia(TOO_SMALL_FOR_3D).matches,
    () => false,
  )
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
