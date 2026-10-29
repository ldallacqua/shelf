import type { Library, LibraryGame } from '@/domain/library/library'
import type { Ranked, StatGame } from '@/domain/library/trophy-stats'
import type { Day, Status } from '@/domain/library/values'

/**
 * The trophy page's second phase of figures (issue 68): how I rate games,
 * against IGDB's players too, how far through each series I am, the
 * milestones of my finishing years, and the sentences a reader would say on
 * looking at all of them. Each is worked out from the library alone, and
 * said only when enough games stand behind it.
 */

/** How a list of kinds is ranked: games finished, hours on them, my rating of them, or the share finished of those begun. */
export const measures = ['finished', 'hours', 'rating', 'share'] as const
export type Measure = (typeof measures)[number]

export const isMeasure = (value: unknown): value is Measure =>
  typeof value === 'string' && (measures as readonly string[]).includes(value)

/** A kind's average rating is said once this many of its finished games are rated. */
export const RATED_FROM = 3

/** IGDB's rating is set beside mine only once this many of its players rated the game. */
export const COMMUNITY_FROM = 10
/** Mine against IGDB's is drawn from this many games. */
export const VERSUS_FROM = 5
/** How far, out of 100, mine stands from IGDB's for a game to be a gem or a letdown. */
export const GAP = 15
/** How many gems and letdowns are named. */
export const GAPS_SHOWN = 5

/** How many series are shown, and how many games one needs on the shelf. */
export const SERIES_SHOWN = 8
const SERIES_FROM = 2

/** The finishes the timeline marks: the first, the tenth, and so on. */
export const MILESTONES = [1, 10, 25, 50, 100, 250, 500, 1000] as const

/** At most this many sentences. */
export const INSIGHTS_SHOWN = 6

const average = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const gameOf = ({ slug, title }: LibraryGame): StatGame => ({ slug, title })

export type RatedGame = StatGame & {
  /** Mine, 0 to 100. */
  mine: number
  /** IGDB's, 0 to 100. */
  theirs: number
}

export type Ratings = {
  /** How many games have each rating, by whole point out of ten: the first holds 0 and 0.5, the last 10. */
  spread: number[]
  rated: number
  /** Mine beside IGDB's, of the games enough of its players rated: `gap` is mine less theirs, on average. */
  versus?: { gap: number; games: RatedGame[] }
  /** Rated well above IGDB's, the widest gap first. */
  gems: RatedGame[]
  /** Rated well below it, the widest gap first. */
  letdowns: RatedGame[]
}

/** My ratings of these games, and how they stand against IGDB's players'. */
export const ratingsOf = (games: readonly LibraryGame[]): Ratings | undefined => {
  const rated = games.filter((game) => game.rating !== undefined)
  if (rated.length === 0) return undefined
  const spread = Array.from({ length: 11 }, () => 0)
  for (const game of rated) spread[Math.min(10, Math.floor(game.rating! / 10))]! += 1
  const pairs: RatedGame[] = rated.flatMap((game) =>
    game.igdbRating !== undefined && game.igdbRatingCount >= COMMUNITY_FROM
      ? [{ ...gameOf(game), mine: game.rating!, theirs: game.igdbRating }]
      : [],
  )
  const gap = (pair: RatedGame) => pair.mine - pair.theirs
  const widest = (a: RatedGame, b: RatedGame) =>
    Math.abs(gap(b)) - Math.abs(gap(a)) || a.title.localeCompare(b.title)
  return {
    spread,
    rated: rated.length,
    ...(pairs.length >= VERSUS_FROM
      ? { versus: { gap: average(pairs.map(gap)), games: pairs } }
      : {}),
    gems: pairs
      .filter((pair) => gap(pair) >= GAP)
      .sort(widest)
      .slice(0, GAPS_SHOWN),
    letdowns: pairs
      .filter((pair) => gap(pair) <= -GAP)
      .sort(widest)
      .slice(0, GAPS_SHOWN),
  }
}

export type SeriesProgress = {
  kind: 'franchise' | 'series'
  id: number
  name: string
  /** Its value in the filter language: `franchise:{slug}`, `series:{slug}`. */
  slug: string
  finished: number
  /** Its games on the shelf: wishlist games are not had, and a retired one had no end to reach. */
  total: number
  /** By release, then title. */
  games: (StatGame & { status: Status; year?: number })[]
}

/** Not counted in a series: not had yet, or with no end to reach (spec 3.12). */
const OUTSIDE: ReadonlySet<Status> = new Set(['wishlist', 'retired'])

