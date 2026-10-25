import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@/server/db/client'
import { copies, entryVersions, games } from '@/server/db/schema'
import { createIgdbApi } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import { readLibrary } from '@/server/library/read'
import { findEntryIdBySlug, readVersion, setArchived } from '@/server/library/store'
import { parseList } from '@/domain/library/bulk'
import {
  createHandlers,
  MOCK_CLIENT_ID,
  MOCK_CLIENT_SECRET,
  newMockState,
} from '@/server/mocks/handlers'
import { loadFixtures } from '@/server/seed/fixtures'
import { createTestAccount, createTestDatabase, sampleLibraryId } from '@/test/database'
import { network } from '@/test/network'

import { createAdding } from './adding'

const igdbState = newMockState()
const handlers = createHandlers(loadFixtures(), igdbState)
/** IGDB API requests made since `from`, the token's left out. */
const asked = (from: number) =>
  igdbState.requests.slice(from).filter((request) => request.endpoint !== 'token').length

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

const PC = 6
const SWITCH = 130
/** In the fixtures, and not in the default library. */
const HALF_LIFE = 231
const SKYRIM = 472
/** Skyrim on Switch: a port, linked to the Skyrim entry by the default seed. */
const SKYRIM_SWITCH = 37034

let db: Db
/** The sample library, where the tests add. */
let sample: string
let forLibrary: ReturnType<typeof createAdding>
let adding: ReturnType<ReturnType<typeof createAdding>>

beforeEach(async () => {
  network.use(...handlers)
  db = await createTestDatabase('default')
  sample = await sampleLibraryId(db)
  forLibrary = createAdding({ db, igdb: api, readArt: async () => ART })
  adding = forLibrary(sample)
})

describe('searching IGDB to add a game', () => {
  it('marks a game already on the shelf, under whichever version it was found', async () => {
    const answer = await adding.search('Skyrim')
    const skyrim = answer.results.find((result) => result.igdbId === SKYRIM)
    expect(skyrim?.onShelf).toEqual({
      slug: 'the-elder-scrolls-v-skyrim',
      title: 'The Elder Scrolls V: Skyrim',
    })
    // Its Switch port is folded in, not a second result.
    expect(answer.results.some((result) => result.igdbId === SKYRIM_SWITCH)).toBe(false)
    expect(answer.platforms.find((platform) => platform.id === SWITCH)?.name).toBe(
      'Nintendo Switch',
    )
  })

  it('marks a game I archived as archived, with its entry to bring it back (spec 7.4)', async () => {
    const entryId = (await findEntryIdBySlug(db, sample, 'the-elder-scrolls-v-skyrim'))!
    await setArchived(db, sample, entryId, true)
    const answer = await adding.search('Skyrim')
    expect(answer.results.find((result) => result.igdbId === SKYRIM)?.onShelf).toEqual({
      slug: 'the-elder-scrolls-v-skyrim',
      title: 'The Elder Scrolls V: Skyrim',
      archived: entryId,
    })
  })

  it('leaves a game I do not have unmarked', async () => {
    const answer = await adding.search('Half-Life')
    const halfLife = answer.results.find((result) => result.igdbId === HALF_LIFE)
    expect(halfLife).toBeDefined()
    expect(halfLife?.onShelf).toBeUndefined()
  })

  it('says how I own games: the platforms I use most, and the format I last chose on each', async () => {
    const { habits } = await adding.search('Half-Life')
    expect(habits.order.length).toBeGreaterThan(3)
    expect(habits.formats[habits.order[0]!]).toMatch(/^(physical|digital)$/)
  })
})

