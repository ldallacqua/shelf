import 'server-only'

import { lengthMinutes, type GameData } from '@/domain/igdb/game'
import { dayOf, type Day, type Format, type Relation, type Status } from '@/domain/library/values'
import { curatedPlatform } from '@/domain/platforms/platforms'

/**
 * Invents the personal half of a sample library: status, copies, rating,
 * playtime, dates, tags. The games are real; what "I" did with them is made
 * up, but made up the same way every time. Each game's numbers come from its
 * own IGDB id, so adding a game to the sample changes nothing about the
 * others, and screenshots stay the same from run to run.
 */

/** "Today" for the sample library. Fixed, so a seed made next year matches one made now. */
export const SEED_NOW = Date.UTC(2026, 9, 1)

const DAY_MS = 86_400_000

/** A small, good-enough random generator with a seed: mulberry32. */
const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The imagined collector: mostly PlayStation, Switch and PC, with a shelf or
 * two from every older generation. Keys are IGDB platform ids.
 */
const SHELF_WEIGHTS: Record<number, number> = {
  167: 6, // PS5
  48: 6, // PS4
  130: 7, // Switch
  508: 2, // Switch 2
  6: 5, // PC
  169: 2, // Xbox Series
  49: 1, // Xbox One
  9: 3, // PS3
  12: 3, // Xbox 360
  41: 2, // Wii U
  5: 3, // Wii
  37: 3, // 3DS
  20: 3, // DS
  8: 4, // PS2
  21: 3, // GameCube
  11: 2, // Xbox
  7: 3, // PS1
  4: 3, // N64
  19: 3, // SNES
  18: 2, // NES
  24: 2, // GBA
  22: 1, // GBC
  33: 2, // Game Boy
  38: 2, // PSP
  46: 2, // Vita
  23: 2, // Dreamcast
  32: 1, // Saturn
  29: 2, // Mega Drive
}

/** Platforms whose games are bought as downloads. */
const DIGITAL_ONLY = new Set([6, 14, 3, 13, 163])

export type SeedCopy = {
  platformId: number
  format: Format
  /** IGDB id of the exact version this copy is, when it is not the primary. */
  versionIgdbId?: number
}

export type SeedEntry = {
  igdbId: number
  status: Status
  rating?: number
  notes?: string
  notesPublic: boolean
  featured: boolean
  addedAt: number
  completedOn?: Day
  minutes: number
  copies: SeedCopy[]
  tags: string[]
  /** Other IGDB records folded into this entry. */
  versions: { igdbId: number; relation: Exclude<Relation, 'primary'> }[]
}

const pickWeighted = <T>(
  items: readonly { value: T; weight: number }[],
  roll: number,
): T | undefined => {
  const total = items.reduce((sum, item) => sum + item.weight, 0)
  let at = roll * total
  for (const item of items) {
    at -= item.weight
    if (at < 0) return item.value
  }
  return items.at(-1)?.value
}

const NOTES = [
  'Finished the main story over one long weekend. The last act is the best part.',
  'Borrowed this years ago and finally bought my own copy.',
  'Better with headphones.',
  'Stopped at the second boss. Coming back when I have more patience.',
  'The soundtrack alone is worth it.',
  'Played it through twice, back to back.',
  'Picked this up used. The manual is still in the case.',
  'Co-op campaign with my brother, one sitting.',
]

/** Hand-written entries: the worked examples from ADR 001. Everything else is generated. */
const RECIPES: Record<number, Partial<SeedEntry>> = {
  // Skyrim on PC and on Switch: one entry, two versions, two copies.
  472: {
    status: 'completed',
    rating: 90,
    copies: [
      { platformId: 6, format: 'digital' },
      { platformId: 130, format: 'physical', versionIgdbId: 37034 },
    ],
    versions: [{ igdbId: 37034, relation: 'port' }],
    tags: ['comfort game', 'replay someday'],
    featured: true,
  },
  // Shadow of the Tomb Raider: the PS4 disc, and the Definitive Edition on Steam.
  37777: {
    status: 'completed',
    rating: 80,
    copies: [
      { platformId: 48, format: 'physical' },
      { platformId: 6, format: 'digital', versionIgdbId: 123051 },
    ],
    versions: [{ igdbId: 123051, relation: 'edition' }],
  },
}

const CO_OP = 3 // IGDB game mode: co-operative
const SPLIT_SCREEN = 4