/**
 * How far through each series and franchise on the shelf I am: those with
 * two games or more and one finished, the most finished first. A series and
 * a franchise of the same name are one. `complete` counts every one finished
 * whole, shown or not.
 */
export const seriesOf = (library: Library): { shown: SeriesProgress[]; complete: number } => {
  const tally = new Map<string, SeriesProgress>()
  const add = (kind: SeriesProgress['kind'], ids: readonly number[], game: LibraryGame) => {
    const names = kind === 'franchise' ? library.names.franchise : library.names.series
    for (const id of new Set(ids)) {
      const named = names.find((each) => each.id === id)
      if (!named) continue
      const key = `${kind}:${id}`
      let found = tally.get(key)
      if (!found) {
        found = { kind, id, name: named.name, slug: named.slug, finished: 0, total: 0, games: [] }
        tally.set(key, found)
      }
      found.total += 1
      if (game.status === 'completed') found.finished += 1
      found.games.push({
        ...gameOf(game),
        status: game.status,
        ...(game.year === undefined ? {} : { year: game.year }),
      })
    }
  }
  for (const game of library.games) {
    if (OUTSIDE.has(game.status)) continue
    add('series', game.series, game)
    add('franchise', game.franchises, game)
  }
  const byName = new Map<string, SeriesProgress>()
  for (const each of tally.values()) {
    if (each.total < SERIES_FROM || each.finished === 0) continue
    const name = each.name.toLocaleLowerCase()
    const known = byName.get(name)
    if (!known || each.total > known.total) byName.set(name, each)
  }
  const kept = [...byName.values()]
  for (const each of kept) {
    each.games.sort(
      (a, b) =>
        (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER) ||
        a.title.localeCompare(b.title),
    )
  }
  return {
    shown: kept
      .sort((a, b) => b.finished - a.finished || b.total - a.total || a.name.localeCompare(b.name))
      .slice(0, SERIES_SHOWN),
    complete: kept.filter((each) => each.finished === each.total).length,
  }
}

/** A finish the timeline marks: the first, the tenth… or the first I rated 10. */
export type Milestone = StatGame & { on: Day; nth?: number; perfect?: true }

export type TimelineYear = {
  year: number
  finished: number
  /** The genre finished most that year, when one leads with two or more. */
  genre?: { name: string; slug: string; finished: number }
  /** The year before's, when this year's is another. */
  was?: string
  best?: true
  milestones: Milestone[]
}

