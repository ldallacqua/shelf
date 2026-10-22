import 'server-only'

import { ledFrom, NEUTRAL_PALETTE } from '@/domain/color/palette'
import type { LibraryCopy, LibraryGame } from '@/domain/library/library'
import { trophyWall, type TrophyStats, type TrophyYear } from '@/domain/library/trophies'

import { demoLibrary, matchesOf } from './ask-engine'
import type { AskGame, DemoGame } from './demo-case'
import { ASK_STEPS, EVERY_COPY, type AskStep } from './demo-choices'

/*
 * The example shelf the landing page is built from (`pnpm landing:demo`),
 * read when the page is built: the page needs no database, and no account's
 * games are ever shown on it.
 */

const platforms = new Map(demoLibrary.names.platform.map((platform) => [platform.id, platform]))
const bySlug = new Map(demoLibrary.games.map((game) => [game.slug, game]))

const hours = (minutes: number | undefined) =>
  minutes === undefined ? undefined : Math.round(minutes / 60)

/** A game as a box: in the case of one of its copies, or of the first platform it came out on. */
const toDemo = (game: LibraryGame, copy: LibraryCopy | undefined = game.copies[0]): DemoGame => {
  const platform = platforms.get(copy?.platform ?? game.platforms[0] ?? -1)
  const colors = game.colors ?? NEUTRAL_PALETTE
  return {
    slug: game.slug,
    title: game.title,
    cover: copy?.cover ?? game.cover ?? '',
    colors,
    led: ledFrom(colors[0]),
    shape: platform?.shape ?? 'keepCase',
    plastic: platform?.plastic ?? 'black',
    platform: platform?.short ?? '',
    format: copy?.format ?? 'physical',
    status: game.status,
    year: game.year,
    length: hours(game.length),
    hours: hours(game.minutes) ?? 0,
    rating: game.rating === undefined ? undefined : game.rating / 10,
  }
}

/** Every game on the example shelf, once each, in the order the script chose them. */
export const demoGames = (): DemoGame[] => demoLibrary.games.map((game) => toDemo(game))

/**
 * The example shelf for "Ask it anything", which is sent to the browser whole:
 * each game as its box draws it, and no more.
 */
export const askGames = (): AskGame[] =>
  demoGames().map(({ slug, title, cover, colors, led, shape, plastic }) => ({
    slug,
    title,
    cover,
    colors,
    led,
    shape,
    plastic,
  }))

/**
 * What each of "Ask it anything"'s filters finds on its own. Filters side by
 * side mean "and", so the browser finds any mix of them by keeping what all
 * of them found, with no filter language of its own.
 */
export const askMatches = (): Record<AskStep, string[]> =>
  Object.fromEntries(ASK_STEPS.map((step) => [step.key, matchesOf(step.query).slugs])) as Record<
    AskStep,
    string[]
  >

/** The game owned many ways, once per copy. */
export const everyCopy = (): DemoGame[] => {
  const game = bySlug.get(EVERY_COPY)
  if (!game) throw new Error(`${EVERY_COPY} is not on the example shelf: run pnpm landing:demo`)
  return game.copies.map((copy) => toDemo(game, copy))
}

/** The example shelf's trophy wall, as a glimpse: its stats, and the year it finished games most lately. */
export const demoTrophies = (): { stats: TrophyStats; latest: TrophyYear } => {
  // The example shelf's "this year" is the last year it finished anything, so it never reads 0.
  const year = Math.max(
    ...demoLibrary.games.flatMap((game) =>
      game.completedOn ? [Number(game.completedOn.slice(0, 4))] : [],
    ),
  )
  const wall = trophyWall(demoLibrary, year)
  const latest = wall.years[0]
  if (!latest) throw new Error('Nothing is finished on the example shelf: run pnpm landing:demo')
  return { stats: wall.stats, latest }
}
