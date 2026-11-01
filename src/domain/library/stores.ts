import type { Format } from '@/domain/library/values'

/**
 * Where a game is sold and where I keep it: every store by a word of ours, and
 * which of them I can say a copy is from. The library file holds a store as its
 * position here, so a new one goes at the end.
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

/**
 * What I can say a PC game is from. The last three have no link: IGDB lists no
 * page on them, but plenty of games live there.
 */
export const pcStores = [
  'steam',
  'gog',
  'epic',
  'microsoft',
  'itch',
  'ea',
  'ubisoft',
  'battlenet',
] as const satisfies readonly StoreName[]

const PC_STORES: ReadonlySet<StoreName> = new Set(pcStores)

// IGDB's PC (Microsoft Windows), Mac and Linux.
const PC_PLATFORMS: ReadonlySet<number> = new Set([6, 14, 3])

export const isPcPlatform = (platform: number): boolean => PC_PLATFORMS.has(platform)

/** For now only a download on a PC comes from a store worth naming (the owner, 1 Nov 2026). */
export const takesStore = (platform: number, format: Format): boolean =>
  isPcPlatform(platform) && format === 'digital'

/** Each store once, in our order, and only those a PC game can be from. */
export const cleanStores = (stores: readonly StoreName[] | null | undefined): StoreName[] => {
  const chosen = new Set(stores)
  return pcStores.filter((store) => chosen.has(store))
}

/** What to offer: the stores it is sold on and any I said, and the others to ask for. */
export const storeChoices = (
  soldOn: readonly StoreName[],
  chosen: readonly StoreName[],
): { offered: StoreName[]; rest: StoreName[] } => {
  const known = new Set([...soldOn.filter((store) => PC_STORES.has(store)), ...chosen])
  // Knowing nothing of it, the ones nearly every PC game is on.
  if (known.size === 0) for (const store of ['steam', 'gog', 'epic'] as const) known.add(store)
  return {
    offered: pcStores.filter((store) => known.has(store)),
    rest: pcStores.filter((store) => !known.has(store)),
  }
}

/** The store a sync reads a game from, which is therefore where my copy is from. */
export const storeOfSource = (source: string): StoreName | undefined =>
  source === 'steam' ? 'steam' : undefined