export const inventEntry = (game: GameData): SeedEntry => {
  const next = random(game.igdbId * 2654435761)
  const releasedAt = game.releasedOn ? Date.parse(`${game.releasedOn}T00:00:00Z`) : undefined

  const roll = next()
  const status: Status =
    roll < 0.04
      ? 'playing'
      : roll < 0.44
        ? 'backlog'
        : roll < 0.8
          ? 'completed'
          : roll < 0.86
            ? 'dropped'
            : 'wishlist'

  // Which shelf it stands on: a platform it was released on, weighted toward
  // the collector's favorites and toward the platform it first came out for.
  const firstYear = game.year
  const yearOn = new Map(game.releases.map((release) => [release.platform, release.year]))
  const candidates = game.platforms
    .filter((platform) => SHELF_WEIGHTS[platform] !== undefined)
    .map((platform) => {
      const year = yearOn.get(platform)
      const original = firstYear !== undefined && year !== undefined && year <= firstYear + 1
      return { value: platform, weight: (SHELF_WEIGHTS[platform] ?? 1) * (original ? 3 : 1) }
    })
  const fallback = game.platforms.find((platform) => curatedPlatform(platform))

  const formatFor = (platform: number): Format => {
    if (DIGITAL_ONLY.has(platform)) return 'digital'
    const generation = curatedPlatform(platform)?.generation ?? 8
    return next() < (generation <= 7 ? 0.92 : 0.72) ? 'physical' : 'digital'
  }

  const copies: SeedCopy[] = []
  const subscription = status === 'completed' && next() < 0.04
  if (status !== 'wishlist' && !subscription) {
    const first = pickWeighted(candidates, next()) ?? fallback
    if (first !== undefined) {
      copies.push({ platformId: first, format: formatFor(first) })
      const others = candidates.filter((candidate) => candidate.value !== first)
      if (others.length > 0 && next() < 0.12) {
        const second = pickWeighted(others, next())
        if (second !== undefined) copies.push({ platformId: second, format: formatFor(second) })
      }
    }
  }

  // Added some time in the last six years, never before the game existed.
  const oldest = SEED_NOW - 2300 * DAY_MS
  let addedAt = oldest + Math.floor(next() ** 0.8 * (SEED_NOW - oldest - 2 * DAY_MS))
  if (releasedAt !== undefined && releasedAt > addedAt) {
    addedAt = Math.min(SEED_NOW - 2 * DAY_MS, releasedAt + Math.floor(next() * 120) * DAY_MS)
  }

  const length = lengthMinutes(game.length) ?? Math.round((6 + next() * 30) * 60)

  let minutes = 0
  let completedOn: Day | undefined
  let rating: number | undefined
  if (status === 'completed') {
    minutes = Math.round(length * (0.8 + next() * 0.9))
    // Finished some days after it was added. One added lately was finished some
    // time since, not, with every other, on the day before the seed's today.
    const draw = next() ** 1.6
    const after = Math.floor(5 + draw * 420) * DAY_MS
    const room = SEED_NOW - DAY_MS - addedAt
    completedOn = dayOf(addedAt + (after <= room ? after : Math.floor(room * draw)))
    if (next() < 0.7) {
      const base = game.igdbRating ?? 78
      rating = Math.min(100, Math.max(40, Math.round((base + (next() - 0.4) * 24) / 5) * 5))
    }
  } else if (status === 'playing') {
    minutes = Math.round(length * (0.1 + next() * 0.6))
  } else if (status === 'dropped') {
    minutes = Math.round(length * (0.05 + next() * 0.25))
    if (next() < 0.5) rating = Math.round((30 + next() * 30) / 5) * 5
  } else if (status === 'backlog' && next() < 0.1) {
    minutes = Math.round(20 + next() * 90)
  }

  const tags: string[] = []
  const social = game.modes.includes(CO_OP) || game.modes.includes(SPLIT_SCREEN)
  if (social && status !== 'wishlist' && next() < 0.45) tags.push('couch co-op')
  if (status === 'completed' && (rating ?? 0) >= 90 && next() < 0.5) tags.push('100%')
  if (status === 'completed' && next() < 0.12) tags.push('replay someday')
  if (length < 10 * 60 && status !== 'wishlist' && next() < 0.5) tags.push('short')
  if (copies.some((copy) => copy.platformId === 6) && next() < 0.25) tags.push('steam deck')
  if (next() < 0.06) tags.push('soundtrack')

  const entry: SeedEntry = {
    igdbId: game.igdbId,
    status,
    notesPublic: false,
    featured: (rating ?? 0) >= 95 || next() < 0.05,
    addedAt,
    minutes,
    copies,
    tags,
    versions: [],
  }
  if (rating !== undefined) entry.rating = rating
  if (completedOn) entry.completedOn = completedOn
  if (status !== 'wishlist' && next() < 0.09) {
    entry.notes = NOTES[Math.floor(next() * NOTES.length)] ?? NOTES[0]
    entry.notesPublic = next() < 0.5
  }

  const recipe = RECIPES[game.igdbId]
  if (recipe) {
    Object.assign(entry, recipe)
    if (entry.status === 'completed') {
      entry.completedOn ??= dayOf(Math.min(SEED_NOW - DAY_MS, entry.addedAt + 60 * DAY_MS))
      if (entry.minutes === 0) entry.minutes = Math.round(length * 1.1)
    }
  }
  return entry
}
