import { isGame, kindOf } from '@/domain/igdb/game'
import type { IgdbExternalGame } from '@/domain/igdb/schema'

/**
 * The ladder's second rung (ADR 003, decision 1): the IGDB record that
 * carries a store's id. Usually there is one. When IGDB lists the id on
 * more than one record, the game itself is preferred to an edition of it,
 * and a game to a bundle; anything still undecided is left to the next rung,
 * and then to me.
 *
 * A store lists apps I launch, each with its own hours. When IGDB files that
 * id under one record only, and calls it an add-on (a season, an episode),
 * the store is right that it is something I play: that record is the game.
 */
export const chooseByStoreId = (games: readonly IgdbExternalGame['game'][]): number | undefined => {
  const playable = games.filter(isGame)
  if (playable.length === 0) return games.length === 1 ? games[0]!.id : undefined
  const narrow = (list: typeof playable, keep: (game: (typeof playable)[number]) => boolean) => {
    const kept = list.filter(keep)
    return kept.length > 0 ? kept : list
  }
  const choice = narrow(
    narrow(playable, (game) => game.version_parent === undefined),
    (game) => kindOf(game) !== 'bundle',
  )
  return choice.length === 1 ? choice[0]!.id : undefined
}
