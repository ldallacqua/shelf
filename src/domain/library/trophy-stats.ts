import type { Library, LibraryGame, Named } from '@/domain/library/library'
import { libraryStats } from '@/domain/library/stats'
import { backlogOf, type BacklogStats } from '@/domain/library/trophy-backlog'
import {
  decadesOf,
  INSIGHTS_SHOWN,
  playInsights,
  RATED_FROM,
  ratingsOf,
  seriesOf,
  timeInsights,
  timelineOf,
  type Insight,
  type Measure,
  type Ratings,
  type SeriesProgress,
  type TimelineYear,
} from '@/domain/library/trophy-taste'
import type { Day, Status } from '@/domain/library/values'

/**
 * The trophy page's figures (spec 3.9, issue 68): what is finished, when,
 * of what kind, and the records among them, worked out from the library
 * alone. Every figure is of all time, or of the games finished in one year;
 * what cannot be known is left out rather than shown as nothing.
 */

/** A game a figure is about, by its address. */
export type StatGame = { slug: string; title: string }

/** How one genre, theme or platform stands among the games finished. */
export type Ranked = {
  id: number
  name: string
  /** Its value in the filter language: `genre:{slug}`, `owned:{slug}`. */
  slug: string
  finished: number
  /** Minutes played on the games of it finished. */
  minutes: number
  /** Of the games of it started, the share finished, once enough were started to say: 0 to 1. */
  share?: number
  /** My average rating of the games of it finished, out of 100, once enough are rated. */
  rating?: number
}

/** Months in a row with a game finished in each, as `YYYY-MM`. */
export type Streak = { months: number; from: string; to: string }

export type TrophyStats = {
  finished: number
  /** Finished in `year`. */
  thisYear: number
  /** The year it was when the figures were worked out. */
  year: number
  /** The year the figures are of, when they are of one: the games finished in it. */
  scope?: number
  /** Whole hours: across the whole library, or on the games finished in the year. */
  hours: number
  /** Out of 100: of every rating given, or of the games finished in the year. */
  averageRating?: number
  /** Of the games started, how many were finished, from 0 to 1. All time only. */
  finishedShare?: number
  /** Playing, finished or dropped. */
  started: number
  dropped: number
  /** The middle of the finished games' minutes, of those with any. */
  medianMinutes?: number
  longest?: StatGame & { minutes: number }
  /** By the hours on each game's main copy: the library does not split a game's hours by copy. */
  platform?: { id: number; name: string; minutes: number }
  /** Finished each year, from the first such year to `year`, a year with none as 0. */
  perYear: { year: number; finished: number }[]
  /** Finished each month, January first, by year, the latest year first. */
  perMonth: { year: number; months: number[] }[]
  /** The months in a row up to this one, or the last if nothing is finished in this one yet. */
  streak: { current: number; longest?: Streak }
  /** What the kinds below are ranked by. The share finished is of all time only. */
  by: Measure
  genres: Ranked[]
  themes: Ranked[]
  platforms: Ranked[]
  modes: Ranked[]
  perspectives: Ranked[]
  developers: Ranked[]
  publishers: Ranked[]
  /** The games finished by the decade they came out in, from the oldest to the newest. */
  decades: { decade: number; finished: number }[]
  /** Of every rating given, or of the games finished in the year. */
  ratings?: Ratings
  /** How far through each series. All time only, so none for a year. */
  series: { shown: SeriesProgress[]; complete: number }
  /** Every year with a finish, oldest first, with its milestones. All time only. */
  timeline: TimelineYear[]
  /** What is worth saying about it all, most telling first. */
  insights: Insight[]
  /** What is still to play, when anything is in the backlog or Someday. All time only. */
  backlog?: BacklogStats
  records: {
    first?: StatGame & { on: Day }
    quickest?: StatGame & { minutes: number }
    /** Played longest of all, finished or not, when that is not the longest finished. All time only. */
    mostPlayed?: StatGame & { minutes: number }
    bestRated?: StatGame & { rating: number }
    /** Released longest ago. */
    oldest?: StatGame & { year: number }
    /** All time only. */
    bestYear?: { year: number; finished: number }
    /** Only when a month has more than one. */
    bestMonth?: { month: string; finished: number }
  }
}

/**
 * Begun, whether or not finished: backlog, someday and wishlist games are not.
 * Nor is a retired one: it had no end to reach, so it neither raises nor
 * lowers the share finished (spec 3.12).
 */
const STARTED: ReadonlySet<Status> = new Set(['playing', 'completed', 'dropped'])

