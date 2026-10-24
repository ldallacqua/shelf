import 'server-only'

import { z } from 'zod'

import { statuses, syncSources } from '@/domain/library/values'

/**
 * What the page for placing a sync's games is answered with (spec 4.5): the
 * signed-in account's unsorted games and how many games stand in each
 * status. In the library file's units, as that page reads them beside it:
 * a rating out of 100, minutes, IGDB image ids. Only the account's own, and
 * kept by no one.
 */

const tally = z.record(z.enum(statuses), z.int().min(0))

export const apiUnsorted = z.object({
  version: z.int(),
  games: z.array(
    z.object({
      entryId: z.string(),
      slug: z.string(),
      title: z.string(),
      year: z.int().optional(),
      cover: z.string().optional(),
      colors: z.tuple([z.string(), z.string(), z.string()]).readonly().optional(),
      hash: z.string().optional(),
      rating: z.int().min(0).max(100).optional(),
      addedOn: z.iso.date(),
      minutes: z.int().min(0),
      platforms: z.array(z.int()),
      played: z.array(
        z.object({
          source: z.enum(syncSources),
          minutes: z.int().min(0),
          lastPlayedAt: z.int().optional(),
        }),
      ),
    }),
  ),
  tally,
  platforms: z.array(
    z.object({ id: z.int(), key: z.string(), name: z.string(), short: z.string() }),
  ),
})

/** How many games stand in each status, without the games: what the page that sets a shelf up reads. */
export const apiTally = z.object({ version: z.int(), tally })
