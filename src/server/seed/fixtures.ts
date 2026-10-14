import 'server-only'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

import type { Palette } from '@/domain/color/palette'
import type { LineageStep } from '@/domain/igdb/game'
import {
  igdbGameSchema,
  igdbLineageSchema,
  igdbNamedSchema,
  igdbPlatformSchema,
  igdbTimeToBeatSchema,
  type IgdbGame,
  type IgdbLineage,
  type IgdbNamed,
  type IgdbPlatform,
  type IgdbTimeToBeat,
  type VocabKind,
} from '@/domain/igdb/schema'

/**
 * Reads `fixtures/`: real IGDB records fetched once by `pnpm fixtures:fetch`
 * and committed. Seeds and the IGDB test double both read them through here,
 * and through the same schemas a live answer passes.
 *
 * The files are read from disk, not imported, so they never ride along in a
 * bundle.
 */

export type Fixtures = {
  /** Every record, sample and stress alike, by IGDB id. */
  games: Map<number, IgdbGame>
  /** Records that exist only as the originals of ports and editions. */
  ancestors: Map<number, IgdbLineage>
  timeToBeat: Map<number, IgdbTimeToBeat>
  lineage: Map<number, LineageStep[]>
  names: Record<Exclude<VocabKind, 'company'>, IgdbNamed[]>
  platforms: IgdbPlatform[]
  covers: Map<string, { colors: Palette; thumbhash: string }>
  sets: {
    /** The sample library: one entry each. */
    default: number[]
    /** Other versions of sample games, folded into their entries. */
    versions: number[]
    /** More games, for testing with a thousand and more. */
    stress: number[]
  }
}

// `turbopackIgnore`: the fixtures are read where the repository is (this
// machine, CI), never on a deployment, so they are kept out of what ships.
const read = (root: string, path: string): unknown =>
  JSON.parse(readFileSync(/* turbopackIgnore: true */ join(root, path), 'utf8'))

const hex = z.string().regex(/^#[0-9a-f]{6}$/i)

const coverSchema = z.record(
  z.string(),
  z.object({ colors: z.tuple([hex, hex, hex]), thumbhash: z.string().min(1) }),
)

const lineageSchema = z.record(
  z.string(),
  z.array(
    z.object({
      igdbId: z.number().int(),
      via: z.enum(['edition', 'port', 'remaster', 'expanded', 'remake']),
    }),
  ),
)

const setsSchema = z.object({
  default: z.array(z.number().int()),
  versions: z.array(z.number().int()),
  stress: z.array(z.number().int()),
})

const named = z.array(igdbNamedSchema)

const namesSchema = z.object({
  genre: named,
  theme: named,
  mode: named,
  perspective: named,
  franchise: named,
  series: named,
  keyword: named,
})

let cached: { root: string; fixtures: Fixtures } | undefined

export const loadFixtures = (
  root = join(/* turbopackIgnore: true */ process.cwd(), 'fixtures'),
): Fixtures => {
  if (cached?.root === root) return cached.fixtures

  const games = new Map<number, IgdbGame>()
  for (const file of ['igdb/games.json', 'igdb/games-stress.json']) {
    for (const record of z.array(igdbGameSchema).parse(read(root, file))) {
      games.set(record.id, record)
    }
  }

  const fixtures: Fixtures = {
    games,
    ancestors: new Map(
      z
        .array(igdbLineageSchema)
        .parse(read(root, 'igdb/ancestors.json'))
        .map((record) => [record.id, record]),
    ),
    timeToBeat: new Map(
      z
        .array(igdbTimeToBeatSchema)
        .parse(read(root, 'igdb/time-to-beat.json'))
        .map((row) => [row.game_id, row]),
    ),
    lineage: new Map(
      Object.entries(lineageSchema.parse(read(root, 'igdb/lineage.json'))).map(([id, steps]) => [
        Number(id),
        steps,
      ]),
    ),
    names: namesSchema.parse(read(root, 'igdb/names.json')),
    platforms: z.array(igdbPlatformSchema).parse(read(root, 'igdb/platforms.json')),
    covers: new Map(
      Object.entries(coverSchema.parse(read(root, 'covers.json'))).map(([id, art]) => [
        id,
        { colors: art.colors as unknown as Palette, thumbhash: art.thumbhash },
      ]),
    ),
    sets: setsSchema.parse(read(root, 'library/sets.json')),
  }

  cached = { root, fixtures }
  return fixtures
}
