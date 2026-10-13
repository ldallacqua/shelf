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

const never = () => () => undefined

/**
 * False while the page is being built on the server and while React takes it
 * over; true from then on. For things only a live page should do, such as
 * fading a cover in when it arrives.
 */
export function useIsLive(): boolean {
  return useSyncExternalStore(
    never,
    () => true,
    () => false,
  )
}
