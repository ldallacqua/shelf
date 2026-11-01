import { z } from 'zod'

import type { Format } from '@/domain/library/values'

/**
 * Where a game is sold and where I keep it: every store by a word of ours, its
 * link on the game's page, and which of them I can say a copy is from. The
 * library file holds a store as its position here, so a new one goes at the end.
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

export const storeList = z.array(z.enum(storeNames)).max(storeNames.length)

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

export const steamStoreLink = (appId: string): StoreLink => ({
  store: 'steam',
  url: `https://store.steampowered.com/app/${appId}`,
})

/**
 * Where each store's pages are, the best first. IGDB's links are written by its
 * community: one elsewhere is left out, so a link never goes anywhere but where
 * it says. A store's dead address (the old Xbox marketplace) is not on the list.
 */
const HOSTS: Partial<Record<StoreName, readonly (string | RegExp)[]>> = {
  steam: ['store.steampowered.com'],
  gog: ['www.gog.com', 'gog.com'],
  epic: ['store.epicgames.com', 'www.epicgames.com'],
  microsoft: ['www.xbox.com', 'www.microsoft.com', 'apps.microsoft.com'],
  itch: [/^[a-z0-9-]+\.itch\.io$/],
  playstation: ['store.playstation.com'],
  nintendo: [/^www\.nintendo\.[a-z.]{2,6}$/],
  meta: ['www.meta.com', 'www.oculus.com'],
  apple: ['apps.apple.com', 'itunes.apple.com'],
  'google-play': ['play.google.com'],
  gamejolt: ['gamejolt.com'],
  amazon: [/^(www\.)?amazon\.com$/, /^(www\.)?amazon\.[a-z.]{2,6}$/],
}

const hostRank = (store: StoreName, host: string): number => {
  const hosts = HOSTS[store] ?? []
  return hosts.findIndex((each) => (typeof each === 'string' ? each === host : each.test(host)))
}

/**
 * IGDB's links name a language, nearly always American English. These stores
 * answer an address without one in the visitor's own, with its own prices:
 * checked by hand on 1 Nov 2026, in Brazilian Portuguese.
 */
const LANGUAGE_FREE = new Set([
  'www.xbox.com',
  'www.microsoft.com',
  'store.playstation.com',
  'www.gog.com',
  'store.epicgames.com',
])
const FIRST_LANGUAGE = /^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i
const OLD_EPIC_LANGUAGE = /^\/store\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/i

const inAnyLanguage = (url: URL): string => {
  const path = LANGUAGE_FREE.has(url.host)
    ? url.pathname.replace(FIRST_LANGUAGE, '')
    : url.host === 'www.epicgames.com'
      ? url.pathname.replace(OLD_EPIC_LANGUAGE, '/store')
      : url.pathname
  return `https://${url.host}${path}${url.search}`
}

/**
 * One link for each store, the best of what was offered: its best address,
 * and among those the first offered. In our order. A link that is no address,
 * or is not on the store's own servers, is left out.
 */
export const chooseStoreLinks = (offered: readonly StoreLink[]): StoreLink[] => {
  const best = new Map<StoreName, { url: string; rank: number }>()
  for (const { store, url: raw } of offered) {
    const url = URL.canParse(raw) ? new URL(raw) : undefined
    if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) continue
    const host = url.host.toLowerCase()
    const rank = hostRank(store, host)
    if (rank < 0) continue
    const held = best.get(store)
    if (!held || rank < held.rank) best.set(store, { url: inAnyLanguage(url), rank })
  }
  return storeNames.flatMap((store) => {
    const link = best.get(store)
    return link ? [{ store, url: link.url }] : []
  })
}

/** A game's links, across its versions: the first to have a store gives its link. */
export const mergeStoreLinks = (lists: readonly (readonly StoreLink[])[]): StoreLink[] => {
  const byStore = new Map<StoreName, string>()
  for (const { store, url } of lists.flat()) if (!byStore.has(store)) byStore.set(store, url)
  return storeNames.flatMap((store) => {
    const url = byStore.get(store)
    return url ? [{ store, url }] : []
  })
}

/**
 * A stored record's links. One stored before they were asked for has none yet
 * (`null`), until the daily refresh: its Steam app is link enough till then.
 */
export const linksOfRecord = (record: {
  storeLinks: readonly StoreLink[] | null
  storeIds: readonly { source: string; uid: string }[]
}): readonly StoreLink[] => {
  if (record.storeLinks) return record.storeLinks
  const steam = record.storeIds.find((store) => store.source === 'steam')
  return steam ? [steamStoreLink(steam.uid)] : []
}
