import { eq } from 'drizzle-orm'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import { beforeEach, describe, expect, it } from 'vitest'

import { toGameData, type GameData } from '@/domain/igdb/game'
import { igdbGameSchema } from '@/domain/igdb/schema'
import { curatedPlatform } from '@/domain/platforms/platforms'
import type { Db } from '@/server/db/client'
import {
  copies,
  entries,
  entryTags,
  entryVersions,
  games,
  playSessions,
  playTime,
  sourceItems,
  tags,
} from '@/server/db/schema'
import {
  readArchived,
  readLibrary,
  readOwnerGame,
  readOwnerPlay,
  readStanding,
  readStoreHours,
} from '@/server/library/read'
import {
  addCopy,
  addVersion,
  createEntry,
  feedCopies,
  findEntryIdBySlug,
  LibraryError,
  readLinkedMembers,
  readShelves,
  readVersion,
  removeCopy,
  removeEntry,
  removeEntryForUndo,
  removeLibrary,
  restoreEntry,
  saveGame,
  savePlatforms,
  separateVersion,
  patchEntry,
  recordPlaySessions,
  setPrimary,
  setArchived,
  setStatuses,
  setTags,
  updateEntry,
} from '@/server/library/store'
import { createTestAccount, createTestDatabase } from '@/test/database'

const game = (id: number, name: string, extra: Record<string, unknown> = {}): GameData =>
  toGameData(
    igdbGameSchema.parse({
      id,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      cover: { image_id: `co${id}`, width: 600, height: 800 },
      ...extra,
    }),
  )

const PC = 6
const SWITCH = 130
const PS4 = 48

let db: Db
/** The library the tests write to, and another account's beside it. */
let me: string
let other: string
let skyrim: string
let skyrimSwitch: string
let hades: string

beforeEach(async () => {
  db = await createTestDatabase()
  me = await createTestAccount(db, 'me')
  other = await createTestAccount(db, 'other')
  const platforms = [PC, SWITCH, PS4].flatMap((id) => curatedPlatform(id) ?? [])
  await savePlatforms(db, platforms)
  skyrim = await saveGame(db, game(472, 'The Elder Scrolls V: Skyrim', { platforms: [6, 9, 12] }), {
    lineage: [],
  })
  skyrimSwitch = await saveGame(
    db,
    game(37034, 'Skyrim Switch', { platforms: [130], game_type: { id: 11 }, parent_game: 472 }),
    { lineage: [{ igdbId: 472, via: 'port' }] },
  )
  hades = await saveGame(db, game(113112, 'Hades', { platforms: [6, 130] }), { lineage: [] })
})

const count = async (table: SQLiteTable) => (await db.select().from(table)).length

describe('saveGame', () => {
  it('stores an IGDB record once, and refreshes it when stored again', async () => {
    const again = await saveGame(db, game(472, 'Skyrim, renamed'), { lineage: [] })
    expect(again).toBe(skyrim)
    const [row] = await db.select().from(games).where(eq(games.id, skyrim))
    expect(row?.title).toBe('Skyrim, renamed')
    expect(await count(games)).toBe(3)
  })

  it('keeps cover colors when a refresh brings none', async () => {
    const art = { colors: ['#111111', '#222222', '#333333'] as const, thumbhash: 'abc' }
    await saveGame(db, game(472, 'Skyrim'), { lineage: [], art })
    await saveGame(db, game(472, 'Skyrim'), { lineage: [] })
    const [row] = await db.select().from(games).where(eq(games.id, skyrim))
    expect(row?.colors).toEqual(art.colors)
    expect(row?.thumbhash).toBe('abc')
  })
})

