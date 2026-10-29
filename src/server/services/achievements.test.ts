import { and, eq } from 'drizzle-orm'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { progressOf } from '@/domain/achievements/progress'
import { achievementStatsOf } from '@/domain/library/trophy-achievements'
import type { Db } from '@/server/db/client'
import {
  achievementProgress,
  achievements as achievementRows,
  achievementSets,
  achievementUnlocks,
  entries,
  entryVersions,
  games,
  users,
} from '@/server/db/schema'
import { createIgdbApi } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import { readLibrary } from '@/server/library/read'
import { readVersion, removeLibrary, updateEntry } from '@/server/library/store'
import { createHandlers, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '@/server/mocks/handlers'
import { MOCK_STEAM } from '@/server/mocks/owner'
import {
  createSteamHandlers,
  newSteamMockState,
  type AchievementAnswers,
} from '@/server/mocks/steam'
import { loadFixtures } from '@/server/seed/fixtures'
import { forgetLink, saveLink } from '@/server/sync/memory'
import { createNintendo } from '@/server/sync/nintendo'
import { createSteam, STEAM_API } from '@/server/sync/steam'
import { createTestAccount, createTestDatabase } from '@/test/database'
import { network } from '@/test/network'

import { createAchievements } from './achievements'
import { createSync } from './sync'

/**
 * Achievements from Steam (issue 72), against `fixtures/steam/achievements.json`:
 * Half-Life 2 with four of six unlocked, one of them at a moment Steam does
 * not know, and a hidden one; Hades II with all three; Outer Wilds with
 * none of three and no unlock rates; every other game with no achievements.
 * The double counts them for many games at once, as Steam does.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fixture = require('../../../fixtures/steam/achievements.json') as Record<
  string,
  AchievementAnswers
>

const api = createIgdbApi(
  createIgdbClient({
    credentials: () => ({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET }),
    tokens: memoryTokenStore(),
    perSecond: 100_000,
    sleep: async () => undefined,
  }),
)
const asked: number[] = []
const steam = createSteam({
  key: () => MOCK_STEAM.key,
  sleep: async (ms) => {
    asked.push(ms)
  },
})
const ART = {
  colors: ['#112233', '#445566', '#778899'] as [string, string, string],
  thumbhash: 'aGFzaA==',
}

const HALF_LIFE_2 = 233
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** As the sync's own tests: after every game the made-up account played. */
const NOW = (1_760_000_000 + 24 * 86_400) * 1000

const TOTALS = `${STEAM_API}/IPlayerService/GetTopAchievementsForGames/v1/`
const PLAYER = `${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/`

let db: Db
let steamState: ReturnType<typeof newSteamMockState>
let sync: ReturnType<typeof createSync>
let achievements: ReturnType<typeof createAchievements>

beforeEach(async () => {
  asked.length = 0
  steamState = newSteamMockState()
  network.use(...createHandlers(loadFixtures()), ...createSteamHandlers(steamState))
  db = await createTestDatabase('default')
  sync = createSync({ db, igdb: api, readArt: async () => ART, steam, nintendo: createNintendo() })
  achievements = createAchievements({ db, steam })
})

/** An account linked to the made-up Steam account, its games on the shelf. */
const synced = async (handle = 'player') => {
  const id = await createTestAccount(db, handle)
  await saveLink(db, id, 'steam', { externalId: MOCK_STEAM.steamId })
  const library = sync(id)
  let step = await library.step('steam', { read: true }, NOW)
  for (let i = 0; i < 20 && step.remaining > 0; i += 1) step = await library.step('steam', {}, NOW)
  return id
}

/** Steps until nothing is due, as the page asks for them. */
const readAll = async (libraryId: string, now = NOW) => {
  const steps = [await achievements(libraryId).step('steam', now)]
  while (steps.at(-1)!.remaining > 0 && steps.at(-1)!.problem !== 'private' && steps.length < 20) {
    steps.push(await achievements(libraryId).step('steam', now))
  }
  return steps
}

const slugOf = async (libraryId: string, igdbId: number) => {
  const [row] = await db
    .select({ slug: games.slug })
    .from(entryVersions)
    .innerJoin(games, eq(games.id, entryVersions.gameId))
    .where(and(eq(entryVersions.userId, libraryId), eq(games.igdbId, igdbId)))
  return row!.slug
}

/** The slug of the game a Steam app put on the shelf. */
const slugOfApp = async (libraryId: string, title: string) => {
  const [row] = await db
    .select({ slug: games.slug })
    .from(games)
    .innerJoin(entryVersions, eq(entryVersions.gameId, games.id))
    .where(and(eq(entryVersions.userId, libraryId), eq(games.title, title)))
  return row!.slug
}

/** Steam's questions asked since the count was last cleared, of one kind. */
const times = (question: string) =>
  steamState.asked.filter((path) => path.includes(question)).length

/** Half-Life 2 played again, as Steam's list of games says at the next sync. */
const playHalfLife = (at: number) => {
  const owned = structuredClone(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../fixtures/steam/owned-games.json'),
  ) as { response: { games: { appid: number; rtime_last_played: number }[] } }
  for (const game of owned.response.games) {
    if (game.appid === 220) game.rtime_last_played = at / 1000
  }
  network.use(
    http.get(`${STEAM_API}/IPlayerService/GetOwnedGames/v1/`, () => HttpResponse.json(owned)),
  )
}

/** Half-Life 2's achievements as Steam would list them now, in English and Portuguese. */
const halfLifeDefined = (
  change: (listed: AchievementAnswers['definitions'][string]['response']['achievements']) => void,
) => {
  const definitions = structuredClone(fixture['220']!.definitions)
  for (const answer of Object.values(definitions)) change(answer.response.achievements)
  steamState.achievements = { '220': { definitions } }
}

const halfLife = async (libraryId: string, language: 'en' | 'pt-BR' = 'en') => {
  const found = await achievements(libraryId).game(await slugOf(libraryId, HALF_LIFE_2), language, {
    mine: true,
  })
  return found!.sets[0]!
}

describe('reading achievements from Steam', () => {
  it('reads every game on the shelf in one step, well inside its time', async () => {
    const me = await synced()
    const steps = await readAll(me)
    expect(steps).toHaveLength(1)
    const games = steps[0]!.counts.games
    expect(steps[0]).toMatchObject({ read: games, remaining: 0, problem: null })
    expect(steps[0]!.counts).toEqual({ games, known: games, private: 0 })
  })

  it('goes on in further steps once a step’s time is spent, a few games each at least', async () => {
    const me = await synced()
    const slow = createAchievements({ db, steam, stepMs: 0 })
    const steps = [await slow(me).step('steam', NOW)]
    while (steps.at(-1)!.remaining > 0 && steps.length < 20) {
      steps.push(await slow(me).step('steam', NOW))
    }
    const games = steps[0]!.counts.games
    expect(steps[0]!.read).toBeGreaterThan(0)
    expect(steps[0]!.read + steps[0]!.remaining).toBe(games)
    expect(steps.length).toBeGreaterThan(1)
    expect(steps.at(-1)).toMatchObject({
      remaining: 0,
      counts: { games, known: games, private: 0 },
    })
  })

  it('counts every game’s achievements in one question, and asks about one on its own only for what that cannot tell', async () => {
    const me = await synced()
    steamState.asked.length = 0
    await readAll(me)
    expect(times('GetTopAchievementsForGames')).toBe(1)
    // The three games with achievements: their list, in English and in Portuguese.
    expect(times('GetGameAchievements')).toBe(6)
    // Outer Wilds has none unlocked, so no moments to ask for.
    expect(times('GetPlayerAchievements')).toBe(2)
  })

  it('asks about each game on its own when Steam does not count them', async () => {
    const me = await synced()
    network.use(http.get(TOTALS, () => new HttpResponse(null, { status: 500 })))
    const steps = await readAll(me)
    const games = steps.at(-1)!.counts.games
    expect(steps.at(-1)).toMatchObject({
      remaining: 0,
      problem: null,
      counts: { games, known: games, private: 0 },
    })
    expect(progressOf(await halfLife(me))).toMatchObject({ earned: 4, total: 6 })
    const outer = (await achievements(me).game(await slugOfApp(me, 'Outer Wilds'), 'en'))!.sets[0]!
    expect(progressOf(outer)).toMatchObject({ earned: 0, total: 3 })
  })

  it('keeps what Steam said, and only that: no moment for an unlock Steam has none for', async () => {
    const me = await synced()
    await readAll(me)
    const set = await halfLife(me)
    expect(set).toMatchObject({ provider: 'steam', setId: '220', title: 'Half-Life 2' })
    expect(set.state).toBe('ready')
    expect(set.readAt).toBe(NOW)
    expect(set.snapshot).toBeUndefined()
    expect(progressOf(set)).toEqual({
      earned: 4,
      total: 6,
      unknown: 0,
      percent: 66,
      complete: false,
    })
    const byId = new Map(set.achievements.map((each) => [each.id, each]))
    expect(byId.get('HL2_OUT_THE_WINDOW')).toEqual({
      id: 'HL2_OUT_THE_WINDOW',
      name: 'Out the Window',
      description: 'Escape the apartment block.',
      // Steam names a file in the game's folder on its image servers.
      icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/220/hl2_out_the_window.jpg',
      iconLocked:
        'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/220/hl2_out_the_window_bw.jpg',
      hidden: false,
      state: 'unlocked',
      unlockedAt: 1760086000 * 1000,
      rate: 84,
    })
    const canals = byId.get('HL2_DOWN_THE_CANALS')!
    expect(canals.state).toBe('unlocked')
    expect(canals).not.toHaveProperty('unlockedAt')
    expect(byId.get('HL2_EVERY_LAST_ONE')).toMatchObject({ state: 'locked', rate: 2.1 })
    // Steam describes a hidden one like the others; the page keeps it out of sight.
    expect(byId.get('HL2_BEHIND_THE_LAB')).toMatchObject({
      hidden: true,
      state: 'locked',
      description: 'Find the room behind the lab.',
    })
    expect(set.achievements.map((each) => each.id)).toEqual([
      'HL2_OUT_THE_WINDOW',
      'HL2_TRUSTY_TOOL',
      'HL2_DOWN_THE_CANALS',
      'HL2_BEHIND_THE_LAB',
      'HL2_EVERY_LAST_ONE',
      'HL2_COLLECTOR',
    ])
  })

  it('answers in Portuguese where Steam has it, and in English where it does not', async () => {
    const me = await synced()
    await readAll(me)
    const byId = new Map((await halfLife(me, 'pt-BR')).achievements.map((each) => [each.id, each]))
    expect(byId.get('HL2_OUT_THE_WINDOW')).toMatchObject({
      name: 'Pela Janela',
      description: 'Fuja do prédio de apartamentos.',
    })
    expect(byId.get('HL2_DOWN_THE_CANALS')).toMatchObject({
      name: 'Down the Canals',
      description: 'Reach the end of the canals.',
      inEnglish: true,
    })
    expect(byId.get('HL2_OUT_THE_WINDOW')).not.toHaveProperty('inEnglish')
    expect(byId.get('HL2_BEHIND_THE_LAB')).toMatchObject({
      name: 'Atrás do Laboratório',
      description: 'Encontre a sala atrás do laboratório.',
    })
  })

  it('says when a game has none, and when one has no unlock rates', async () => {
    const me = await synced()
    await readAll(me)
    const portal = await achievements(me).game(await slugOfApp(me, 'Portal'), 'en')
    expect(portal!.sets).toEqual([
      { provider: 'steam', setId: '52003', title: 'Portal', state: 'none', achievements: [] },
    ])
    const outer = (await achievements(me).game(await slugOfApp(me, 'Outer Wilds'), 'en'))!.sets[0]!
    expect(progressOf(outer)).toMatchObject({ earned: 0, total: 3, percent: 0 })
    expect(outer.achievements.every((each) => each.rate === undefined)).toBe(true)
  })

  it('reads nothing again until something is due, and reading again counts nothing twice', async () => {
    const me = await synced()
    await readAll(me)
    const rows = async () => ({
      sets: (await db.select().from(achievementSets)).length,
      achievements: (await db.select().from(achievementRows)).length,
      unlocks: (await db.select().from(achievementUnlocks)).length,
    })
    const before = await rows()
    expect(before.unlocks).toBe(7)

    steamState.asked.length = 0
    expect((await readAll(me, NOW + HOUR))[0]).toMatchObject({ read: 0, remaining: 0 })
    expect(steamState.asked).toEqual([])

    // A week on, the progress of each game with achievements is read again, and comes to the
    // same: Steam counts as many unlocks as before, so none is asked for one by one.
    const again = await readAll(me, NOW + 8 * DAY)
    expect(again[0]!.read).toBe(3)
    expect(times('GetPlayerAchievements')).toBe(0)
    expect(await rows()).toEqual(before)
    expect(progressOf(await halfLife(me))).toMatchObject({ earned: 4, total: 6 })
  })

  it('reads a game again once it is played, and only that game', async () => {
    const me = await synced()
    await readAll(me)
    playHalfLife(NOW + 600_000)
    await sync(me).step('steam', { read: true }, NOW + 2 * HOUR)
    const steps = await readAll(me, NOW + 2 * HOUR)
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ read: 1, remaining: 0 })
    // Steam's clock may run ahead of Shelf's: read once, it is not due again.
    expect((await readAll(me, NOW + 2 * HOUR + 1))[0]).toMatchObject({ read: 0 })
  })

  it('asks for a played game’s unlocks when Steam counts more of them', async () => {
    const me = await synced()
    await readAll(me)
    const player = structuredClone(fixture['220']!.player!)
    const last = player.playerstats.achievements.find(
      (each) => each.apiname === 'HL2_EVERY_LAST_ONE',
    )!
    Object.assign(last, { achieved: 1, unlocktime: NOW / 1000 + 300 })
    steamState.achievements = { '220': { player } }
    playHalfLife(NOW + 600_000)
    await sync(me).step('steam', { read: true }, NOW + 2 * HOUR)
    steamState.asked.length = 0
    expect((await readAll(me, NOW + 2 * HOUR))[0]).toMatchObject({ read: 1, remaining: 0 })
    expect(times('GetPlayerAchievements')).toBe(1)
    const set = await halfLife(me)
    expect(progressOf(set)).toMatchObject({ earned: 5, total: 6 })
    expect(set.achievements.find((each) => each.id === 'HL2_EVERY_LAST_ONE')).toMatchObject({
      state: 'unlocked',
      unlockedAt: NOW + 300_000,
    })
  })

  it('reads Steam again after it is busy, and leaves a failing game for later without losing the rest', async () => {
    const me = await synced()
    network.use(http.get(PLAYER, () => new HttpResponse(null, { status: 429 }), { once: true }))
    steamState.failApps = new Set(['1145350'])
    const steps = await readAll(me)
    expect(asked.length).toBeGreaterThan(0)
    expect(steps.some((step) => step.problem === 'unreachable')).toBe(true)
    expect(steps.at(-1)!.remaining).toBe(0)
    const games = steps.at(-1)!.counts.games
    expect(steps.at(-1)!.counts.known).toBe(games - 1)
    expect((await halfLife(me)).state).toBe('ready')
    const hades = await achievements(me).game(await slugOfApp(me, 'Hades II'), 'en', { mine: true })
    expect(hades!.sets[0]!.state).toBe('failed')

    // Not asked again within the hour, so a sync going step by step does not ask it again and again.
    steamState.failApps = undefined
    expect((await readAll(me, NOW + HOUR / 2))[0]).toMatchObject({ read: 0, remaining: 0 })
    expect((await readAll(me, NOW + HOUR))[0]).toMatchObject({ read: 1, remaining: 0 })
    const after = await achievements(me).game(await slugOfApp(me, 'Hades II'), 'en', { mine: true })
    expect(progressOf(after!.sets[0]!)).toMatchObject({ earned: 3, total: 3, complete: true })
  })

  it('says Steam keeps the account’s achievements private, rather than reading them as none', async () => {
    const me = await synced()
    steamState.achievementsPrivate = true
    const steps = await readAll(me)
    expect(steps.at(-1)!.problem).toBe('private')
    expect(steps.at(-1)!.counts.private).toBeGreaterThan(0)
    const set = await halfLife(me)
    expect(set.state).toBe('private')
    expect(set.achievements).toEqual([])
    expect(progressOf(set)).toBeUndefined()
  })

  it('reads on when Steam keeps one game’s achievements from Shelf, as for a game I no longer own', async () => {
    const me = await synced()
    steamState.unownedApps = new Set(['220'])
    const steps = await readAll(me)
    const games = steps.at(-1)!.counts.games
    expect(steps.at(-1)).toMatchObject({
      remaining: 0,
      problem: null,
      counts: { games, known: games, private: 0 },
    })
    // Steam's count says none unlocked, so its own answer is not asked for.
    expect(progressOf(await halfLife(me))).toMatchObject({ earned: 0, total: 6 })
    const hades = await achievements(me).game(await slugOfApp(me, 'Hades II'), 'en', { mine: true })
    expect(progressOf(hades!.sets[0]!)).toMatchObject({ earned: 3, total: 3 })
  })

  it('reads a game Steam keeps from Shelf for its content from its count, without the moments', async () => {
    const me = await synced()
    steamState.withheldApps = new Set(['220'])
    const steps = await readAll(me)
    const games = steps.at(-1)!.counts.games
    expect(steps.at(-1)).toMatchObject({
      remaining: 0,
      problem: null,
      counts: { games, known: games, private: 0 },
    })
    // Four of six, as Steam's count names them, matched by key to the definitions.
    expect(progressOf(await halfLife(me))).toMatchObject({ earned: 4, total: 6 })
    const unlocks = await db
      .select({ id: achievementUnlocks.achievementId, at: achievementUnlocks.unlockedAt })
      .from(achievementUnlocks)
      .where(and(eq(achievementUnlocks.userId, me), eq(achievementUnlocks.setId, 'steam:220')))
    expect(unlocks).toHaveLength(4)
    // The count gives no moments, and none is made up.
    expect(unlocks.every((each) => each.at === null)).toBe(true)

    // Nothing new: the count agrees, and nothing is asked of the game itself.
    steamState.asked.length = 0
    await readAll(me, NOW + 8 * DAY)
    expect(times('GetPlayerAchievements')).toBe(0)
  })

  it('reads a game Steam does not count, and keeps from me, as none unlocked', async () => {
    const me = await synced()
    steamState.withheldApps = new Set(['220'])
    network.use(
      http.get(TOTALS, () => HttpResponse.json({ response: { games: [{ appid: 220 }] } })),
    )
    const steps = await readAll(me)
    expect(steps.at(-1)).toMatchObject({ remaining: 0, problem: null })
    expect(progressOf(await halfLife(me))).toMatchObject({ earned: 0, total: 6 })
  })

  it('does not take one game’s answer for the whole account’s when Steam does not count them', async () => {
    const me = await synced()
    steamState.withheldApps = new Set(['220'])
    network.use(http.get(TOTALS, () => new HttpResponse(null, { status: 500 })))
    const steps = await readAll(me)
    const games = steps.at(-1)!.counts.games
    expect(steps.some((step) => step.problem === 'private')).toBe(false)
    expect(steps.at(-1)).toMatchObject({
      remaining: 0,
      counts: { games, known: games - 1, private: 0 },
    })
    // Not known whether the account is private: asked again later.
    expect((await halfLife(me)).state).toBe('failed')
    const hades = await achievements(me).game(await slugOfApp(me, 'Hades II'), 'en', { mine: true })
    expect(hades!.sets[0]!.state).toBe('ready')
  })

  it('finds achievements added to a game, unknown to me until my progress is read again', async () => {
    const me = await synced()
    await readAll(me)
    // A month on, Steam lists one more, and does not answer for my progress.
    halfLifeDefined((listed) =>
      listed.push({
        internal_name: 'HL2_NEW_CHAPTER',
        localized_name: 'New Chapter',
        localized_desc: 'Play the new chapter.',
        hidden: false,
      }),
    )
    network.use(
      http.get(PLAYER, ({ request }) =>
        new URL(request.url).searchParams.get('appid') === '220'
          ? new HttpResponse(null, { status: 500 })
          : undefined,
      ),
    )
    await readAll(me, NOW + 31 * DAY)
    const set = await halfLife(me)
    expect(set).toMatchObject({ state: 'ready', readAt: NOW, problem: 'unreachable' })
    expect(set.achievements.at(-1)).toMatchObject({ id: 'HL2_NEW_CHAPTER', state: 'unknown' })
    // Not 66% and not complete: one achievement's state is not known.
    expect(progressOf(set)).toEqual({ earned: 4, total: 7, unknown: 1, complete: false })

    network.resetHandlers(...createHandlers(loadFixtures()), ...createSteamHandlers(steamState))
    await readAll(me, NOW + 31 * DAY + HOUR)
    const read = await halfLife(me)
    expect(read.problem).toBeUndefined()
    expect(read.achievements.at(-1)).toMatchObject({ id: 'HL2_NEW_CHAPTER', state: 'locked' })
    expect(progressOf(read)).toEqual({
      earned: 4,
      total: 7,
      unknown: 0,
      percent: 57,
      complete: false,
    })
  })

  it('takes out an achievement Steam takes out, with my unlock of it', async () => {
    const me = await synced()
    await readAll(me)
    halfLifeDefined((listed) =>
      listed.splice(
        listed.findIndex((each) => each.internal_name === 'HL2_COLLECTOR'),
        1,
      ),
    )
    await readAll(me, NOW + 31 * DAY)
    const set = await halfLife(me)
    expect(set.achievements.map((each) => each.id)).not.toContain('HL2_COLLECTOR')
    expect(progressOf(set)).toMatchObject({ earned: 3, total: 5, percent: 60 })
  })

  it('changes nothing of mine: not a status, a rating, a note, a date, nor the library’s version', async () => {
    const me = await synced()
    const [entry] = await db.select().from(entries).where(eq(entries.userId, me)).limit(1)
    await updateEntry(db, me, entry!.id, {
      status: 'completed',
      rating: 80,
      notes: 'Mine.',
      completedOn: '2025-10-01',
    })
    const before = await db.select().from(entries).where(eq(entries.userId, me))
    const version = await readVersion(db, me)
    await readAll(me)
    expect(await db.select().from(entries).where(eq(entries.userId, me))).toEqual(before)
    expect(await readVersion(db, me)).toBe(version)
  })

  it('shares a game’s definitions between accounts, and reads them once', async () => {
    const me = await synced('first')
    await readAll(me)
    const other = await synced('second')
    steamState.asked.length = 0
    await readAll(other)
    expect(times('GetGameAchievements')).toBe(0)
    // Each account's own progress is still its own to read: one question a game with unlocks.
    expect(times('GetPlayerAchievements')).toBe(2)
    expect(progressOf(await halfLife(other))).toMatchObject({ earned: 4, total: 6 })
  })
})