describe('adding a game', () => {
  it('makes an entry of its own, with its copies, and raises the version', async () => {
    const before = await readVersion(db, sample)
    const added = await adding.add({
      igdbId: HALF_LIFE,
      status: 'backlog',
      copies: [{ platformId: PC, format: 'digital' }],
      rating: 90,
      tags: ['Classics'],
    })
    expect(added).toMatchObject({ slug: 'half-life', title: 'Half-Life', version: before + 1 })
    const library = await readLibrary(db, sample)
    const game = library.games.find((each) => each.slug === 'half-life')
    expect(game).toMatchObject({
      status: 'backlog',
      rating: 90,
      copies: [{ platform: PC, format: 'digital' }],
    })
    expect(game?.colors).toEqual(ART.colors)
    // The names it uses are stored with it, so its filters read in words.
    expect(library.names.genre.length).toBeGreaterThan(0)
  })

  it('undoes an add: the game and everything added with it', async () => {
    const games0 = (await readLibrary(db, sample)).games.length
    const added = await adding.add({ igdbId: HALF_LIFE, status: 'wishlist', copies: [] })
    expect((await readLibrary(db, sample)).games).toHaveLength(games0 + 1)
    await adding.undo(added.undo)
    expect((await readLibrary(db, sample)).games).toHaveLength(games0)
    expect(await db.select().from(games).where(eq(games.igdbId, HALF_LIFE))).toEqual([])
  })

  it('a game already on the shelf gets only the copies it lacked, never a second entry', async () => {
    const games0 = (await readLibrary(db, sample)).games.length
    const added = await adding.add({
      igdbId: SKYRIM,
      status: 'backlog',
      copies: [{ platformId: PC, format: 'physical' }],
    })
    expect(added.slug).toBe('the-elder-scrolls-v-skyrim')
    expect((await readLibrary(db, sample)).games).toHaveLength(games0)
    expect(added.undo.newEntry).toBe(false)
  })

  it('a port of a game I have folds into it, as ADR 001 proposes, and undoes cleanly', async () => {
    // Make the Switch port a stranger to the shelf again.
    const [port] = await db.select().from(games).where(eq(games.igdbId, SKYRIM_SWITCH))
    await db.delete(copies).where(eq(copies.gameId, port!.id))
    await db.delete(entryVersions).where(and(eq(entryVersions.gameId, port!.id)))

    const grouping = await adding.grouping(SKYRIM_SWITCH)
    expect(grouping).toMatchObject({
      action: 'join',
      entry: { slug: 'the-elder-scrolls-v-skyrim' },
      relation: 'port',
      ask: false,
    })

    const games0 = (await readLibrary(db, sample)).games.length
    const added = await adding.add({
      igdbId: SKYRIM_SWITCH,
      status: 'backlog',
      copies: [{ platformId: SWITCH, format: 'digital' }],
    })
    expect(added.slug).toBe('the-elder-scrolls-v-skyrim')
    expect((await readLibrary(db, sample)).games).toHaveLength(games0)
    const skyrim = (await readLibrary(db, sample)).games.find((game) => game.slug === added.slug)
    expect(
      skyrim?.copies.some((copy) => copy.platform === SWITCH && copy.format === 'digital'),
    ).toBe(true)

    await adding.undo(added.undo)
    const after = (await readLibrary(db, sample)).games.find((game) => game.slug === added.slug)
    expect(
      after?.copies.some((copy) => copy.platform === SWITCH && copy.format === 'digital'),
    ).toBe(false)
    expect(await db.select().from(entryVersions).where(eq(entryVersions.gameId, port!.id))).toEqual(
      [],
    )
  })

  it('keeps it apart when I say so', async () => {
    const [port] = await db.select().from(games).where(eq(games.igdbId, SKYRIM_SWITCH))
    await db.delete(copies).where(eq(copies.gameId, port!.id))
    await db.delete(entryVersions).where(eq(entryVersions.gameId, port!.id))
    const games0 = (await readLibrary(db, sample)).games.length
    await adding.add({ igdbId: SKYRIM_SWITCH, status: 'backlog', copies: [], grouping: 'separate' })
    expect((await readLibrary(db, sample)).games).toHaveLength(games0 + 1)
  })
})

describe('matching a pasted list (spec 4.2)', () => {
  /** Titles in the fixtures, and not on the sample shelf. */
  const NEW = ['Crysis', 'Bastion', 'Stray', 'Left 4 Dead', 'Little Nightmares']

  it('matches 50 known titles, every line matched or marked, ten to a request', async () => {
    const shelf = (await readLibrary(db, sample)).games.slice(0, 45).map((game) => game.title)
    const lines = parseList([...shelf, ...NEW].join('\n'))
    expect(lines).toHaveLength(50)
    const before = igdbState.requests.length
    const answer = await adding.match(lines.slice(0, 20))
    // Two of exact titles, and one of platforms the first time they are asked for.
    expect(asked(before)).toBeLessThanOrEqual(3)

    const rest = await adding.match(lines.slice(20))
    const all = [...answer.lines, ...rest.lines]
    expect(all).toHaveLength(50)
    for (const [at, line] of all.entries()) {
      expect(line.confidence, line.text).toBe('exact')
      const onShelf = line.candidates.some((candidate) => candidate.onShelf)
      expect(onShelf, line.text).toBe(at < 45)
    }
  })

  it('reads a year and a platform, and puts the game on that platform first', async () => {
    const [line] = (await adding.match(parseList('Half-Life (1998) [PC]'))).lines
    expect(line).toMatchObject({ title: 'Half-Life', year: 1998, platformId: PC })
    expect(line?.confidence).toBe('exact')
    expect(line?.candidates[0]?.igdbId).toBe(HALF_LIFE)
  })

  it('a title written differently is close, with alternatives; one IGDB does not know is none', async () => {
    const answer = await adding.match(parseList('Elder Scrolls\nZzqx Nothing Like It'))
    const [close, none] = answer.lines
    expect(close?.confidence).toBe('close')
    expect(close?.candidates.length).toBeGreaterThan(1)
    expect(close?.candidates.map((candidate) => candidate.igdbId)).toContain(SKYRIM)
    expect(none).toMatchObject({ confidence: 'none', candidates: [] })
  })
})

