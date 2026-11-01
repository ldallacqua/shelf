import type { Format } from '@/domain/library/values'

/**
 * Every store by a word of ours, and what has one. Every shelf loads this, so
 * it stays this small. The library file holds a store as its position here, so
 * a new one goes at the end.
 */

export const storeNames = [
  'steam',
  'gog',
  'epic',
  'microsoft',
  'itch',
  'ea',
  'ubisoft',
  'battlenet',
  'playstation',
  'nintendo',
  'meta',
  'apple',
  'google-play',
  'gamejolt',
  'amazon',
] as const

export type StoreName = (typeof storeNames)[number]

export type StoreLink = { store: StoreName; url: string }

// IGDB's PC (Microsoft Windows), Mac and Linux.
const PC_PLATFORMS: ReadonlySet<number> = new Set([6, 14, 3])

export const isPcPlatform = (platform: number): boolean => PC_PLATFORMS.has(platform)

/** For now only a download on a PC comes from a store worth naming (the owner, 1 Nov 2026). */
export const takesStore = (platform: number, format: Format): boolean =>
  isPcPlatform(platform) && format === 'digital'