/** A genre's share finished is said only once this many of it were started. */
export const SHARE_FROM = 5
/** How many genres, themes and platforms are ranked. */
export const RANKED = 8
/** How many modes, perspectives, developers and publishers: lists read beside the first three. */
export const RANKED_MORE = 5

const gameOf = ({ slug, title }: LibraryGame): StatGame => ({ slug, title })

const monthOf = (day: Day) => day.slice(0, 7)
const nextMonth = (month: string) => {
  const [year, at] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))]
  return at === 12 ? `${year + 1}-01` : `${year}-${String(at + 1).padStart(2, '0')}`
}
const previousMonth = (month: string) => {
  const [year, at] = [Number(month.slice(0, 4)), Number(month.slice(5, 7))]
  return at === 1 ? `${year - 1}-12` : `${year}-${String(at - 1).padStart(2, '0')}`
}

const median = (values: readonly number[]): number | undefined => {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/** The one with the most of `by`, ties going to the one `tie` prefers. */
const most = <T>(items: readonly T[], by: (item: T) => number, tie: (a: T, b: T) => number) => {
  let best: T | undefined
  for (const item of items) {
    if (
      best === undefined ||
      by(item) > by(best) ||
      (by(item) === by(best) && tie(item, best) < 0)
    ) {
      best = item
    }
  }
  return best
}

const later = (a: LibraryGame, b: LibraryGame) =>
  (b.completedOn ?? '') < (a.completedOn ?? '')
    ? -1
    : (b.completedOn ?? '') > (a.completedOn ?? '')
      ? 1
      : 0

/** What each measure ranks by, among the kinds that have it; ties go to more finished, then the name. */
const MEASURED: Record<Measure, (ranked: Ranked) => number | undefined> = {
  finished: (ranked) => ranked.finished,
  hours: (ranked) => (ranked.minutes > 0 ? ranked.minutes : undefined),
  rating: (ranked) => ranked.rating,
  share: (ranked) => ranked.share,
}

/**
 * Each kind's games finished, ranked by `by`: how many, the hours on them, my
 * rating of them, or the share of those started that were finished. A kind
 * without enough to say the measure is left out of that ranking.
 */
const rank = (
  finished: readonly LibraryGame[],
  started: readonly LibraryGame[] | undefined,
  kindsOf: (game: LibraryGame) => readonly number[],
  named: ReadonlyMap<number, Pick<Named, 'name' | 'slug'>>,
  by: Measure = 'finished',
  limit = RANKED,
): Ranked[] => {
  type Tally = Ranked & { started: number; rated: number[] }
  const tally = new Map<number, Tally>()
  const entry = (id: number) => {
    let found = tally.get(id)
    const name = named.get(id)
    if (!found && name) {
      found = {
        id,
        name: name.name,
        slug: name.slug,
        finished: 0,
        minutes: 0,
        started: 0,
        rated: [],
      }
      tally.set(id, found)
    }
    return found
  }
  for (const game of finished) {
    for (const id of new Set(kindsOf(game))) {
      const found = entry(id)
      if (!found) continue
      found.finished += 1
      found.minutes += game.minutes
      if (game.rating !== undefined) found.rated.push(game.rating)
    }
  }
  for (const game of started ?? []) {
    for (const id of new Set(kindsOf(game))) {
      const found = tally.get(id)
      if (found) found.started += 1
    }
  }
  const value = (ranked: Ranked) => MEASURED[by](ranked) ?? 0
  return [...tally.values()]
    .map(({ started: begun, rated, ...ranked }): Ranked => ({
      ...ranked,
      ...(started && begun >= SHARE_FROM ? { share: ranked.finished / begun } : {}),
      ...(rated.length >= RATED_FROM
        ? { rating: rated.reduce((sum, each) => sum + each, 0) / rated.length }
        : {}),
    }))
    .filter((ranked) => MEASURED[by](ranked) !== undefined)
    .sort(
      (a, b) =>
        value(b) - value(a) ||
        b.finished - a.finished ||
        b.minutes - a.minutes ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit)
}

const streaksOf = (months: ReadonlySet<string>, today: Day | undefined): TrophyStats['streak'] => {
  let longest: Streak | undefined
  for (const month of [...months].sort()) {
    if (months.has(previousMonth(month))) continue
    let to = month
    let length = 1
    while (months.has(nextMonth(to))) {
      to = nextMonth(to)
      length += 1
    }
    if (!longest || length >= longest.months) longest = { months: length, from: month, to }
  }
  let current = 0
  if (today) {
    // A month with nothing finished yet does not end the streak until it is over.
    let month = monthOf(today)
    if (!months.has(month)) month = previousMonth(month)
    while (months.has(month)) {
      current += 1
      month = previousMonth(month)
    }
  }
  return { current, ...(longest ? { longest } : {}) }
}

/**
 * The figures of a library: of all time, or, with `scope`, of the games
 * finished in that year. `finished` is the library's finished games, in the
 * order the wall stands them; `today` makes the current streak.
 */
export const statsOf = (
  library: Library,
  finished: readonly LibraryGame[],
  year: number,
  { scope, today, by: asked }: { scope?: number; today?: Day; by?: Measure } = {},
): TrophyStats => {
  const all = scope === undefined
  // The games of one year began whenever they did, so a year's share finished says nothing.
  const by: Measure = asked === undefined || (asked === 'share' && !all) ? 'finished' : asked
  const shown = all
    ? finished
    : finished.filter((game) => game.completedOn?.startsWith(`${scope}-`))
  const started = library.games.filter((game) => STARTED.has(game.status))
  const ratings = (all ? library.games : shown).flatMap((game) =>
    game.rating === undefined ? [] : [game.rating],
  )

  const longest = most(
    shown.filter((game) => game.minutes > 0),
    (game) => game.minutes,
    later,
  )

  const byPlatform = new Map<number, number>()
  for (const game of all ? library.games : shown) {
    const main = game.copies[0]
    if (main && game.minutes > 0) {
      byPlatform.set(main.platform, (byPlatform.get(main.platform) ?? 0) + game.minutes)
    }
  }
  let platform: TrophyStats['platform']
  for (const [id, minutes] of byPlatform) {
    const named = library.names.platform.find((each) => each.id === id)
    if (named && minutes > (platform?.minutes ?? 0)) {
      platform = { id, name: named.name, minutes }
    }
  }

  // Years and months count every dated finish, so a year's page still shows it among the rest.
  const dated = finished.filter((game) => game.completedOn !== undefined)
  const firstYear = Math.min(...dated.map((game) => Number(game.completedOn!.slice(0, 4))))
  const perYear: TrophyStats['perYear'] = []
  if (dated.length > 0) {
    for (let at = Math.min(firstYear, year); at <= Math.max(year, firstYear); at += 1) {
      perYear.push({
        year: at,
        finished: dated.filter((game) => game.completedOn!.startsWith(`${at}-`)).length,
      })
    }
  }
  const perMonth = perYear
    .filter((each) => all || each.year === scope)
    .map(({ year: at }) => ({
      year: at,
      months: Array.from(
        { length: 12 },
        (_, month) =>
          dated.filter((game) =>
            game.completedOn!.startsWith(`${at}-${String(month + 1).padStart(2, '0')}`),
          ).length,
      ),
    }))
    .reverse()

  const minutes = shown.flatMap((game) => (game.minutes > 0 ? [game.minutes] : []))
  const quickest =
    minutes.length > 1
      ? most(
          shown.filter((game) => game.minutes > 0),
          (game) => -game.minutes,
          later,
        )
      : undefined
  const mostPlayed = all
    ? most(
        library.games.filter((game) => game.minutes > 0),
        (game) => game.minutes,
        (a, b) => a.title.localeCompare(b.title),
      )
    : undefined
  const bestRated = most(
    shown.filter((game) => game.rating !== undefined),
    (game) => game.rating!,
    later,
  )
  const oldest = most(
    shown.filter((game) => game.year !== undefined),
    (game) => -game.year!,
    (a, b) => a.title.localeCompare(b.title),
  )
  const first = most(
    shown.filter((game) => game.completedOn !== undefined),
    (game) => -Number(game.completedOn!.replaceAll('-', '')),
    (a, b) => a.title.localeCompare(b.title),
  )
  const months = perMonth.flatMap(({ year: at, months: counts }) =>
    counts.map((count, month) => ({
      month: `${at}-${String(month + 1).padStart(2, '0')}`,
      finished: count,
    })),
  )
  const bestMonth = most(
    months,
    (each) => each.finished,
    (a, b) => (a.month > b.month ? -1 : 1),
  )
  const bestYear = all
    ? most(
        perYear,
        (each) => each.finished,
        (a, b) => b.year - a.year,
      )
    : undefined

  const names = <T extends Pick<Named, 'id' | 'name' | 'slug'>>(list: readonly T[]) =>
    new Map(list.map((each) => [each.id, each]))
  const platforms = new Map(
    library.names.platform.map((each) => [each.id, { name: each.name, slug: each.key }]),
  )
  const begun = all ? started : undefined
  const genreNames = names(library.names.genre)
  const companies = names(library.names.company)
  const rated = ratingsOf(all ? library.games : shown)
  const timeline = all
    ? timelineOf(library, dated, bestYear && bestYear.finished > 0 ? bestYear.year : undefined)
    : []

  const backlog = all ? backlogOf(library, today) : undefined

  // The sentences, most telling first: of time, of taste, then of play.
  const insights: Insight[] = all ? timeInsights(perYear, dated, year, today) : []
  const favorite = rank(shown, begun, (game) => game.genres, genreNames)[0]
  const leading = timeline.find((each) => each.year === year)?.genre
  if (favorite && leading && leading.name !== favorite.name) {
    insights.push({
      kind: 'shift',
      year,
      genre: { name: leading.name, slug: leading.slug },
      favorite: favorite.name,
    })
  }
  const finisher = rank(shown, begun, (game) => game.genres, genreNames, 'share')[0]
  const overall = all && started.length > 0 ? finished.length / started.length : undefined
  if (finisher?.share !== undefined && overall !== undefined && finisher.share - overall >= 0.1) {
    insights.push({ kind: 'finisher', genre: finisher, share: finisher.share, overall })
  }
  const maker = rank(shown, begun, (game) => game.developers, companies, 'rating')[0]
  if (maker?.rating !== undefined) {
    insights.push({ kind: 'maker', developer: maker, rating: maker.rating })
  }
  const versus = rated?.versus
  if (versus && versus.games.length >= 10 && Math.abs(versus.gap) >= 3) {
    insights.push({ kind: 'versus', gap: versus.gap, games: versus.games.length })
  }
  insights.push(...playInsights(shown))

  return {
    finished: shown.length,
    thisYear: shown.filter((game) => game.completedOn?.startsWith(`${year}-`)).length,
    year,
    ...(all ? {} : { scope }),
    hours: all
      ? libraryStats(library.games).hours
      : Math.floor(shown.reduce((sum, game) => sum + game.minutes, 0) / 60),
    averageRating:
      ratings.length > 0
        ? ratings.reduce((sum, each) => sum + each, 0) / ratings.length
        : undefined,
    finishedShare: all && started.length > 0 ? finished.length / started.length : undefined,
    started: started.length,
    dropped: library.games.filter((game) => game.status === 'dropped').length,
    medianMinutes: median(minutes),
    longest: longest ? { ...gameOf(longest), minutes: longest.minutes } : undefined,
    platform,
    perYear,
    perMonth,
    streak: streaksOf(new Set(dated.map((game) => monthOf(game.completedOn!))), today),
    by,
    genres: rank(shown, begun, (game) => game.genres, genreNames, by),
    themes: rank(shown, begun, (game) => game.themes, names(library.names.theme), by),
    // Every platform a game is owned on, as `owned:` matches it, so a link finds the same games.
    platforms: rank(
      shown,
      begun,
      (game) => game.copies.map((copy) => copy.platform),
      platforms,
      by,
    ),
    modes: rank(shown, begun, (game) => game.modes, names(library.names.mode), by, RANKED_MORE),
    perspectives: rank(
      shown,
      begun,
      (game) => game.perspectives,
      names(library.names.perspective),
      by,
      RANKED_MORE,
    ),
    developers: rank(shown, begun, (game) => game.developers, companies, by, RANKED_MORE),
    publishers: rank(shown, begun, (game) => game.publishers, companies, by, RANKED_MORE),
    decades: decadesOf(shown),
    ...(rated ? { ratings: rated } : {}),
    series: all ? seriesOf(library) : { shown: [], complete: 0 },
    timeline,
    insights: insights.slice(0, INSIGHTS_SHOWN),
    ...(all && backlog ? { backlog } : {}),
    records: {
      ...(first ? { first: { ...gameOf(first), on: first.completedOn! } } : {}),
      ...(quickest && quickest !== longest
        ? { quickest: { ...gameOf(quickest), minutes: quickest.minutes } }
        : {}),
      ...(mostPlayed && mostPlayed.slug !== longest?.slug
        ? { mostPlayed: { ...gameOf(mostPlayed), minutes: mostPlayed.minutes } }
        : {}),
      ...(bestRated ? { bestRated: { ...gameOf(bestRated), rating: bestRated.rating! } } : {}),
      ...(oldest ? { oldest: { ...gameOf(oldest), year: oldest.year! } } : {}),
      ...(bestYear && bestYear.finished > 0 ? { bestYear } : {}),
      ...(bestMonth && bestMonth.finished > 1 ? { bestMonth } : {}),
    },
  }
}
