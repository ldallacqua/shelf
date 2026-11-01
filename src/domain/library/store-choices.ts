import type { StoreName } from '@/domain/library/stores'

/**
 * Which stores I can say a copy is from: what the forms offer, and what the
 * server keeps. Neither is on a shelf's first load.
 */

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