/** The genre a set of games has most, when one has more than any other, and at least two. */
const leading = (games: readonly LibraryGame[], library: Library) => {
  const counts = new Map<number, number>()
  for (const game of games) {
    for (const id of new Set(game.genres)) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const [first, second] = [...counts].sort((a, b) => b[1] - a[1])
  if (!first || first[1] < 2 || (second && second[1] === first[1])) return undefined
  const named = library.names.genre.find((each) => each.id === first[0])
  return named ? { name: named.name, slug: named.slug, finished: first[1] } : undefined
}

/**
 * Every year something was finished in, oldest first, with what led it and
 * the milestones reached in it. `dated` is the finished games with a day.
 */
export const timelineOf = (
  library: Library,
  dated: readonly LibraryGame[],
  bestYear: number | undefined,
): TimelineYear[] => {
  const ordered = [...dated].sort(
    (a, b) =>
      (a.completedOn! < b.completedOn! ? -1 : a.completedOn! > b.completedOn! ? 1 : 0) ||
      a.title.localeCompare(b.title),
  )
  const years: TimelineYear[] = []
  const perfect = ordered.find((game) => game.rating === 100)
  ordered.forEach((game, index) => {
    const year = Number(game.completedOn!.slice(0, 4))
    let last = years.at(-1)
    if (last?.year !== year) {
      last = { year, finished: 0, milestones: [] }
      years.push(last)
    }
    last.finished += 1
    const nth = index + 1
    if ((MILESTONES as readonly number[]).includes(nth)) {
      last.milestones.push({ ...gameOf(game), on: game.completedOn!, nth })
    }
    if (game === perfect)
      last.milestones.push({ ...gameOf(game), on: game.completedOn!, perfect: true })
  })
  let before: string | undefined
  for (const each of years) {
    const games = ordered.filter((game) => game.completedOn!.startsWith(`${each.year}-`))
    const genre = games.length >= 3 ? leading(games, library) : undefined
    if (genre) {
      each.genre = genre
      if (before && before !== genre.name) each.was = before
      before = genre.name
    }
    if (each.year === bestYear) each.best = true
  }
  return years
}

/** How many games finished came out in each decade, from the oldest decade to the newest. */
export const decadesOf = (finished: readonly LibraryGame[]) => {
  const years = finished.flatMap((game) => (game.year === undefined ? [] : [game.year]))
  if (years.length === 0) return []
  const first = Math.floor(Math.min(...years) / 10) * 10
  const last = Math.floor(Math.max(...years) / 10) * 10
  const decades: { decade: number; finished: number }[] = []
  for (let decade = first; decade <= last; decade += 10) {
    decades.push({
      decade,
      finished: years.filter((year) => year >= decade && year < decade + 10).length,
    })
  }
  return decades
}

/**
 * One thing worth saying about the figures, as data: the page words it.
 * Each is said only when enough games stand behind it.
 */
export type Insight =
  /** This year's finishes beat every year before's. */
  | { kind: 'record'; year: number; finished: number; best: { year: number; finished: number } }
  /** More this year than in all of last year. */
  | { kind: 'ahead'; year: number; finished: number; last: number }
  /** A few short of last year's. */
  | { kind: 'behind'; year: number; finished: number; last: number }
  /** A game finished in this month of an earlier year. */
  | { kind: 'anniversary'; game: StatGame; on: Day; years: number }
  /** This year's leading genre is not the one that leads of all time. */
  | { kind: 'shift'; year: number; genre: { name: string; slug: string }; favorite: string }
  /** The genre I finish most of what I start, well above the rest. */
  | { kind: 'finisher'; genre: Ranked; share: number; overall: number }
  /** The developer I rate highest. */
  | { kind: 'maker'; developer: Ranked; rating: number }
  /** How my ratings stand against IGDB's players'. */
  | { kind: 'versus'; gap: number; games: number }
  /** How long I take against IGDB's normal playthrough. */
  | { kind: 'pace'; ratio: number; games: number }
  /** Most finishes came out long before, or only just. */
  | { kind: 'age'; share: number; old: boolean; games: number }

/** Of time: how this year stands against the last and the best, and an anniversary. */
export const timeInsights = (
  perYear: readonly { year: number; finished: number }[],
  dated: readonly LibraryGame[],
  year: number,
  today: Day | undefined,
): Insight[] => {
  const said: Insight[] = []
  const now = perYear.find((each) => each.year === year)?.finished ?? 0
  const before = perYear.filter((each) => each.year < year)
  const best = before.reduce<{ year: number; finished: number } | undefined>(
    (top, each) => (!top || each.finished > top.finished ? each : top),
    undefined,
  )
  const last = before.find((each) => each.year === year - 1)?.finished ?? 0
  if (best && best.finished >= 3 && now > best.finished) {
    said.push({ kind: 'record', year, finished: now, best })
  } else if (last >= 3 && now > last) {
    said.push({ kind: 'ahead', year, finished: now, last })
  } else if (last >= 3 && now < last && last - now <= 5) {
    said.push({ kind: 'behind', year, finished: now, last })
  }
  if (today) {
    const month = today.slice(5, 7)
    const thisYear = Number(today.slice(0, 4))
    const then = dated
      .filter(
        (game) =>
          game.completedOn!.slice(5, 7) === month &&
          Number(game.completedOn!.slice(0, 4)) < thisYear,
      )
      .sort((a, b) =>
        a.completedOn! > b.completedOn! ? -1 : a.completedOn! < b.completedOn! ? 1 : 0,
      )[0]
    if (then) {
      said.push({
        kind: 'anniversary',
        game: gameOf(then),
        on: then.completedOn!,
        years: thisYear - Number(then.completedOn!.slice(0, 4)),
      })
    }
  }
  return said
}

/** Of these finished games: how long I take on them, and how old they were when I did. */
export const playInsights = (finished: readonly LibraryGame[]): Insight[] => {
  const said: Insight[] = []
  const timed = finished.filter((game) => game.minutes > 0 && (game.length ?? 0) > 0)
  if (timed.length >= 5) {
    const ratio = median(timed.map((game) => game.minutes / game.length!))
    if (ratio >= 1.25 || ratio <= 0.8) said.push({ kind: 'pace', ratio, games: timed.length })
  }
  const aged = finished.flatMap((game) =>
    game.completedOn && game.year !== undefined
      ? [Number(game.completedOn.slice(0, 4)) - game.year]
      : [],
  )
  if (aged.length >= 10) {
    const old = aged.filter((age) => age >= 5).length / aged.length
    const fresh = aged.filter((age) => age <= 1).length / aged.length
    if (old >= 0.5) said.push({ kind: 'age', share: old, old: true, games: aged.length })
    else if (fresh >= 0.5) said.push({ kind: 'age', share: fresh, old: false, games: aged.length })
  }
  return said
}
