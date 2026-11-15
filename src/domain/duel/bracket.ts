/**
 * The duel (spec 3.14): my games, two at a time, until one is left to play next. A
 * single-elimination bracket, as tournaments and bracket makers run one: each duel sends one game
 * on, and every game but the last loses once, so N games take N − 1 duels. Comparing two things
 * is the easiest choice there is; holding sixteen in the head at once is not.
 *
 * A bracket holds a power of two. Where fewer games are in it, some go straight to the second
 * round (a bye), spread through the first round so no corner of the bracket is all byes.
 */

/** Fewer than two is no choice; past sixteen, fifteen duels already take a few minutes. */
export const MIN_CONTENDERS = 2
export const MAX_CONTENDERS = 16

/** How many games a draw puts in at once: the sizes a bracket fills with no bye. */
export const DRAW_SIZES = [4, 8, 16] as const
export type DrawSize = (typeof DRAW_SIZES)[number]

/** A duel as it is kept: the games in their places, and who went on from each duel played. */
export type Duel = {
  /** The games in it, by address, in their places in the first round. */
  contenders: readonly string[]
  /** The game that went on from each duel, in the order the duels were played. */
  picks: readonly string[]
}

/** One place in a round: two games, one game with a bye, or games still to be decided. */
export type Match = {
  /** The first side: a game, or undefined while an earlier duel decides it. */
  a?: string
  /** The second side: a game, undefined while an earlier duel decides it or when `bye`. */
  b?: string
  /** The game that went on. */
  winner?: string
  /** `a` had nobody to meet, and went on without a duel. */
  bye: boolean
}

/** What a round is called, by how many duels it holds when full. */
export const roundNames = ['final', 'semifinal', 'quarterfinal', 'roundOf16'] as const
export type RoundName = (typeof roundNames)[number]

export type Round = { name: RoundName; matches: Match[] }

/** The duel to play now. */
export type Current = {
  round: number
  match: number
  a: string
  b: string
  /** Its place among the round's duels (byes not counted), from 1, and how many there are. */
  inRound: number
  ofRound: number
}

export type Standing = {
  rounds: Round[]
  /** The duel to play now; none once a game is left. */
  current?: Current
  /** Duels played, and how many the whole bracket takes. */
  played: number
  total: number
  /** The game left, once every duel is played. */
  champion?: string
  /** The game it beat in the final. */
  runnerUp?: string
}

/** The smallest power of two that holds this many games. */
const bracketSize = (count: number): number => 2 ** Math.ceil(Math.log2(Math.max(2, count)))

const nameOf = (duels: number): RoundName =>
  roundNames[Math.min(roundNames.length - 1, Math.log2(duels))] ?? 'roundOf16'

/**
 * Which first-round places get a bye: spread evenly through the round (`byes` of `places`), as a
 * line drawn across a grid, so the byes never bunch in one half of the bracket.
 */
const isByePlace = (place: number, byes: number, places: number): boolean =>
  Math.floor(((place + 1) * byes) / places) - Math.floor((place * byes) / places) === 1

/** The bracket's first round, with the games in their places and the byes spread through it. */
const firstRound = (contenders: readonly string[]): Match[] => {
  const places = bracketSize(contenders.length) / 2
  const byes = places * 2 - contenders.length
  const queue = [...contenders]
  return Array.from({ length: places }, (_, place) => {
    if (isByePlace(place, byes, places)) {
      const a = queue.shift()
      return { a, winner: a, bye: true }
    }
    return { a: queue.shift(), b: queue.shift(), bye: false }
  })
}

/**
 * The bracket with the duels played so far: who met whom, who went on, and the duel to play now.
 * Duels are played round by round, in order, so both sides of a duel are known when it comes. A
 * pick that is neither side of its duel ends the replay there: what was kept no longer fits.
 */
export function standingOf(duel: Duel): Standing {
  const { contenders, picks } = duel
  const total = Math.max(0, contenders.length - 1)
  if (contenders.length < MIN_CONTENDERS) return { rounds: [], played: 0, total }

  const rounds: Round[] = []
  let matches = firstRound(contenders)
  let played = 0
  let current: Current | undefined

  while (matches.length > 0) {
    const duels = matches.filter((match) => !match.bye).length
    let inRound = 0
    for (const [index, match] of matches.entries()) {
      if (match.bye || match.a === undefined || match.b === undefined) continue
      inRound += 1
      const pick = picks[played]
      if (current === undefined && (pick === match.a || pick === match.b)) {
        match.winner = pick
        played += 1
      } else if (current === undefined) {
        current = {
          round: rounds.length,
          match: index,
          a: match.a,
          b: match.b,
          inRound,
          ofRound: duels,
        }
      }
    }
    rounds.push({ name: nameOf(matches.length), matches })
    if (matches.length === 1) break
    matches = Array.from({ length: matches.length / 2 }, (_, place) => ({
      a: matches[place * 2]?.winner,
      b: matches[place * 2 + 1]?.winner,
      bye: false,
    }))
  }

  const final = rounds.at(-1)?.matches[0]
  const champion = current === undefined ? final?.winner : undefined
  const runnerUp = champion === undefined ? undefined : champion === final?.a ? final?.b : final?.a
  return {
    rounds,
    played,
    total,
    ...(current ? { current } : {}),
    ...(champion ? { champion } : {}),
    ...(runnerUp ? { runnerUp } : {}),
  }
}

/** The duel with this game sent on from the duel being played; unchanged if it isn't in it. */
export function pick(duel: Duel, slug: string): Duel {
  const { current } = standingOf(duel)
  if (!current || (slug !== current.a && slug !== current.b)) return duel
  return { ...duel, picks: [...duel.picks, slug] }
}

/** The duel as it was before the last pick. */
export const undo = (duel: Duel): Duel => ({ ...duel, picks: duel.picks.slice(0, -1) })

/** The games in a new order, at random: the places in the bracket are a draw, not a ranking. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[result[index], result[other]] = [result[other] as T, result[index] as T]
  }
  return result
}

/** A new duel between these games, in places drawn at random. */
export const startDuel = (slugs: readonly string[], random: () => number = Math.random): Duel => ({
  contenders: shuffled(slugs, random).slice(0, MAX_CONTENDERS),
  picks: [],
})

/** The games each game beat on its way, by address, in the order it beat them. */
export function beatenBy(standing: Standing, slug: string): string[] {
  return standing.rounds.flatMap(({ matches }) =>
    matches.flatMap((match) =>
      match.winner === slug && !match.bye && match.a !== undefined && match.b !== undefined
        ? [match.a === slug ? match.b : match.a]
        : [],
    ),
  )
}