describe('whose achievements they are', () => {
  it('keeps them as a snapshot when Steam is disconnected, and live again when it is linked back', async () => {
    const me = await synced()
    await readAll(me)
    await forgetLink(db, me, 'steam')
    const kept = await halfLife(me)
    expect(kept).toMatchObject({ state: 'ready', snapshot: true, readAt: NOW })
    expect(progressOf(kept)).toMatchObject({ earned: 4, total: 6 })

    await saveLink(db, me, 'steam', { externalId: MOCK_STEAM.steamId })
    expect((await halfLife(me)).snapshot).toBeUndefined()
  })

  it('forgets them when another Steam account is linked: they were someone else’s', async () => {
    const me = await synced()
    await readAll(me)
    await forgetLink(db, me, 'steam')
    await saveLink(db, me, 'steam', { externalId: MOCK_STEAM.privateSteamId })
    expect(
      await db.select().from(achievementProgress).where(eq(achievementProgress.userId, me)),
    ).toEqual([])
    expect(
      await db.select().from(achievementUnlocks).where(eq(achievementUnlocks.userId, me)),
    ).toEqual([])
    // Its games are still on the shelf; nothing of the first account's shows on them.
    expect(
      await achievements(me).game(await slugOf(me, HALF_LIFE_2), 'en', { mine: true }),
    ).toEqual({
      sets: [],
    })
  })

  it('goes with the account, and leaves the shared definitions', async () => {
    const me = await synced()
    const other = await synced('other')
    await readAll(me)
    await readAll(other)
    await removeLibrary(db, me)
    await db.delete(users).where(eq(users.id, me))
    expect(
      await db.select().from(achievementProgress).where(eq(achievementProgress.userId, me)),
    ).toEqual([])
    expect(
      await db.select().from(achievementUnlocks).where(eq(achievementUnlocks.userId, me)),
    ).toEqual([])
    expect((await db.select().from(achievementRows)).length).toBeGreaterThan(0)
    expect(progressOf(await halfLife(other))).toMatchObject({ earned: 4 })
  })

  it('keeps a private game’s achievements, and its totals, to its own account', async () => {
    const me = await synced()
    await readAll(me)
    const slug = await slugOf(me, HALF_LIFE_2)
    const [row] = await db
      .select({ entryId: entryVersions.entryId })
      .from(entryVersions)
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(and(eq(entryVersions.userId, me), eq(games.igdbId, HALF_LIFE_2)))
    /** Every unlock the trophy page counts, for a visitor or for the account. */
    const counted = async (mine: boolean) =>
      (await achievements(me).unlocks('en', { mine })).reduce(
        (sum, game) => sum + game.unlocked.length,
        0,
      )
    const visitor = await counted(false)
    await updateEntry(db, me, row!.entryId, { private: true })

    expect(await achievements(me).game(slug, 'en')).toBeUndefined()
    expect(await achievements(me).game(slug, 'en', { mine: true })).toBeDefined()
    expect(await counted(false)).toBe(visitor - 4)
    expect((await achievements(me).unlocks('en')).map((each) => each.slug)).not.toContain(slug)
    expect(await counted(true)).toBe(visitor)
  })

  it('answers nothing of another library’s games', async () => {
    const me = await synced()
    await readAll(me)
    const other = await createTestAccount(db, 'stranger')
    expect(
      await achievements(other).game(await slugOf(me, HALF_LIFE_2), 'en', { mine: true }),
    ).toBe(undefined)
  })
})

