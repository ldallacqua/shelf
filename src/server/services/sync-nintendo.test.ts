import { and, eq } from 'drizzle-orm'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Db } from '@/server/db/client'
import { copies, entries, entryVersions, games, playTime, sourceItems } from '@/server/db/schema'
import { createIgdbApi } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import { createHandlers, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '@/server/mocks/handlers'
import { createNintendoHandlers, newNintendoMockState } from '@/server/mocks/nintendo'
import { MOCK_NINTENDO, MOCK_STEAM } from '@/server/mocks/owner'
import { type Fixtures, loadFixtures } from '@/server/seed/fixtures'
import { readLink, saveLink } from '@/server/sync/memory'
import { createNintendo, NINTENDO_STORE_API } from '@/server/sync/nintendo'
import { seal } from '@/server/sync/sealed'
import { createSteam } from '@/server/sync/steam'
import { createTestAccount, createTestDatabase } from '@/test/database'
import { network } from '@/test/network'

import { createSync } from './sync'

/**
 * A Nintendo sync (ADR 003, "Built: Nintendo"), against the Nintendo double
 * and `fixtures/nintendo/play-history.json`: Nintendo lists what was
 * played, so every game waits for me, matched by title or not, until I say
 * how I own it; then it is a copy on the console the game is for.
 */

const api = createIgdbApi(
  createIgdbClient({
    credentials: () => ({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET }),
    tokens: memoryTokenStore(),
    perSecond: 100_000,
    sleep: async () => undefined,
  }),
)
const ART = {
  colors: ['#112233', '#445566', '#778899'] as [string, string, string],
  thumbhash: 'aGFzaA==',
}

const SWITCH = 130
/** Fixture games the made-up Nintendo account played, by their IGDB ids. */
const BREATH_OF_THE_WILD = 7346
const TEARS_OF_THE_KINGDOM = 119388
const MARIO_KART_8 = 26764
const SUPER_MARIO_ODYSSEY = 26758
const HOLLOW_KNIGHT = 14593
/** Of the nine games played, seven have one title on IGDB's Switch; two have none. */
const MATCHED = 7
const PLAYED = 9

/** Two days after the made-up account last played Mario Kart 8 Deluxe; months after the rest. */
const NOW = Date.parse('2025-11-01T12:00:00Z')
const KEY = Buffer.alloc(32, 5).toString('base64')

let db: Db
let nintendoState: ReturnType<typeof newNintendoMockState>
let sync: ReturnType<typeof createSync>

beforeEach(async () => {
  vi.stubEnv('PLATFORM_TOKEN_KEY', KEY)
  nintendoState = newNintendoMockState()
  network.use(...createHandlers(loadFixtures()), ...createNintendoHandlers(nintendoState))
  db = await createTestDatabase('default')
  sync = createSync({
    db,
    igdb: api,
    readArt: async () => ART,
    steam: createSteam({ key: () => MOCK_STEAM.key }),
    nintendo: createNintendo(),
  })
})

afterEach(() => vi.unstubAllEnvs())

/** An account with an empty shelf, linked to the made-up Nintendo account with this session. */
const linked = async (handle = 'player', session: string = MOCK_NINTENDO.sessionToken) => {
  const id = await createTestAccount(db, handle)
  await saveLink(db, id, 'nintendo', {
    externalId: MOCK_NINTENDO.accountId,
    sealed: seal(session, id, 'nintendo'),
  })
  return id
}

/** Steps until nothing is left, as the page does. */
const syncAll = async (libraryId: string, now = NOW) => {
  const library = sync(libraryId)
  let step = await library.step('nintendo', { read: true }, now)
  for (let i = 0; i < 20 && step.remaining > 0; i += 1) {
    step = await library.step('nintendo', {}, now)
  }
  return step
}

const itemNamed = async (libraryId: string, title: string) => {
  const [row] = await db
    .select()
    .from(sourceItems)
    .where(and(eq(sourceItems.userId, libraryId), eq(sourceItems.title, title)))
    .limit(1)
  return row!
}

/** The copies of the entry a fixture record is linked to, with its status. */
const shelved = async (libraryId: string, igdbId: number) =>
  db
    .select({
      status: entries.status,
      platformId: copies.platformId,
      format: copies.format,
      copyId: copies.id,
    })
    .from(entryVersions)
    .innerJoin(games, eq(games.id, entryVersions.gameId))
    .innerJoin(entries, eq(entries.id, entryVersions.entryId))
    .innerJoin(copies, eq(copies.entryId, entries.id))
    .where(and(eq(entryVersions.userId, libraryId), eq(games.igdbId, igdbId)))

const entriesOf = (libraryId: string) =>
  db.select().from(entries).where(eq(entries.userId, libraryId))

describe('a first sync from Nintendo', () => {
  it('matches what it can by title, and puts nothing on the shelf until I say how I own it', async () => {
    const me = await linked()
    const step = await syncAll(me)
    expect(step.link.problem).toBeNull()
    expect(step.link.counts['needs-you']).toBe(PLAYED)
    expect(step.link.counts['on-shelf']).toBe(0)
    expect(await entriesOf(me)).toHaveLength(0)
    expect(await itemNamed(me, 'Hollow Knight')).toMatchObject({
      evidence: 'played',
      igdbId: HOLLOW_KNIGHT,
      resolvedBy: 'title',
      decision: 'pending',
      platformId: SWITCH,
      minutes: 2100,
    })
    expect(await itemNamed(me, 'Mario Kart World')).toMatchObject({ igdbId: null })
  })

  it('lists the games it matched before the ones it could not find', async () => {
    const me = await linked()
    await syncAll(me)
    const listed = await sync(me).list('nintendo', 'needs-you')
    expect(listed.map((item) => item.match !== undefined)).toEqual([
      ...Array<boolean>(MATCHED).fill(true),
      ...Array<boolean>(PLAYED - MATCHED).fill(false),
    ])
  })

  it('lists each match with its game, for me to confirm', async () => {
    const me = await linked()
    await syncAll(me)
    const listed = await sync(me).list('nintendo', 'needs-you')
    expect(listed).toHaveLength(PLAYED)
    expect(listed.filter((item) => item.match)).toHaveLength(MATCHED)
    expect(listed.find((item) => item.title === 'Hollow Knight')?.match).toMatchObject({
      igdbId: HOLLOW_KNIGHT,
      title: 'Hollow Knight',
    })
    expect(listed.find((item) => item.title === 'Mario Kart World')?.match).toBeUndefined()
  })

  it('counts a game played on a Switch and then a Switch 2 once, with both consoles’ minutes', async () => {
    const me = await linked()
    await syncAll(me)
    expect(await itemNamed(me, 'The Legend of Zelda: Tears of the Kingdom')).toMatchObject({
      igdbId: TEARS_OF_THE_KINGDOM,
      minutes: 6000,
      platformId: SWITCH,
    })
  })
})

describe('my answers about what Nintendo saw me play', () => {
  it('puts a confirmed game on the shelf as I own it, playing if I played it these two weeks', async () => {
    const me = await linked()
    await syncAll(me)
    const kart = await itemNamed(me, 'Mario Kart 8 Deluxe')
    const answered = await sync(me).answer(
      'nintendo',
      kart.id,
      { kind: 'confirm', format: 'physical' },
      undefined,
      NOW,
    )
    expect(answered.item.state).toBe('on-shelf')
    const [copy] = await shelved(me, MARIO_KART_8)
    expect(copy).toMatchObject({ status: 'playing', platformId: SWITCH, format: 'physical' })
    const hours = await db.select().from(playTime).where(eq(playTime.copyId, copy!.copyId))
    expect(hours).toEqual([expect.objectContaining({ source: 'nintendo', minutes: 2400 })])
  })

  it('makes a Switch game played on a Switch 2 a Switch copy, unsorted when played long ago', async () => {
    const me = await linked()
    await syncAll(me)
    const odyssey = await itemNamed(me, 'Super Mario Odyssey')
    await sync(me).answer(
      'nintendo',
      odyssey.id,
      { kind: 'confirm', format: 'digital' },
      undefined,
      NOW,
    )
    expect(await shelved(me, SUPER_MARIO_ODYSSEY)).toEqual([
      expect.objectContaining({ status: 'unsorted', platformId: SWITCH, format: 'digital' }),
    ])
  })

  it('confirms many at once as one format, and puts them on the shelf step by step', async () => {
    const me = await linked()
    await syncAll(me)
    const matched = (await sync(me).list('nintendo', 'needs-you')).filter((item) => item.match)
    let step = await sync(me).confirmMany(
      'nintendo',
      matched.map((item) => item.id),
      'digital',
      undefined,
      NOW,
    )
    for (let i = 0; i < 5 && step.remaining > 0; i += 1)
      step = await sync(me).step('nintendo', {}, NOW)
    expect(step.link.counts['on-shelf']).toBe(MATCHED)
    expect(step.link.counts['needs-you']).toBe(PLAYED - MATCHED)
    expect(await shelved(me, BREATH_OF_THE_WILD)).toEqual([
      expect.objectContaining({ platformId: SWITCH, format: 'digital' }),
    ])
  })

  it('leaves alone what has no match, when confirming many', async () => {
    const me = await linked()
    await syncAll(me)
    const world = await itemNamed(me, 'Mario Kart World')
    await sync(me).confirmMany('nintendo', [world.id], 'digital', undefined, NOW)
    expect(await itemNamed(me, 'Mario Kart World')).toMatchObject({ decision: 'pending' })
  })

  it('takes a game I pick as the match, still waiting for how I own it', async () => {
    const me = await linked()
    await syncAll(me)
    const world = await itemNamed(me, 'Mario Kart World')
    const picked = await sync(me).answer('nintendo', world.id, {
      kind: 'pick',
      igdbId: MARIO_KART_8,
    })
    expect(picked.item.state).toBe('needs-you')
    expect(await itemNamed(me, 'Mario Kart World')).toMatchObject({
      igdbId: MARIO_KART_8,
      resolvedBy: 'owner',
      decision: 'pending',
    })
    const listed = await sync(me).list('nintendo', 'needs-you')
    expect(listed.find((item) => item.id === world.id)?.match?.igdbId).toBe(MARIO_KART_8)
  })

  it('puts a game I pick with its format on the shelf at once', async () => {
    const me = await linked()
    await syncAll(me)
    const world = await itemNamed(me, 'Mario Kart World')
    const picked = await sync(me).answer('nintendo', world.id, {
      kind: 'pick',
      igdbId: MARIO_KART_8,
      format: 'digital',
    })
    expect(picked.item.state).toBe('on-shelf')
  })

  it('refuses to confirm what has nothing to confirm', async () => {
    const me = await linked()
    await syncAll(me)
    const world = await itemNamed(me, 'Mario Kart World')
    await expect(
      sync(me).answer('nintendo', world.id, { kind: 'confirm', format: 'digital' }),
    ).rejects.toMatchObject({ code: 'conflict' })
  })
})

describe('the Nintendo session', () => {
  it('says to sign in again when Nintendo has ended it, and lists nothing', async () => {
    const me = await linked('player', MOCK_NINTENDO.endedSessionToken)
    const step = await syncAll(me)
    expect(step.link.problem).toBe('signed-out')
    expect(step.link.counts['needs-you']).toBe(0)
    expect(nintendoState.asked).toEqual(['token'])
  })

  it('says to sign in again when the session was sealed for another link', async () => {
    const me = await createTestAccount(db, 'player')
    const other = await createTestAccount(db, 'other')
    await saveLink(db, me, 'nintendo', {
      externalId: MOCK_NINTENDO.accountId,
      sealed: seal(MOCK_NINTENDO.sessionToken, other, 'nintendo'),
    })
    expect((await syncAll(me)).link.problem).toBe('signed-out')
    expect(nintendoState.asked).toEqual([])
  })

  it('is signed in again by a new sign-in, which clears the problem and keeps the answers', async () => {
    const me = await linked('player', MOCK_NINTENDO.endedSessionToken)
    await syncAll(me)
    await saveLink(db, me, 'nintendo', {
      externalId: MOCK_NINTENDO.accountId,
      sealed: seal(MOCK_NINTENDO.sessionToken, me, 'nintendo'),
    })
    expect((await readLink(db, me, 'nintendo'))?.problem).toBeNull()
    expect((await syncAll(me)).link.counts['needs-you']).toBe(PLAYED)
  })
})

describe('the names Nintendo gives its games', () => {
  const SWITCH_2 = 508
  /** IGDB's own record for Breath of the Wild's Switch 2 Edition, which the fixtures leave out. */
  const SWITCH_2_EDITION = 338072

  /** The fixtures, with that record: IGDB writes a hyphen where Nintendo writes a dash. */
  const withEdition = (): Fixtures => {
    const fixtures = loadFixtures()
    const games = new Map(fixtures.games)
    games.set(SWITCH_2_EDITION, {
      ...fixtures.games.get(BREATH_OF_THE_WILD)!,
      id: SWITCH_2_EDITION,
      name: 'The Legend of Zelda: Breath of the Wild - Nintendo Switch 2 Edition',
      slug: 'the-legend-of-zelda-breath-of-the-wild-nintendo-switch-2-edition',
      platforms: [SWITCH_2],
      first_release_date: Date.parse('2025-06-05T00:00:00Z') / 1000,
    })
    return { ...fixtures, games }
  }

  const played = (titleId: string, titleName: string, platform: string) => ({
    titleId,
    titleName,
    platform,
    totalPlayedMinutes: 600,
    firstPlayedAt: '2025-06-05T12:00:00Z',
    lastPlayedAt: '2025-07-01T12:00:00Z',
  })

  beforeEach(() => {
    network.use(
      ...createHandlers(withEdition()),
      http.get(`${NINTENDO_STORE_API}/users/me/play_histories`, () =>
        HttpResponse.json({
          playHistories: [
            played(
              '0100A3D008C5C000',
              'The Legend of Zelda: Breath of the Wild – Nintendo Switch 2 Edition',
              'BEE',
            ),
            played('0100E8C00A0E4000', 'Super Mario Odyssey – Nintendo Switch 2 Edition', 'BEE'),
            played('0100633007D48000', 'Hollow Knight for Nintendo Switch', 'HAC'),
          ],
        }),
      ),
    )
  })

  it('finds a Switch 2 Edition as IGDB keeps it, its own record, however the dash is written', async () => {
    const me = await linked()
    await syncAll(me)
    const zelda = await itemNamed(
      me,
      'The Legend of Zelda: Breath of the Wild – Nintendo Switch 2 Edition',
    )
    expect(zelda).toMatchObject({ igdbId: SWITCH_2_EDITION, resolvedBy: 'title' })
  })

  it('finds the game itself where IGDB keeps no record of the edition, or Nintendo names the console', async () => {
    const me = await linked()
    await syncAll(me)
    expect(await itemNamed(me, 'Super Mario Odyssey – Nintendo Switch 2 Edition')).toMatchObject({
      igdbId: SUPER_MARIO_ODYSSEY,
    })
    expect(await itemNamed(me, 'Hollow Knight for Nintendo Switch')).toMatchObject({
      igdbId: HOLLOW_KNIGHT,
    })
  })

  it('puts a confirmed Switch 2 Edition on the Switch 2', async () => {
    const me = await linked()
    await syncAll(me)
    const zelda = await itemNamed(
      me,
      'The Legend of Zelda: Breath of the Wild – Nintendo Switch 2 Edition',
    )
    await sync(me).answer(
      'nintendo',
      zelda.id,
      { kind: 'confirm', format: 'digital' },
      undefined,
      NOW,
    )
    expect(await shelved(me, SWITCH_2_EDITION)).toEqual([
      expect.objectContaining({ platformId: SWITCH_2, format: 'digital' }),
    ])
  })
})
