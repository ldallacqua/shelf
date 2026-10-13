import type { LibraryGame } from '@/domain/library/library'

/** The line above the shelves: games, finished, hours. A game is counted once, however many copies. */
export type LibraryStats = {
  games: number
  finished: number
  /** Whole hours played, rounded down. */
  hours: number
}

export const libraryStats = (
  games: readonly Pick<LibraryGame, 'status' | 'minutes'>[],
): LibraryStats => {
  let finished = 0
  let minutes = 0
  for (const game of games) {
    if (game.status === 'completed') finished += 1
    minutes += game.minutes
  }
  return { games: games.length, finished, hours: Math.floor(minutes / 60) }
}
