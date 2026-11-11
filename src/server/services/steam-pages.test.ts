import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StoreGame } from '@/domain/steam/store-game'
import type { Db } from '@/server/db/client'
import { games } from '@/server/db/schema'
import { readGameExtras, readLibrary } from '@/server/library/read'
import { readVersion } from '@/server/library/store'
import { SEED_NOW } from '@/server/seed/mine'
import { createTestDatabase, sampleLibraryId } from '@/test/database'

import { createSteamPages, type SteamPagesDeps } from './steam-pages'

let db: Db
let sample: string
let app: string
let skyrimId: string
let slug: string

const NOW = SEED_NOW + 86_400_000
const ART = {
  colors: ['#112233', '#445566', '#778899'] as [string, string, string],
  thumbhash: 'c3RlYW0=',
}

/** A store page as `GetItems` answers it, for the app asked. */
const storePage = (appId: string, over: Partial<StoreGame> = {}): StoreGame => ({
  id: Number(appId),
  success: 1,
  name: 'On the store',
  type: 0,
  content_descriptorids: [],
  tagids: [],
  basic_info: { short_description: 'The store’s words.', developers: [], publishers: [] },
  assets: {
    asset_url_format: `steam/apps/${appId}/\${FILENAME}?t=1`,
    library_capsule: 'aa11/library_capsule.jpg',
    library_capsule_2x: 'aa11/library_capsule_2x.jpg',
    library_hero: 'bb22/library_hero.jpg',
  },
  screenshots: {
    all_ages_screenshots: [
      { filename: `steam/apps/${appId}/ss_one.jpg?t=1` },
      { filename: `steam/apps/${appId}/ss_two.jpg?t=1` },
    ],
    mature_content_screenshots: [{ filename: `steam/apps/${appId}/ss_adult.jpg?t=1` }],
  },
  ...over,
})

/** The store, answering with these pages and nothing else; or failing, when told to. */
const store = (pages: readonly StoreGame[], fail = false) =>
  vi.fn(async (apps: readonly string[]) => {
    if (fail) throw new Error('Steam is down')
    const found = new Map<string, StoreGame>()
    for (const page of pages) if (apps.includes(String(page.id))) found.set(String(page.id), page)
    return found
  })

const reader = (deps: Partial<SteamPagesDeps> & Pick<SteamPagesDeps, 'storeGames'>) =>
  createSteamPages({ db, readArt: vi.fn(async () => ART), ...deps })

const skyrim = async () => (await db.select().from(games).where(eq(games.id, skyrimId)))[0]!

const onTheShelf = async () =>
  (await readLibrary(db, sample)).games.find((game) => game.slug === slug)!

beforeEach(async () => {
  db = await createTestDatabase('default')
  sample = await sampleLibraryId(db)
  const [row] = await db
    .select({ id: games.id, storeIds: games.storeIds, slug: games.slug })
    .from(games)
    .where(eq(games.igdbId, 472))
  skyrimId = row!.id
  slug = row!.slug
  app = row!.storeIds.find((store) => store.source === 'steam')!.uid
})

