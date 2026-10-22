/**
 * pnpm landing:demo
 *
 * Writes the landing page's example shelf, `src/features/landing/demo-library.json`:
 * about sixty games from the sample library (real IGDB records from `fixtures/`, with
 * what "I" did with each invented by the seed), in the shape every view reads. The
 * page is built from that file, so it needs no database and no account.
 *
 * Run it again after the fixtures change, and review the diff.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Library, LibraryGame, Named } from '@/domain/library/library'
import { EVERY_COPY } from '@/features/landing/demo-choices'
import { openDatabase } from '@/server/db/client'
import { migrateDatabase } from '@/server/db/migrate'
import { readLibrary } from '@/server/library/read'
import { seedLibrary } from '@/server/seed/seed'

/**
 * The games, by slug: covers that read well small, from every era and most
 * platforms, so the shelf shows off its case shapes.
 */
const CHOSEN = [
  // Switch
  'the-legend-of-zelda-breath-of-the-wild',
  'super-mario-odyssey',
  'hollow-knight',
  'animal-crossing-new-horizons',
  'stardew-valley',
  'octopath-traveler-ii',
  'mario-kart-8-deluxe',
  'metroid-dread',
  'kirby-and-the-forgotten-land',
  'super-smash-bros-ultimate',
  'dave-the-diver',
  'it-takes-two',
  'what-remains-of-edith-finch',
  // PlayStation 5 and 4
  'astro-bot',
  'god-of-war-ragnarok',
  'horizon-forbidden-west',
  'ghost-of-tsushima',
  'hades--1',
  'returnal',
  'final-fantasy-xvi',
  'sea-of-stars',
  'tunic',
  'bloodborne',
  'nier-automata',
  'celeste',
  'cuphead',
  'outer-wilds',
  'slay-the-spire',
  'street-fighter-6',
  'tetris-effect-connected',
  'marvels-spider-man',
  // PC
  'elden-ring',
  'disco-elysium',
  'half-life-2',
  'inside',
  'firewatch',
  'return-of-the-obra-dinn',
  'factorio',
  'papers-please',
  'hades-ii',
  'the-elder-scrolls-v-skyrim',
  // Xbox
  'halo-combat-evolved',
  'gears-of-war',
  'fallout-new-vegas',
  'alan-wake-ii',
  'balatro',
  // Earlier
  'super-mario-64',
  'banjo-kazooie',
  'goldeneye-007',
  'super-metroid',
  'earthbound',
  'the-legend-of-zelda-a-link-to-the-past',
  'final-fantasy-ix',
  'crash-bandicoot',
  'metal-gear-solid',
  'pokemon-emerald-version',
  'kingdom-hearts-ii',
  'burnout-3-takedown',
  'metroid-prime',
  'the-legend-of-zelda-the-wind-waker',
  'super-mario-galaxy',
]

const db = openDatabase({ kind: 'memory' })
await migrateDatabase(db)
const { libraryId } = await seedLibrary(db, 'default')
const sample = await readLibrary(db, libraryId)

const bySlug = new Map(sample.games.map((game) => [game.slug, game]))
const missing = CHOSEN.filter((slug) => !bySlug.get(slug)?.cover)
if (missing.length > 0)
  throw new Error(`Not in the sample, or without a cover: ${missing.join(', ')}`)

const platformKey = new Map(sample.names.platform.map((platform) => [platform.key, platform.id]))
const games: LibraryGame[] = CHOSEN.map((slug) => {
  // Tags are positions in the sample's own list; the example shelf has none.
  const game: LibraryGame = { ...bySlug.get(slug)!, tags: [] }
  if (slug === EVERY_COPY) {
    const ps3 = platformKey.get('ps3')
    if (ps3 === undefined || !game.platforms.includes(ps3))
      throw new Error('Skyrim has no PS3 to add')
    game.copies = [...game.copies, { platform: ps3, format: 'physical' }]
  }
  return game
})

/** Only the names the chosen games use. */
const used = <T extends { id: number }>(all: readonly T[], ids: Iterable<number>): T[] => {
  const wanted = new Set(ids)
  return all.filter((item) => wanted.has(item.id))
}
const every = (pick: (game: LibraryGame) => readonly number[]) => games.flatMap(pick)

const library: Library = {
  version: 1,
  games,
  names: {
    genre: used(
      sample.names.genre,
      every((game) => game.genres),
    ),
    theme: used(
      sample.names.theme,
      every((game) => game.themes),
    ),
    mode: used(
      sample.names.mode,
      every((game) => game.modes),
    ),
    perspective: used(
      sample.names.perspective,
      every((game) => game.perspectives),
    ),
    franchise: used(
      sample.names.franchise,
      every((game) => game.franchises),
    ),
    series: used(
      sample.names.series,
      every((game) => game.series),
    ),
    company: used<Named>(
      sample.names.company,
      every((game) => [...game.developers, ...game.publishers]),
    ),
    platform: used(sample.names.platform, [
      ...every((game) => game.platforms),
      ...every((game) => game.copies.map((copy) => copy.platform)),
    ]),
    tag: [],
  },
}

const path = join('src', 'features', 'landing', 'demo-library.json')
writeFileSync(path, `${JSON.stringify(library)}\n`)
console.log(`Wrote ${games.length} games to ${path}, ${JSON.stringify(library).length} bytes.`)
