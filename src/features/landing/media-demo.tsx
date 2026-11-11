import { z } from 'zod'

import records from '../../../fixtures/igdb/games.json'
import { Screenshots } from '@/features/game-detail/screenshots'

import '../game-detail/game-detail.css'

/** The example shelf's own game, checked from fixtures; no visitor's record or live catalog read. */
const games = z
  .array(
    z.object({
      slug: z.string(),
      name: z.string(),
      screenshots: z
        .array(z.object({ image_id: z.string(), width: z.number(), height: z.number() }))
        .default([]),
    }),
  )
  .parse(records)
const game = games.find((each) => each.slug === 'hollow-knight')!

/**
 * The gallery working on the example shelf's game. No link to the game's page: the example shelf
 * is drawn on this page alone, and no shelf of that name is in production to open it on.
 */
export function MediaDemo() {
  return (
    <div className="rounded-panel border border-line bg-surface p-3 sm:p-5">
      <h3 className="mb-3 title text-xl">{game.name}</h3>
      <Screenshots
        title={game.name}
        shots={game.screenshots
          .slice(0, 4)
          .map((shot) => ({ id: shot.image_id, width: shot.width, height: shot.height }))}
      />
    </div>
  )
}