describe('createEntry', () => {
  it('adds a game with its primary version, copies, playtime and tags', async () => {
    const id = await createEntry(db, me, {
      primaryGameId: skyrim,
      status: 'completed',
      rating: 90,
      completedOn: '2024-05-01',
      copies: [{ platformId: PC, format: 'digital' }],
      tags: ['Comfort Game', 'comfort game', '  replay   someday '],
    })
    const library = await readLibrary(db, me)
    expect(library.games).toHaveLength(1)
    expect(library.games[0]).toMatchObject({
      slug: 'the-elder-scrolls-v-skyrim',
      status: 'completed',
      rating: 90,
      completedOn: '2024-05-01',
      copies: [{ platform: PC, format: 'digital' }],
    })
    expect(library.names.tag).toEqual([
      { name: 'Comfort Game', slug: 'comfort-game' },
      { name: 'replay someday', slug: 'replay-someday' },
    ])
    expect(await findEntryIdBySlug(db, me, 'the-elder-scrolls-v-skyrim')).toBe(id)
  })

  it('allows a wishlist game with no copies', async () => {
    await createEntry(db, me, { primaryGameId: hades, status: 'wishlist' })
    expect((await readLibrary(db, me)).games[0]).toMatchObject({ status: 'wishlist', copies: [] })
  })

  it('keeps the platforms a wishlist game is wanted on, and only on the wishlist (spec 7.5)', async () => {
    await createEntry(db, me, { primaryGameId: hades, status: 'wishlist', wanted: [SWITCH] })
    await createEntry(db, me, { primaryGameId: skyrim, status: 'backlog', wanted: [PC] })
    const games = (await readLibrary(db, me)).games
    expect(games.find((each) => each.slug === 'hades')?.wanted).toEqual([SWITCH])
    expect(games.find((each) => each.slug === 'the-elder-scrolls-v-skyrim')).not.toHaveProperty(
      'wanted',
    )
  })

  it('refuses a second entry for a record that already has one', async () => {
    await createEntry(db, me, { primaryGameId: skyrim, status: 'backlog' })
    await expect(
      createEntry(db, me, { primaryGameId: skyrim, status: 'backlog' }),
    ).rejects.toMatchObject({ code: 'conflict' })
    // The failed attempt left nothing behind.
    expect(await count(entries)).toBe(1)
  })

  it.each([
    ['an unknown status', { status: 'finished' }],
    ['a rating above 100', { rating: 101 }],
    ['a rating that is not whole', { rating: 7.5 }],
    ['a completion date that is not a day', { completedOn: '2024-13-40' }],
  ])('refuses %s', async (_what, bad) => {
    const input = { primaryGameId: skyrim, status: 'backlog', ...bad } as never
    expect(() => createEntry(db, me, input)).toThrow(LibraryError)
    expect(await count(entries)).toBe(0)
  })

  it('refuses the same platform and format twice', async () => {
    const twice = [
      { platformId: PC, format: 'digital' as const },
      { platformId: PC, format: 'digital' as const },
    ]
    await expect(
      createEntry(db, me, { primaryGameId: skyrim, status: 'backlog', copies: twice }),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(await count(entries)).toBe(0)
  })
})

describe('one entry per game, a copy per platform (ADR 001)', () => {
  let entry: string

  beforeEach(async () => {
    entry = await createEntry(db, me, {
      primaryGameId: skyrim,
      status: 'playing',
      copies: [{ platformId: PC, format: 'digital' }],
    })
  })

  it('adding a second platform never creates a second entry', async () => {
    await addVersion(db, me, entry, skyrimSwitch, 'port')
    await addCopy(db, me, entry, { platformId: SWITCH, format: 'physical', gameId: skyrimSwitch })

    const library = await readLibrary(db, me)
    expect(library.games).toHaveLength(1)
    expect(library.games[0]?.copies).toEqual([
      { platform: PC, format: 'digital' },
      // The Switch copy is the port, which has a cover of its own.
      { platform: SWITCH, format: 'physical', cover: 'co37034' },
    ])
    // Released-on platforms are the union across the entry's versions.
    expect(library.games[0]?.platforms.sort((a, b) => a - b)).toEqual([6, 9, 12, 130])
  })

  it('allows a disc and a download of the same game on one platform', async () => {
    await addCopy(db, me, entry, { platformId: PC, format: 'physical' })
    expect((await readLibrary(db, me)).games[0]?.copies).toHaveLength(2)
  })

  it('refuses the same platform and format twice', async () => {
    await expect(
      addCopy(db, me, entry, { platformId: PC, format: 'digital' }),
    ).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('refuses a record that belongs to another entry', async () => {
    const another = await createEntry(db, me, { primaryGameId: skyrimSwitch, status: 'backlog' })
    expect(another).not.toBe(entry)
    await expect(addVersion(db, me, entry, skyrimSwitch, 'port')).rejects.toMatchObject({
      code: 'conflict',
    })
  })

  it('finds the entry from the address of any of its versions', async () => {
    await addVersion(db, me, entry, skyrimSwitch, 'port')
    expect(await findEntryIdBySlug(db, me, 'skyrim-switch')).toBe(entry)
    expect(await findEntryIdBySlug(db, me, 'no-such-game')).toBeUndefined()
  })

  it('lists linked records with their family chains, for the grouping rule', async () => {
    await addVersion(db, me, entry, skyrimSwitch, 'port')
    const members = await readLinkedMembers(db, me)
    expect(members.sort((a, b) => a.igdbId - b.igdbId)).toEqual([
      { igdbId: 472, lineage: [], entryId: entry },
      { igdbId: 37034, lineage: [{ igdbId: 472, via: 'port' }], entryId: entry },
    ])
  })

  it('changes which version supplies the title, keeping one primary', async () => {
    await addVersion(db, me, entry, skyrimSwitch, 'port')
    await setPrimary(db, me, entry, skyrimSwitch)
    expect((await readLibrary(db, me)).games[0]?.title).toBe('Skyrim Switch')
    const versions = await db.select().from(entryVersions).where(eq(entryVersions.entryId, entry))
    expect(versions.filter((version) => version.relation === 'primary')).toHaveLength(1)
  })

  it('shows the chosen display copy first', async () => {
    const second = await addCopy(db, me, entry, { platformId: PS4, format: 'physical' })
    await updateEntry(db, me, entry, { displayCopyId: second })
    expect((await readLibrary(db, me)).games[0]?.copies.map((copy) => copy.platform)).toEqual([
      PS4,
      PC,
    ])
  })

  it('refuses a display copy that belongs to another game', async () => {
    const another = await createEntry(db, me, {
      primaryGameId: hades,
      status: 'backlog',
      copies: [{ platformId: SWITCH, format: 'digital' }],
    })
    const [foreign] = await db.select().from(copies).where(eq(copies.entryId, another))
    await expect(updateEntry(db, me, entry, { displayCopyId: foreign?.id })).rejects.toMatchObject({
      code: 'invalid',
    })
  })

  it('forgets the display copy when that copy is removed', async () => {
    const second = await addCopy(db, me, entry, { platformId: PS4, format: 'physical' })
    await updateEntry(db, me, entry, { displayCopyId: second })
    await removeCopy(db, me, second)
    const [row] = await db.select().from(entries).where(eq(entries.id, entry))
    expect(row?.displayCopyId).toBeNull()
    expect((await readLibrary(db, me)).games[0]?.copies).toEqual([
      { platform: PC, format: 'digital' },
    ])
  })
})

describe('changing an entry', () => {
  let entry: string

  beforeEach(async () => {
    entry = await createEntry(db, me, { primaryGameId: hades, status: 'backlog' })
  })

  it('updates status, rating and notes', async () => {
    await updateEntry(db, me, entry, { status: 'completed', rating: 95, notes: '  Great.  ' })
    const [row] = await db.select().from(entries).where(eq(entries.id, entry))
    expect(row).toMatchObject({ status: 'completed', rating: 95, notes: 'Great.' })
  })

  it('lets what was wanted go once a game leaves the wishlist (spec 7.5)', async () => {
    const wanted = async () => (await db.select().from(entries).where(eq(entries.id, entry)))[0]
    await updateEntry(db, me, entry, { status: 'wishlist', wanted: [SWITCH, SWITCH, PC] })
    expect((await wanted())?.wanted).toEqual([SWITCH, PC])
    await updateEntry(db, me, entry, { status: 'backlog' })
    expect((await wanted())?.wanted).toBeNull()

    await patchEntry(db, me, entry, { mine: { status: 'wishlist', wanted: [SWITCH] } })
    expect((await readLibrary(db, me)).games[0]?.wanted).toEqual([SWITCH])
    await patchEntry(db, me, entry, { mine: { wanted: null } })
    expect((await wanted())?.wanted).toBeNull()

    await patchEntry(db, me, entry, { mine: { wanted: [PC] } })
    await setStatuses(db, me, [entry], 'playing')
    expect((await wanted())?.wanted).toBeNull()
  })

  it('refuses a wish that is not platform ids', async () => {
    expect(() => updateEntry(db, me, entry, { wanted: [1.5] })).toThrow(LibraryError)
  })

  it('clears a rating with null', async () => {
    await updateEntry(db, me, entry, { rating: 80 })
    await updateEntry(db, me, entry, { rating: null })
    expect((await readLibrary(db, me)).games[0]).not.toHaveProperty('rating')
  })

  it('only tells visitors about notes that are public', async () => {
    await updateEntry(db, me, entry, { notes: 'Private thoughts.' })
    expect((await readLibrary(db, me)).games[0]?.hasNotes).toBe(false)
    await updateEntry(db, me, entry, { notesPublic: true })
    expect((await readLibrary(db, me)).games[0]?.hasNotes).toBe(true)
  })

  const session = (id: string, seconds: number, entryId = entry) => ({
    id,
    entryId,
    startedAt: 1_000,
    endedAt: 1_000 + seconds * 2_000,
    seconds,
  })

  it('adds up what the app counted, each session once however often it is sent', async () => {
    await recordPlaySessions(db, me, [session('a', 90), session('b', 90)])
    await recordPlaySessions(db, me, [session('a', 90)])
    expect((await readLibrary(db, me)).games[0]?.minutes).toBe(3)
    await recordPlaySessions(db, me, [session('a', 150)])
    expect((await readLibrary(db, me)).games[0]?.minutes).toBe(4)
    await recordPlaySessions(db, me, [session('a', 60)])
    expect((await readLibrary(db, me)).games[0]?.minutes).toBe(4)
  })

  it('keeps no session of a game not in this library, and says which it kept', async () => {
    expect(await recordPlaySessions(db, me, [session('a', 60), session('b', 60, 'nope')])).toEqual([
      'a',
    ])
    expect(await count(playSessions)).toBe(1)
  })

  it('counts hours once typed by hand for nothing, and keeps them', async () => {
    await db.insert(playTime).values({
      id: 'typed',
      entryId: entry,
      copyId: null,
      source: 'manual',
      minutes: 600,
      updatedAt: 1,
    })
    expect((await readLibrary(db, me)).games[0]?.minutes).toBe(0)
    expect(await count(playTime)).toBe(1)
  })

  it('replaces tags, and forgets a tag nothing wears', async () => {
    await setTags(db, me, entry, ['short', 'soundtrack'])
    await setTags(db, me, entry, ['soundtrack'])
    expect((await db.select().from(tags)).map((tag) => tag.slug)).toEqual(['soundtrack'])
  })

  it('says not-found for an entry that does not exist', async () => {
    await expect(updateEntry(db, me, 'nope', { status: 'playing' })).rejects.toMatchObject({
      code: 'not-found',
    })
    await expect(removeEntry(db, me, 'nope')).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('each library is its own (ADR 004)', () => {
  it('keeps one entry per record per library, so two libraries may each have the game', async () => {
    await createEntry(db, me, { primaryGameId: skyrim, status: 'backlog' })
    await createEntry(db, other, { primaryGameId: skyrim, status: 'completed' })
    expect((await readLibrary(db, me)).games.map((game) => game.status)).toEqual(['backlog'])
    expect((await readLibrary(db, other)).games.map((game) => game.status)).toEqual(['completed'])
  })

  it('answers not-found for another library’s entry, copy or address, and changes nothing', async () => {
    const theirs = await createEntry(db, other, {
      primaryGameId: hades,
      status: 'backlog',
      copies: [{ platformId: PC, format: 'digital' }],
      tags: ['roguelike'],
    })
    const [copy] = await db.select().from(copies).where(eq(copies.entryId, theirs))

    for (const attempt of [
      () => updateEntry(db, me, theirs, { status: 'dropped' }),
      () => addCopy(db, me, theirs, { platformId: SWITCH, format: 'physical' }),
      () => removeCopy(db, me, copy?.id ?? ''),
      () => setTags(db, me, theirs, ['mine now']),
      () => addVersion(db, me, theirs, skyrimSwitch, 'port'),
      () => setPrimary(db, me, theirs, hades),
      () => removeEntry(db, me, theirs),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: 'not-found' })
    }
    expect(await findEntryIdBySlug(db, me, 'hades')).toBeUndefined()
    expect((await readLibrary(db, other)).games[0]).toMatchObject({
      status: 'backlog',
      copies: [{ platform: PC, format: 'digital' }],
    })
    expect((await db.select().from(tags)).map((tag) => tag.slug)).toEqual(['roguelike'])
  })

  it('keeps tag names per library: the same tag in two libraries is two tags', async () => {
    const mine = await createEntry(db, me, {
      primaryGameId: hades,
      status: 'backlog',
      tags: ['short'],
    })
    await createEntry(db, other, { primaryGameId: hades, status: 'backlog', tags: ['short'] })
    await setTags(db, me, mine, [])
    expect((await readLibrary(db, me)).names.tag).toEqual([])
    expect((await readLibrary(db, other)).names.tag).toEqual([{ name: 'short', slug: 'short' }])
  })
})

describe('adult games (spec 3.13)', () => {
  it('are those IGDB gives the theme Erotic, or the ESRB rates Adults Only', async () => {
    const erotic = await saveGame(db, game(9001, 'Lula', { themes: [42] }), { lineage: [] })
    const rated = await saveGame(
      db,
      game(9002, 'Hatred', {
        age_ratings: [{ organization: 1, rating_category: { rating: 'AO' } }],
      }),
      { lineage: [] },
    )
    for (const primaryGameId of [erotic, rated, hades]) {
      await createEntry(db, me, { primaryGameId, status: 'backlog' })
    }
    const games = (await readLibrary(db, me)).games
    expect(
      games
        .filter((each) => each.adult)
        .map((each) => each.slug)
        .sort(),
    ).toEqual(['hatred', 'lula'])
  })
})

describe('a game only its own account sees (spec 11.1)', () => {
  it('is in no read but its own account’s, nor are the names only it has', async () => {
    const entry = await createEntry(db, me, { primaryGameId: hades, status: 'playing' })
    await createEntry(db, me, { primaryGameId: skyrim, status: 'backlog' })
    await updateEntry(db, me, entry, { private: true })

    const seen = await readLibrary(db, me)
    expect(seen.games.map((game) => game.slug)).toEqual(['the-elder-scrolls-v-skyrim'])
    // Hades alone is on the Switch: a visitor is not offered it.
    expect(seen.names.platform.map((platform) => platform.id)).not.toContain(SWITCH)

    const mine = await readLibrary(db, me, { mine: true })
    expect(mine.games.find((game) => game.slug === 'hades')).toMatchObject({ private: true })
    expect(
      mine.games.find((game) => game.slug === 'the-elder-scrolls-v-skyrim'),
    ).not.toHaveProperty('private')
    expect(await readOwnerGame(db, me, entry)).toMatchObject({ private: true })

    await updateEntry(db, me, entry, { private: false })
    expect((await readLibrary(db, me)).games).toHaveLength(2)
  })
})

describe('archiving a game (spec 7.4)', () => {
  it('takes it out of every answer, keeps it whole, and brings it back as it was', async () => {
    const entry = await createEntry(db, me, {
      primaryGameId: hades,
      status: 'completed',
      rating: 90,
      notes: 'A gift.',
      copies: [{ platformId: SWITCH, format: 'physical' }],
      tags: ['gift'],
    })
    await createEntry(db, me, { primaryGameId: skyrim, status: 'backlog' })
    const before = await readVersion(db, me)

    await setArchived(db, me, entry, true)
    expect(await readVersion(db, me)).toBe(before + 1)
    expect((await readLibrary(db, me)).games.map((game) => game.slug)).toEqual([
      'the-elder-scrolls-v-skyrim',
    ])
    expect(await readOwnerGame(db, me, entry)).toBeUndefined()
    expect((await readStanding(db, me)).tally).toMatchObject({ completed: 0, backlog: 1 })
    expect(await readArchived(db, me)).toEqual([
      expect.objectContaining({
        entryId: entry,
        slug: 'hades',
        title: 'Hades',
        platforms: ['Switch'],
      }),
    ])

    await setArchived(db, me, entry, false)
    expect(await readArchived(db, me)).toEqual([])
    expect(await readOwnerGame(db, me, entry)).toMatchObject({
      status: 'completed',
      rating: 90,
      notes: 'A gift.',
      tags: ['gift'],
      copies: [expect.objectContaining({ platformId: SWITCH, format: 'physical' })],
    })
  })

  it('changes nothing when asked twice, and nothing in another library', async () => {
    const entry = await createEntry(db, me, { primaryGameId: hades, status: 'backlog' })
    await setArchived(db, me, entry, true)
    const version = await readVersion(db, me)
    await setArchived(db, me, entry, true)
    expect(await readVersion(db, me)).toBe(version)
    await expect(setArchived(db, other, entry, false)).rejects.toThrow(LibraryError)
    expect(await readArchived(db, other)).toEqual([])
  })
})

describe('separating a version (spec 7.6)', () => {
  let ds2: string
  let scholar: string

  beforeEach(async () => {
    ds2 = await saveGame(db, game(2368, 'Dark Souls II', { platforms: [6, 48] }), { lineage: [] })
    scholar = await saveGame(
      db,
      game(9727, 'Dark Souls II: Scholar of the First Sin', {
        platforms: [6, 48],
        game_type: { id: 10 },
        parent_game: 2368,
      }),
      { lineage: [{ igdbId: 2368, via: 'expanded' }] },
    )
  })

  /** A Steam app feeding a copy, as a sync leaves it. */
  const steamItem = (storeId: string, igdbId: number, minutes: number, copyId: string) =>
    db.insert(sourceItems).values({
      id: `steam-${storeId}`,
      userId: me,
      source: 'steam',
      storeId,
      title: storeId,
      evidence: 'owned',
      minutes,
      firstSeenAt: 1,
      lastSeenAt: 1,
      igdbId,
      resolvedBy: 'store_id',
      decision: 'copy',
      copyId,
    })

  const steamMinutes = async () =>
    (await db.select().from(playTime).where(eq(playTime.source, 'steam'))).reduce(
      (sum, row) => sum + row.minutes,
      0,
    )

  it('splits a copy both fed, and leaves everything I set where it was', async () => {
    const entry = await createEntry(db, me, {
      primaryGameId: ds2,
      status: 'completed',
      rating: 90,
      notes: 'Both of them.',
      copies: [{ platformId: PC, format: 'digital' }],
      tags: ['souls'],
      addedAt: 1000,
    })
    await addVersion(db, me, entry, scholar, 'expanded')
    const [copy] = await db.select().from(copies).where(eq(copies.entryId, entry))
    await steamItem('236430', 2368, 600, copy!.id)
    await steamItem('335300', 9727, 1200, copy!.id)
    await feedCopies(db, me, 'steam')
    const before = await readVersion(db, me)

    const apart = await separateVersion(db, me, entry, scholar)

    expect(await readVersion(db, me)).toBe(before + 1)
    expect(await readOwnerGame(db, me, entry)).toMatchObject({
      status: 'completed',
      rating: 90,
      notes: 'Both of them.',
      tags: ['souls'],
      versions: [expect.objectContaining({ gameId: ds2, relation: 'primary' })],
      copies: [
        expect.objectContaining({
          id: copy!.id,
          platformId: PC,
          synced: [{ source: 'steam', minutes: 600 }],
        }),
      ],
    })
    const separated = await readOwnerGame(db, me, apart)
    expect(separated).toMatchObject({
      title: 'Dark Souls II: Scholar of the First Sin',
      status: 'unsorted',
      tags: [],
      tracked: 0,
      versions: [expect.objectContaining({ gameId: scholar, relation: 'primary' })],
      copies: [
        expect.objectContaining({
          platformId: PC,
          format: 'digital',
          synced: [{ source: 'steam', minutes: 1200 }],
        }),
      ],
    })
    expect(separated?.rating).toBeUndefined()
    expect(separated?.notes).toBeUndefined()
    expect(await steamMinutes()).toBe(1800)
    const [row] = await db.select().from(entries).where(eq(entries.id, apart))
    expect(row?.addedAt).toBe(1000)
    expect((await readLibrary(db, me)).games.map((game) => game.slug).sort()).toEqual([
      'dark-souls-ii',
      'dark-souls-ii-scholar-of-the-first-sin',
    ])
  })

  it('takes a copy that names the version whole, and gives back what feeds it of another', async () => {
    const entry = await createEntry(db, me, {
      primaryGameId: ds2,
      status: 'playing',
      copies: [{ platformId: PS4, format: 'physical' }],
    })
    await addVersion(db, me, entry, scholar, 'expanded')
    const named = await addCopy(db, me, entry, {
      platformId: PC,
      format: 'digital',
      gameId: scholar,
    })
    await updateEntry(db, me, entry, { displayCopyId: named })
    await steamItem('335300', 9727, 1200, named)
    await steamItem('236430', 2368, 600, named)
    await feedCopies(db, me, 'steam')

    const apart = await separateVersion(db, me, entry, scholar)

    expect((await readOwnerGame(db, me, apart))?.copies).toEqual([
      expect.objectContaining({ id: named, synced: [{ source: 'steam', minutes: 1200 }] }),
    ])
    const left = await readOwnerGame(db, me, entry)
    expect(left?.copies.map((each) => [each.platformId, each.synced])).toEqual(
      expect.arrayContaining([
        [PS4, undefined],
        [PC, [{ source: 'steam', minutes: 600 }]],
      ]),
    )
    const [row] = await db.select().from(entries).where(eq(entries.id, entry))
    expect(row?.displayCopyId).toBeNull()
    expect(await steamMinutes()).toBe(1800)
  })

  it('keeps a private game private', async () => {
    const entry = await createEntry(db, me, { primaryGameId: ds2, status: 'backlog' })
    await addVersion(db, me, entry, scholar, 'expanded')
    await patchEntry(db, me, entry, { mine: { private: true } })
    const apart = await separateVersion(db, me, entry, scholar)
    expect((await readOwnerGame(db, me, apart))?.private).toBe(true)
  })

  it('refuses the main version, a version it lacks, an archived game and another library', async () => {
    const entry = await createEntry(db, me, { primaryGameId: ds2, status: 'backlog' })
    await addVersion(db, me, entry, scholar, 'expanded')
    await expect(separateVersion(db, me, entry, ds2)).rejects.toMatchObject({ code: 'invalid' })
    await expect(separateVersion(db, me, entry, hades)).rejects.toMatchObject({
      code: 'not-found',
    })
    await expect(separateVersion(db, other, entry, scholar)).rejects.toMatchObject({
      code: 'not-found',
    })
    await setArchived(db, me, entry, true)
    await expect(separateVersion(db, me, entry, scholar)).rejects.toMatchObject({
      code: 'not-found',
    })
    expect(await count(entries)).toBe(1)
  })
})

describe('removeEntry', () => {
  it('removes the game and everything added with it', async () => {
    const entry = await createEntry(db, me, {
      primaryGameId: skyrim,
      status: 'completed',
      copies: [{ platformId: PC, format: 'digital' }],
      tags: ['short'],
    })
    await addVersion(db, me, entry, skyrimSwitch, 'port')
    await createEntry(db, me, { primaryGameId: hades, status: 'backlog', tags: ['roguelike'] })

    await removeEntry(db, me, entry)

    expect(await count(entries)).toBe(1)
    expect(await count(entryVersions)).toBe(1)
    expect(await count(copies)).toBe(0)
    expect(await count(playTime)).toBe(0)
    expect(await count(entryTags)).toBe(1)
    // Its cached IGDB records go too; the other game's stays.
    expect((await db.select().from(games)).map((row) => row.igdbId)).toEqual([113112])
    expect((await db.select().from(tags)).map((tag) => tag.slug)).toEqual(['roguelike'])
  })

  it('keeps an IGDB record another library still uses', async () => {
    const entry = await createEntry(db, me, { primaryGameId: hades, status: 'backlog' })
    await createEntry(db, other, { primaryGameId: hades, status: 'completed' })
    await removeEntry(db, me, entry)
    expect((await db.select().from(games)).map((row) => row.igdbId)).toContain(113112)
    expect((await readLibrary(db, other)).games[0]).toMatchObject({ title: 'Hades' })
  })
})

describe('removing a game for Undo, and putting it back', () => {
  it('puts it back onto the IGDB record another library made for it in the meantime', async () => {
    const entry = await createEntry(db, me, {
      primaryGameId: hades,
      status: 'completed',
      copies: [{ platformId: SWITCH, format: 'physical', gameId: hades }],
      tags: ['roguelike'],
    })
    const undo = await removeEntryForUndo(db, me, entry)
    expect(await db.select().from(games).where(eq(games.igdbId, 113112))).toEqual([])

    const again = await saveGame(db, game(113112, 'Hades', { platforms: [6, 130] }), {
      lineage: [],
    })
    await createEntry(db, other, { primaryGameId: again, status: 'backlog' })
    await restoreEntry(db, me, undo)

    expect((await readLibrary(db, me)).games[0]).toMatchObject({
      title: 'Hades',
      status: 'completed',
      copies: [{ platform: SWITCH, format: 'physical' }],
    })
    expect(await db.select().from(games).where(eq(games.igdbId, 113112))).toHaveLength(1)
    expect((await readLibrary(db, other)).games[0]).toMatchObject({ status: 'backlog' })
  })

  it('will not put back another library’s removal', async () => {
    const entry = await createEntry(db, other, { primaryGameId: hades, status: 'backlog' })
    const undo = await removeEntryForUndo(db, other, entry)
    await expect(restoreEntry(db, me, undo)).rejects.toMatchObject({ code: 'not-found' })
    expect((await readLibrary(db, me)).games).toEqual([])
  })
})

describe('removeLibrary', () => {
  it('removes everything in one library, and records only it used', async () => {
    await createEntry(db, me, {
      primaryGameId: skyrim,
      status: 'backlog',
      copies: [{ platformId: PC, format: 'digital' }],
      tags: ['mine'],
    })
    await createEntry(db, me, { primaryGameId: hades, status: 'backlog' })
    await createEntry(db, other, { primaryGameId: hades, status: 'completed', tags: ['theirs'] })

    await removeLibrary(db, me)

    expect((await readLibrary(db, me)).games).toEqual([])
    expect(await readVersion(db, me)).toBe(0)
    expect(await readShelves(db, me)).toEqual([])
    expect((await db.select().from(tags)).map((tag) => tag.slug)).toEqual(['theirs'])
    // Skyrim was only mine; Hades is theirs too. The Switch port was never on a shelf.
    expect(
      (await db.select().from(games))
        .map((row) => row.igdbId)
        .sort((a, b) => Number(a) - Number(b)),
    ).toEqual([37034, 113112])
    expect((await readLibrary(db, other)).games).toHaveLength(1)
  })
})

describe('the library version', () => {
  it('rises by one on every write, in that library only', async () => {
    const before = await readVersion(db, me)
    const theirs = await readVersion(db, other)
    const entry = await createEntry(db, me, { primaryGameId: hades, status: 'backlog' })
    expect(await readVersion(db, me)).toBe(before + 1)

    const copy = await addCopy(db, me, entry, { platformId: PC, format: 'digital' })
    await updateEntry(db, me, entry, { status: 'playing' })
    await recordPlaySessions(db, me, [
      { id: 'a', entryId: entry, startedAt: 1, endedAt: 2, seconds: 60 },
    ])
    await setTags(db, me, entry, ['short'])
    await removeCopy(db, me, copy)
    await removeEntry(db, me, entry)
    expect(await readVersion(db, me)).toBe(before + 7)
    expect(await readVersion(db, other)).toBe(theirs)
  })

  it('does not rise when a write is refused', async () => {
    const before = await readVersion(db, me)
    await createEntry(db, me, { primaryGameId: hades, status: 'backlog' })
    await createEntry(db, me, { primaryGameId: hades, status: 'backlog' }).catch(() => undefined)
    expect(await readVersion(db, me)).toBe(before + 1)
  })
})

describe('a game’s apps on Steam (spec 7.7)', () => {
  /** A Steam app feeding a copy of mine, as a sync leaves it. */
  const steamItem = (
    library: string,
    storeId: string,
    igdbId: number,
    minutes: number,
    copyId: string,
  ) =>
    db.insert(sourceItems).values({
      id: `steam-${library}-${storeId}`,
      userId: library,
      source: 'steam',
      storeId,
      title: storeId,
      evidence: 'owned',
      minutes,
      firstSeenAt: 1,
      lastSeenAt: 1,
      igdbId,
      resolvedBy: 'store_id',
      decision: 'copy',
      copyId,
    })

  const onSteam = (uid: string) => ({
    external_games: [{ uid, external_game_source: 1, platform: PC }],
  })

  it('names the app the Steam sync found I own, the main version’s before one played more', async () => {
    const ds2 = await saveGame(
      db,
      game(2368, 'Dark Souls II', { platforms: [PC], ...onSteam('236430') }),
      { lineage: [] },
    )
    const scholar = await saveGame(
      db,
      game(9727, 'Dark Souls II: Scholar of the First Sin', {
        platforms: [PC],
        game_type: { id: 10 },
        parent_game: 2368,
        ...onSteam('335300'),
      }),
      { lineage: [{ igdbId: 2368, via: 'expanded' }] },
    )
    const entry = await createEntry(db, me, {
      primaryGameId: ds2,
      status: 'playing',
      copies: [{ platformId: PC, format: 'digital' }],
    })
    await addVersion(db, me, entry, scholar, 'expanded')
    const [copy] = await db.select().from(copies).where(eq(copies.entryId, entry))
    await steamItem(me, '335300', 9727, 1200, copy!.id)
    await steamItem(me, '236430', 2368, 60, copy!.id)

    expect((await readOwnerGame(db, me, entry))?.steam).toEqual({
      owned: '236430',
      known: ['236430', '335300'],
    })
  })

  it('names the one played most when none is the main version’s', async () => {
    const entry = await createEntry(db, me, {
      primaryGameId: hades,
      status: 'playing',
      copies: [{ platformId: PC, format: 'digital' }],
    })
    const [copy] = await db.select().from(copies).where(eq(copies.entryId, entry))
    await steamItem(me, '111', 9999, 10, copy!.id)
    await steamItem(me, '222', 9998, 90, copy!.id)

    expect((await readOwnerGame(db, me, entry))?.steam).toEqual({
      owned: '222',
      known: ['222', '111'],
    })
  })

  it('without a Steam item, names only what IGDB lists, and nothing when IGDB lists none', async () => {
    const grimDawn = await saveGame(
      db,
      game(9999, 'Grim Dawn', { platforms: [PC], ...onSteam('219990') }),
      { lineage: [] },
    )
    const listed = await createEntry(db, me, { primaryGameId: grimDawn, status: 'backlog' })
    expect((await readOwnerGame(db, me, listed))?.steam).toEqual({ known: ['219990'] })

    const unlisted = await createEntry(db, me, { primaryGameId: skyrimSwitch, status: 'backlog' })
    expect((await readOwnerGame(db, me, unlisted))?.steam).toBeUndefined()
  })

  it('never takes another library’s Steam item', async () => {
    const entry = await createEntry(db, me, {
      primaryGameId: hades,
      status: 'playing',
      copies: [{ platformId: PC, format: 'digital' }],
    })
    const [copy] = await db.select().from(copies).where(eq(copies.entryId, entry))
    await steamItem(other, '333', 9999, 10, copy!.id)

    expect((await readOwnerGame(db, me, entry))?.steam).toBeUndefined()
  })

  it('gives every game of mine, by its address, with its entry and its apps, for Ready to play', async () => {
    const grimDawn = await saveGame(
      db,
      game(9999, 'Grim Dawn', { platforms: [PC], ...onSteam('219990') }),
      { lineage: [] },
    )
    const listed = await createEntry(db, me, { primaryGameId: grimDawn, status: 'backlog' })
    const owned = await createEntry(db, me, {
      primaryGameId: hades,
      status: 'playing',
      copies: [{ platformId: PC, format: 'digital' }],
    })
    const [copy] = await db.select().from(copies).where(eq(copies.entryId, owned))
    await steamItem(me, '1145360', 113112, 30, copy!.id)
    const plain = await createEntry(db, me, { primaryGameId: skyrimSwitch, status: 'backlog' })
    // Another library's game, and a game of mine archived, are not on my shelf.
    await createEntry(db, other, { primaryGameId: grimDawn, status: 'backlog' })

    const play = await readOwnerPlay(db, me)
    expect(play).toEqual(
      expect.arrayContaining([
        { slug: 'grim-dawn', entryId: listed, steam: ['219990'] },
        { slug: 'hades', entryId: owned, steam: ['1145360'] },
        expect.objectContaining({ entryId: plain, steam: [] }),
      ]),
    )
    expect(play).toHaveLength(3)
  })
})

describe('the day a game was finished (spec 7.3)', () => {
  let entry: string
  let pc: string
  let onSwitch: string

  /** One platform's record of the game, on one of its copies, last played at `at`. */
  const played = (source: 'steam' | 'nintendo', copyId: string, at: number | null) =>
    db.insert(sourceItems).values({
      id: `${source}-${copyId}`,
      userId: me,
      source,
      storeId: `${source}-hades`,
      title: 'Hades',
      evidence: 'played',
      minutes: 600,
      lastPlayedAt: at,
      firstSeenAt: 1,
      lastSeenAt: 1,
      igdbId: 113112,
      resolvedBy: 'store_id',
      decision: 'copy',
      copyId,
    })

  const finishedOn = async () =>
    (await db.select().from(entries).where(eq(entries.id, entry)))[0]?.completedOn ?? null

  beforeEach(async () => {
    entry = await createEntry(db, me, {
      primaryGameId: hades,
      status: 'playing',
      copies: [
        { platformId: PC, format: 'digital' },
        { platformId: SWITCH, format: 'digital' },
      ],
    })
    const rows = await db.select().from(copies).where(eq(copies.entryId, entry))
    pc = rows.find((row) => row.platformId === PC)!.id
    onSwitch = rows.find((row) => row.platformId === SWITCH)!.id
  })

  it('is the day it was last played on any platform, when it is marked completed without one', async () => {
    await played('steam', pc, Date.parse('2024-03-10T20:00:00Z'))
    await played('nintendo', onSwitch, Date.parse('2025-06-01T09:30:00Z'))
    await updateEntry(db, me, entry, { status: 'completed' })
    expect(await finishedOn()).toBe('2025-06-01')
    expect((await readOwnerGame(db, me, entry))?.lastPlayedOn).toBe('2025-06-01')
  })

  it('keeps a day I chose, and a later play moves no day once set', async () => {
    await played('steam', pc, Date.parse('2024-03-10T20:00:00Z'))
    await updateEntry(db, me, entry, { status: 'completed', completedOn: '2023-01-01' })
    expect(await finishedOn()).toBe('2023-01-01')

    await updateEntry(db, me, entry, { completedOn: null })
    expect(await finishedOn()).toBe('2024-03-10')
    await db
      .update(sourceItems)
      .set({ lastPlayedAt: Date.parse('2026-01-05T12:00:00Z') })
      .where(eq(sourceItems.copyId, pc))
    await feedCopies(db, me, 'steam')
    await updateEntry(db, me, entry, { status: 'completed' })
    expect(await finishedOn()).toBe('2024-03-10')
  })

  it('stays unknown when no platform saw it played, and is no finish while not completed', async () => {
    await played('steam', pc, null)
    await updateEntry(db, me, entry, { status: 'completed' })
    expect(await finishedOn()).toBeNull()
    expect((await readOwnerGame(db, me, entry))?.lastPlayedOn).toBeUndefined()

    await updateEntry(db, me, entry, { status: 'playing' })
    await db
      .update(sourceItems)
      .set({ lastPlayedAt: Date.parse('2025-06-01T09:30:00Z') })
      .where(eq(sourceItems.copyId, pc))
    await feedCopies(db, me, 'steam')
    expect(await finishedOn()).toBeNull()
  })

  it('comes with a sync for a completed game still without one, raising the version', async () => {
    await updateEntry(db, me, entry, { status: 'completed' })
    expect(await finishedOn()).toBeNull()
    await played('nintendo', onSwitch, Date.parse('2025-06-01T09:30:00Z'))
    const before = await readVersion(db, me)
    expect(await feedCopies(db, me, 'nintendo')).toBe(true)
    expect(await finishedOn()).toBe('2025-06-01')
    expect(await readVersion(db, me)).toBeGreaterThan(before)
  })

  it('comes the same way for games marked completed many at once, or through the API', async () => {
    await played('steam', pc, Date.parse('2024-03-10T20:00:00Z'))
    await setStatuses(db, me, [entry], 'completed')
    expect(await finishedOn()).toBe('2024-03-10')

    await patchEntry(db, me, entry, { mine: { completedOn: '2022-02-02' } })
    await patchEntry(db, me, entry, { mine: { completedOn: null } })
    expect(await finishedOn()).toBe('2024-03-10')
  })

  it('is never taken from another library’s play', async () => {
    const theirs = await createEntry(db, other, {
      primaryGameId: hades,
      status: 'completed',
      copies: [{ platformId: PC, format: 'digital' }],
    })
    const [copy] = await db.select().from(copies).where(eq(copies.entryId, theirs))
    await db.insert(sourceItems).values({
      id: 'steam-theirs',
      userId: other,
      source: 'steam',
      storeId: '1145360',
      title: 'Hades',
      evidence: 'played',
      minutes: 60,
      lastPlayedAt: Date.parse('2025-06-01T09:30:00Z'),
      firstSeenAt: 1,
      lastSeenAt: 1,
      igdbId: 113112,
      resolvedBy: 'store_id',
      decision: 'copy',
      copyId: copy!.id,
    })
    await updateEntry(db, me, entry, { status: 'completed' })
    expect(await finishedOn()).toBeNull()
    await feedCopies(db, me, 'steam')
    const [row] = await db.select().from(entries).where(eq(entries.id, theirs))
    expect(row?.completedOn).toBeNull()
  })
})

describe('time a game sat open, unplayed (ADR 003)', () => {
  let entry: string

  /** What Steam reports for the game: 112 hours. */
  const STEAM = 6720

  beforeEach(async () => {
    entry = await createEntry(db, me, {
      primaryGameId: hades,
      status: 'completed',
      copies: [{ platformId: PC, format: 'digital' }],
    })
    const [copy] = await db.select().from(copies).where(eq(copies.entryId, entry))
    await db.insert(sourceItems).values({
      id: 'steam-hades',
      userId: me,
      source: 'steam',
      storeId: '1145360',
      title: 'Hades',
      evidence: 'played',
      minutes: STEAM,
      firstSeenAt: 1,
      lastSeenAt: 1,
      igdbId: 113112,
      resolvedBy: 'store_id',
      decision: 'copy',
      copyId: copy!.id,
    })
    await feedCopies(db, me, 'steam')
    // IGDB: 20 hours for a playthrough, 40 to see everything.
    await db
      .update(games)
      .set({ length: { normally: 1200, completely: 2400 } })
      .where(eq(games.id, hades))
  })

  const minutes = async () => (await readLibrary(db, me)).games[0]?.minutes

  it('comes off what its stores report, and the owner’s record says how much', async () => {
    expect(await minutes()).toBe(STEAM)
    expect((await readOwnerGame(db, me, entry))?.idle).toBeUndefined()
    const before = await readVersion(db, me)
    await patchEntry(db, me, entry, { idle: 4320 })
    expect(await minutes()).toBe(2400)
    expect((await readOwnerGame(db, me, entry))?.idle).toBe(4320)
    expect(await readVersion(db, me)).toBeGreaterThan(before)
  })

  it('stays taken off as the store reports more, and never takes it below nothing', async () => {
    await patchEntry(db, me, entry, { idle: 4320 })
    await db
      .update(sourceItems)
      .set({ minutes: STEAM + 120 })
      .where(eq(sourceItems.id, 'steam-hades'))
    await feedCopies(db, me, 'steam')
    expect(await minutes()).toBe(2520)
    await patchEntry(db, me, entry, { idle: 99_999 })
    expect(await minutes()).toBe(0)
  })

  it('never comes off what the app counted', async () => {
    await recordPlaySessions(db, me, [
      { id: 'a', entryId: entry, startedAt: 1, endedAt: 2, seconds: 3000 * 60 },
    ])
    await patchEntry(db, me, entry, { idle: 4320 })
    expect(await minutes()).toBe(3000)
  })

  it('is a whole number of minutes, none below nothing', async () => {
    for (const idle of [-60, 1.5]) {
      // Refused before anything is written.
      await expect(async () => patchEntry(db, me, entry, { idle })).rejects.toMatchObject({
        code: 'invalid',
      })
    }
  })

  it('offers the game for a look while its stores report far past IGDB and nothing is said', async () => {
    expect(await readStoreHours(db, me)).toEqual([
      expect.objectContaining({
        entryId: entry,
        slug: 'hades',
        title: 'Hades',
        reported: STEAM,
        sources: ['steam'],
        igdb: { minutes: 2400, of: 'completely' },
      }),
    ])
    // Kept as they are, or with time taken out: asked once.
    await patchEntry(db, me, entry, { idle: 0 })
    expect(await readStoreHours(db, me)).toEqual([])
    expect(await minutes()).toBe(STEAM)
  })

  it('offers none archived and none of another library', async () => {
    expect(await readStoreHours(db, other)).toEqual([])
    await setArchived(db, me, entry, true)
    expect(await readStoreHours(db, me)).toEqual([])
  })

  it('gives the library IGDB’s hasty time when it is shorter than the normal one', async () => {
    await db
      .update(games)
      .set({ length: { hastily: 900, normally: 1200 } })
      .where(eq(games.id, hades))
    expect((await readLibrary(db, me)).games[0]).toMatchObject({ length: 1200, hastyShare: 75 })
    await db
      .update(games)
      .set({ length: { hastily: 1200, normally: 1200 } })
      .where(eq(games.id, hades))
    expect((await readLibrary(db, me)).games[0]?.hastyShare).toBeUndefined()
  })

  it('offers none within twice IGDB’s time', async () => {
    await db
      .update(games)
      .set({ length: { normally: 2400, completely: 3600 } })
      .where(eq(games.id, hades))
    expect(await readStoreHours(db, me)).toEqual([])
  })

  it('goes with the game when it is removed and put back', async () => {
    await patchEntry(db, me, entry, { idle: 4320 })
    const undo = await removeEntryForUndo(db, me, entry)
    const back = await restoreEntry(db, me, undo)
    expect((await readOwnerGame(db, me, back))?.idle).toBe(4320)
  })
})