describe('a library’s achievements on its trophy page (issue 68)', () => {
  it('counts what is known, perfect games by every set, and lists the latest and rarest unlocks', async () => {
    const me = await synced()
    await readAll(me)
    const stats = achievementStatsOf(
      await readLibrary(db, me, { mine: true }),
      await achievements(me).unlocks('en', { mine: true }),
      2026,
    )!
    expect(stats).toMatchObject({ unlocked: 7, available: 12, perfect: 1, readAt: NOW })
    const idOf = (unlock: { key: string }) => unlock.key.slice(unlock.key.indexOf('/') + 1)
    expect(stats.latest.map(idOf).slice(0, 3)).toEqual([
      'HADES2_THE_END',
      'HADES2_FAMILIAR',
      'HADES2_FIRST_NIGHT',
    ])
    // The unlock Steam has no moment for is not among the latest.
    expect(stats.latest.map(idOf)).not.toContain('HL2_DOWN_THE_CANALS')
    // Locked ones are not among them, however rare: Every Last One is 2.1%.
    expect(stats.rarest.map((each) => [idOf(each), each.rate])).toEqual([
      ['HL2_COLLECTOR', 5.4],
      ['HADES2_THE_END', 9.8],
      ['HL2_DOWN_THE_CANALS', 61.7],
      ['HADES2_FAMILIAR', 70.4],
      ['HL2_OUT_THE_WINDOW', 84],
      ['HADES2_FIRST_NIGHT', 88.2],
      ['HL2_TRUSTY_TOOL', 91.3],
    ])
  })
})