describe('adding many games', () => {
  const CRYSIS = 'crysis'

  it('asks IGDB once for all of them, and stores each where ADR 001 puts it', async () => {
    const [crysis, bastion] = (await adding.match(parseList('Crysis\nBastion'))).lines.map(
      (line) => line.candidates[0]!,
    )
    const games0 = (await readLibrary(db, sample)).games.length
    const singleStart = igdbState.requests.length
    await adding.add({ igdbId: HALF_LIFE, status: 'backlog', copies: [] })
    const single = asked(singleStart)

    const before = igdbState.requests.length
    const { results, version } = await adding.addMany([
      {
        igdbId: crysis!.igdbId,
        status: 'backlog',
        copies: [{ platformId: PC, format: 'digital' }],
      },
      { igdbId: bastion!.igdbId, status: 'completed', copies: [] },
      // Already mine: only the copy it lacked.
      { igdbId: SKYRIM, status: 'backlog', copies: [{ platformId: PC, format: 'physical' }] },
    ])
    // Three games, in fewer requests than three adds one at a time.
    expect(asked(before)).toBeLessThan(3 * single)
    expect(results.map((result) => result.ok && result.value.slug)).toEqual([
      CRYSIS,
      'bastion',
      'the-elder-scrolls-v-skyrim',
    ])
    expect(version).toBe(await readVersion(db, sample))
    const library = await readLibrary(db, sample)
    expect(library.games).toHaveLength(games0 + 3)
    expect(library.games.find((game) => game.slug === 'bastion')?.status).toBe('completed')
  })

  it('one that fails leaves the rest', async () => {
    const { results } = await adding.addMany([
      { igdbId: 999_999_999, status: 'backlog', copies: [] },
      { igdbId: HALF_LIFE, status: 'backlog', copies: [] },
    ])
    expect(results).toEqual([
      { ok: false, reason: 'not-found' },
      expect.objectContaining({ ok: true, value: expect.objectContaining({ slug: 'half-life' }) }),
    ])
  })

  it('undoes a list: every game and everything added with it', async () => {
    const before = await readLibrary(db, sample)
    const { results } = await adding.addMany([
      { igdbId: HALF_LIFE, status: 'backlog', copies: [{ platformId: PC, format: 'digital' }] },
      { igdbId: SKYRIM, status: 'backlog', copies: [{ platformId: SWITCH, format: 'digital' }] },
    ])
    const undo = results.flatMap((result) => (result.ok ? [result.value.undo] : []))
    expect(undo).toHaveLength(2)
    // One taken away by hand since is passed over.
    await adding.undo(undo[0]!)
    await adding.undoMany(undo)
    const after = await readLibrary(db, sample)
    expect(after.games.map((game) => game.slug)).toEqual(before.games.map((game) => game.slug))
    const skyrim = after.games.find((game) => game.slug === 'the-elder-scrolls-v-skyrim')
    expect(skyrim?.copies).toEqual(
      before.games.find((game) => game.slug === 'the-elder-scrolls-v-skyrim')?.copies,
    )
  })
})

describe('adding to a library of one’s own (ADR 004)', () => {
  let mine: ReturnType<ReturnType<typeof createAdding>>
  let me: string

  beforeEach(async () => {
    me = await createTestAccount(db, 'me')
    mine = forLibrary(me)
  })

  it('marks only what is on my shelf, not on another’s', async () => {
    const answer = await mine.search('Skyrim')
    expect(answer.results.find((result) => result.igdbId === SKYRIM)?.onShelf).toBeUndefined()
  })

  it('adds a game another library has, sharing its IGDB record, and touches nothing of theirs', async () => {
    // What is theirs about each game. The record itself is shared, and an add refreshes it.
    const theirsOf = async () =>
      (await readLibrary(db, sample)).games.map(({ slug, status, rating, copies, tags }) => ({
        slug,
        status,
        rating,
        copies,
        tags,
      }))
    const theirs = await theirsOf()
    const theirVersion = await readVersion(db, sample)
    const added = await mine.add({
      igdbId: SKYRIM,
      status: 'playing',
      copies: [{ platformId: PC, format: 'physical' }],
    })
    // Two entries now point at the one record.
    expect(await db.select().from(games).where(eq(games.igdbId, SKYRIM))).toHaveLength(1)
    expect((await readLibrary(db, me)).games).toEqual([
      expect.objectContaining({ slug: added.slug, status: 'playing' }),
    ])
    expect(await theirsOf()).toEqual(theirs)
    expect(await readVersion(db, sample)).toBe(theirVersion)

    await mine.undo(added.undo)
    expect((await readLibrary(db, me)).games).toEqual([])
    // Still theirs, so the record stays.
    expect(await db.select().from(games).where(eq(games.igdbId, SKYRIM))).toHaveLength(1)
    expect(await theirsOf()).toEqual(theirs)
  })

  it('cannot undo another library’s add', async () => {
    const added = await adding.add({ igdbId: HALF_LIFE, status: 'backlog', copies: [] })
    await expect(mine.undo(added.undo)).rejects.toMatchObject({ code: 'not-found' })
    expect((await readLibrary(db, sample)).games.some((game) => game.slug === 'half-life')).toBe(
      true,
    )
  })
})