describe('reading a game’s store page (ADR 010)', () => {
  it('makes the store’s cover the one every shelf draws, with its own colors', async () => {
    const before = await onTheShelf()
    const { changed, libraries } = await reader({ storeGames: store([storePage(app)]) })(
      undefined,
      NOW,
    )
    expect(changed).toBe(1)
    expect(libraries).toEqual([sample])

    const game = await onTheShelf()
    expect(game.cover).toBe(`steam/apps/${app}/aa11/library_capsule.jpg@2x`)
    expect(game.coverRatio).toBe(67)
    expect(game.colors).toEqual(ART.colors)
    expect(game.hash).toBe(ART.thumbhash)
    expect(before.cover).not.toBe(game.cover)
    expect((await skyrim()).cover?.id).toBe(before.cover)
    expect((await skyrim()).steamPageCheckedAt).toBe(NOW)
  })

  it('shows the store’s screenshots, summary and art on the game’s page, and IGDB’s videos', async () => {
    const igdb = (await readGameExtras(db, sample, slug))!
    await reader({ storeGames: store([storePage(app)]) })(undefined, NOW)
    const extras = (await readGameExtras(db, sample, slug))!
    expect(extras.screenshots.map((shot) => shot.id)).toEqual([
      `steam/apps/${app}/ss_one.jpg`,
      `steam/apps/${app}/ss_two.jpg`,
      `steam/apps/${app}/ss_adult.jpg`,
    ])
    expect(extras.screenshots[2]).toHaveProperty('mature', true)
    expect(extras.summary).toBe('The store’s words.')
    expect(extras.artworks[0]).toMatchObject({ id: `steam/apps/${app}/bb22/library_hero.jpg` })
    expect(extras.artworks.slice(1)).toEqual(igdb.artworks)
    expect(extras.videos).toEqual(igdb.videos)
    expect(extras.length).toEqual(igdb.length)
  })

  it('keeps IGDB’s for each field the store leaves empty', async () => {
    const igdb = (await readGameExtras(db, sample, slug))!
    const shelfBefore = await onTheShelf()
    await reader({
      storeGames: store([storePage(app, { screenshots: undefined, assets: undefined })]),
    })(undefined, NOW)
    const extras = (await readGameExtras(db, sample, slug))!
    expect(extras.screenshots).toEqual(igdb.screenshots)
    expect(extras.artworks).toEqual(igdb.artworks)
    expect(extras.summary).toBe('The store’s words.')
    expect((await onTheShelf()).cover).toBe(shelfBefore.cover)
  })

  it('puts the game back on IGDB’s record when the store no longer has its page', async () => {
    const igdb = await onTheShelf()
    const read = reader({ storeGames: store([storePage(app)]) })
    await read(undefined, NOW)
    const gone = await reader({ storeGames: store([]) })(undefined, NOW + 1)
    expect(gone.libraries).toEqual([sample])
    const game = await onTheShelf()
    expect(game.cover).toBe(igdb.cover)
    expect(game.colors).toEqual(igdb.colors)
    expect(game.hash).toBe(igdb.hash)
    expect((await skyrim()).steamPage).toBeNull()
  })

  it('gives the shelves holding it a new version only when what it shows has changed', async () => {
    await reader({ storeGames: store([storePage(app)]) })(undefined, NOW)
    const version = await readVersion(db, sample)
    const readArt = vi.fn(async () => ART)
    const again = await reader({ storeGames: store([storePage(app)]), readArt })(undefined, NOW + 1)
    expect(again.changed).toBe(0)
    expect(readArt).not.toHaveBeenCalled()
    expect(await readVersion(db, sample)).toBe(version)
    expect((await skyrim()).steamPageCheckedAt).toBe(NOW + 1)
  })

  it('keeps what a game has when Steam fails, and reads it first next time', async () => {
    await reader({ storeGames: store([storePage(app)]) })(undefined, NOW)
    const failed = await reader({ storeGames: store([], true) })(undefined, NOW + 1)
    expect(failed).toEqual({ checked: 0, changed: 0, libraries: [] })
    const row = await skyrim()
    expect(row.steamCover).not.toBeNull()
    expect(row.steamPageCheckedAt).toBe(NOW)
  })

  it('keeps IGDB’s colors under a store cover that can’t be read', async () => {
    const igdb = await onTheShelf()
    await reader({ storeGames: store([storePage(app)]), readArt: vi.fn(async () => undefined) })(
      undefined,
      NOW,
    )
    const game = await onTheShelf()
    expect(game.cover).toMatch(/library_capsule\.jpg@2x$/)
    expect(game.colors).toEqual(igdb.colors)
    expect(game.hash).toBe(igdb.hash)
  })

  it('leaves a game whose cover the time allowed doesn’t reach as it was, unread', async () => {
    let time = 0
    const clock = () => time
    const readArt = vi.fn(async () => ART)
    // The time runs out as the store answers for this game.
    const storeGames = vi.fn(async (apps: readonly string[]) => {
      if (apps.includes(app)) time = 10_000
      return store([storePage(app)])(apps)
    })
    const { changed } = await reader({ storeGames, readArt, clock })(undefined, NOW, 'all', 5_000)
    expect(storeGames.mock.calls.flatMap(([apps]) => apps)).toContain(app)
    expect(changed).toBe(0)
    expect(readArt).not.toHaveBeenCalled()
    expect((await skyrim()).steamPageCheckedAt).toBeNull()
  })

  it('makes a game the store says is for adults one on the shelf, whatever IGDB says', async () => {
    expect((await onTheShelf()).adult).toBeUndefined()
    await reader({ storeGames: store([storePage(app, { content_descriptorids: [4] })]) })(
      undefined,
      NOW,
    )
    expect((await onTheShelf()).adult).toBe(true)
    const extras = (await readGameExtras(db, sample, slug))!
    expect(extras.artworks[0]).toHaveProperty('mature', true)
  })

  it('takes the game’s own app among several: one the store shows as a game', async () => {
    const held = await skyrim()
    await db
      .update(games)
      .set({ storeIds: [{ source: 'steam', uid: '9999901' }, ...held.storeIds] })
      .where(eq(games.id, skyrimId))
    const soundtrack = storePage('9999901', { type: 6 })
    await reader({ storeGames: store([soundtrack, storePage(app)]) })(undefined, NOW)
    expect((await skyrim()).steamPage?.app).toBe(app)
  })

  it('never reads a game IGDB doesn’t have: its page was read whole already (ADR 006)', async () => {
    await db.update(games).set({ igdbId: null, steamAppId: app }).where(eq(games.id, skyrimId))
    const storeGames = store([storePage(app)])
    await reader({ storeGames })(undefined, NOW)
    expect(storeGames.mock.calls.flatMap(([apps]) => apps)).not.toContain(app)
    expect((await skyrim()).steamPageCheckedAt).toBeNull()
  })

  it('after an add, reads only games never read', async () => {
    const storeGames = store([storePage(app)])
    const read = reader({ storeGames })
    await read(undefined, NOW)
    await db.update(games).set({ steamPageCheckedAt: null }).where(eq(games.id, skyrimId))
    const { checked } = await read(100, NOW + 1, 'unread')
    expect(checked).toBe(1)
    expect(storeGames.mock.calls.at(-1)![0]).toEqual([app])
    const calls = storeGames.mock.calls.length
    await read(100, NOW + 2, 'unread')
    expect(storeGames).toHaveBeenCalledTimes(calls)
  })

  it('asks the store a hundred apps at a time', async () => {
    const storeGames = store([])
    await reader({ storeGames })(undefined, NOW)
    for (const [apps] of storeGames.mock.calls) expect(apps.length).toBeLessThanOrEqual(100)
  })
})
