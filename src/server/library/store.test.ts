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
  playTime,
  tags,
} from '@/server/db/schema'
import { readLibrary } from '@/server/library/read'
import {
  addCopy,
  addVersion,
  createEntry,
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
  patchEntry,
  setManualMinutes,
  setPrimary,
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
      minutes: 6000,
      tags: ['Comfort Game', 'comfort game', '  replay   someday '],
    })
    const library = await readLibrary(db, me)
    expect(library.games).toHaveLength(1)
    expect(library.games[0]).toMatchObject({
      slug: 'the-elder-scrolls-v-skyrim',
      status: 'completed',
      rating: 90,
      completedOn: '2024-05-01',
      minutes: 6000,
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
    ['negative playtime', { minutes: -5 }],
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

  it('replaces manual playtime rather than adding to it', async () => {
    await setManualMinutes(db, me, entry, 120)
    await setManualMinutes(db, me, entry, 300)
    expect((await readLibrary(db, me)).games[0]?.minutes).toBe(300)
    await setManualMinutes(db, me, entry, 0)
    expect(await count(playTime)).toBe(0)
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
      () => setManualMinutes(db, me, theirs, 60),
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

describe('removeEntry', () => {
  it('removes the game and everything added with it', async () => {
    const entry = await createEntry(db, me, {
      primaryGameId: skyrim,
      status: 'completed',
      copies: [{ platformId: PC, format: 'digital' }],
      minutes: 100,
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
    await setManualMinutes(db, me, entry, 30)
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
