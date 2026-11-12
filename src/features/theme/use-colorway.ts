'use client'

import { useSyncExternalStore } from 'react'

import { DEFAULT_PRESET, type Colorway } from '@/domain/colorway/names'
import type { OwnColorway } from '@/domain/colorway/presets'

import {
  getBlack,
  getColorway,
  getFollow,
  getOwnColorway,
  setBlack,
  setFollow,
  setColorway,
  setOwnColorway,
  subscribeToColorway,
} from './colorway-store'

type UseColorway = {
  /** The colorway the page is painted in. */
  colorway: Colorway
  /** One's own, as the device keeps it, chosen or not; none until it is first made. */
  own: OwnColorway | undefined
  /** Pure black with the lights off, for OLED screens. */
  black: boolean
  /** The room takes the colors of the game in focus. */
  follow: boolean
  setColorway: typeof setColorway
  setOwnColorway: typeof setOwnColorway
  setBlack: typeof setBlack
  setFollow: typeof setFollow
}

/**
 * The colorway this device paints Shelf in, and ways to change it. On the
 * server, and until the page has hydrated, it reports Shelf's own; the real one
 * follows at once, without a hydration warning.
 */
export function useColorway(): UseColorway {
  const colorway = useSyncExternalStore(subscribeToColorway, getColorway, () => DEFAULT_PRESET)
  const own = useSyncExternalStore(subscribeToColorway, getOwnColorway, () => undefined)
  const black = useSyncExternalStore(subscribeToColorway, getBlack, () => false)
  const follow = useSyncExternalStore(subscribeToColorway, getFollow, () => false)
  return { colorway, own, black, follow, setColorway, setOwnColorway, setBlack, setFollow }
}
