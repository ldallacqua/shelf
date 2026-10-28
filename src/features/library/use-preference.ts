'use client'

import { useSyncExternalStore } from 'react'

import {
  adultPreference,
  densityPreference,
  dimensionPreference,
  experimentalPreference,
  readPreference,
  readyPreference,
  subscribeToPreferences,
  TOO_SMALL_FOR_3D,
  wallSizePreference,
  writeExperimental,
  writePreference,
  type AdultChoice,
  type Density,
  type Dimension,
  type ExperimentalChoice,
  type ReadyChoice,
  type WallSize,
} from './preferences'

/**
 * Whether this device is offered the unfinished views (issue 63), and a way
 * to change it. The server says no; the stored choice follows once the page
 * has hydrated.
 */
export function useExperimental(): [ExperimentalChoice, (value: ExperimentalChoice) => void] {
  const value = useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(experimentalPreference),
    () => experimentalPreference.fallback,
  )
  return [value, writeExperimental]
}

/**
 * Whether this device draws the shelf in 2D or 3D, and a way to change it.
 * The server always draws 2D; a choice of 3D follows once the page has
 * hydrated, and only while experimental views are on.
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
 * Whether the window is too small for the 3D shelf `asked` for, as it is now:
 * turning a tablet or resizing a window can change it. The server cannot
 * tell: it says no. Neither does the browser while 2D is asked for, when the
 * answer changes nothing: on a phone it is yes, and asking it there redrew
 * the whole library the moment it came alive.
 */
export function useTooSmallFor3d(asked: Dimension): boolean {
  return useSyncExternalStore(
    subscribeToSmall,
    () => asked === '3d' && window.matchMedia(TOO_SMALL_FOR_3D).matches,
    () => false,
  )
}

/** The same, at this moment, for a key or a button: nothing is drawn from it. */
export const tooSmallFor3dNow = (): boolean => window.matchMedia(TOO_SMALL_FOR_3D).matches

/** How boxes stand on the shelf on this device, and a way to change it. */
export function useDensity(): [Density, (value: Density) => void] {
  const value = useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(densityPreference),
    () => densityPreference.fallback,
  )
  return [value, (next) => writePreference(densityPreference, next)]
}

/** Whether adult games are hidden on this device (spec 3.13), and a way to change it. */
export function useAdult(): [AdultChoice, (value: AdultChoice) => void] {
  const value = useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(adultPreference),
    () => adultPreference.fallback,
  )
  return [value, (next) => writePreference(adultPreference, next)]
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

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

const subscribeToMotion = (listener: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/** Whether this device asks for reduced motion. The server cannot tell: it says no. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  )
}

/** Whether one's own shelf shows only the games ready to play here (spec 7.7), and a way to change it. */
export function useReadyToPlay(): [ReadyChoice, (value: ReadyChoice) => void] {
  const value = useSyncExternalStore(
    subscribeToPreferences,
    () => readPreference(readyPreference),
    () => readyPreference.fallback,
  )
  return [value, (next) => writePreference(readyPreference, next)]
}
