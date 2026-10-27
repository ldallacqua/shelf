/**
 * Age ratings (spec 5.1): what each board that rates games said of one, as
 * IGDB records it. A filter word is the board and its rating, `esrb-m`,
 * `pegi-18`, `classind-l`; the list is closed, so the library file carries
 * positions in it, and a word not in it is a mistake the filter points out.
 *
 * IGDB's boards and their ratings, read from the live API on 25 and 27 Oct 2026. A rating
 * IGDB adds later is left out until it is added here.
 */

type Board = {
  /** IGDB's `age_rating_organizations` id. */
  igdb: number
  word: string
  name: string
  /** IGDB's rating, then how a label spells it when not as IGDB does. Youngest first. */
  ratings: readonly (readonly [igdb: string, spelled?: string])[]
}

const boards: readonly Board[] = [
  {
    igdb: 1,
    word: 'esrb',
    name: 'ESRB',
    ratings: [
      ['EC', 'Early Childhood'],
      ['E', 'Everyone'],
      ['E10+', 'Everyone 10+'],
      ['T', 'Teen'],
      ['M', 'Mature 17+'],
      ['AO', 'Adults Only 18+'],
      ['RP', 'Rating Pending'],
    ],
  },
  { igdb: 2, word: 'pegi', name: 'PEGI', ratings: [['3'], ['7'], ['12'], ['16'], ['18']] },
  { igdb: 3, word: 'cero', name: 'CERO', ratings: [['A'], ['B'], ['C'], ['D'], ['Z']] },
  { igdb: 4, word: 'usk', name: 'USK', ratings: [['0'], ['6'], ['12'], ['16'], ['18']] },
  {
    igdb: 5,
    word: 'grac',
    name: 'GRAC',
    ratings: [['ALL', 'All'], ['12+'], ['15+'], ['18+'], ['19+']],
  },
  {
    igdb: 6,
    word: 'classind',
    name: 'ClassInd',
    ratings: [['L'], ['10'], ['12'], ['14'], ['16'], ['18']],
  },
  {
    igdb: 7,
    word: 'acb',
    name: 'ACB',
    ratings: [['G'], ['PG'], ['M'], ['MA 15+'], ['R 18+'], ['RC']],
  },
]

/** IGDB's rating as a word's second half: lower case, nothing but letters and digits. */
const wordOf = (board: Board, rating: string) =>
  `${board.word}-${rating.toLowerCase().replace(/[^a-z0-9]/g, '')}`

/** Every age rating, board by board, youngest first: the words, and the labels the panel shows. */
const all = boards.flatMap((board) =>
  board.ratings.map(([igdb, spelled]) => ({
    board,
    igdb,
    word: wordOf(board, igdb),
    label: `${board.name} ${spelled ?? igdb}`,
  })),
)

export const ageWords: readonly string[] = all.map((rating) => rating.word)

const byIgdb = new Map(all.map((rating) => [`${rating.board.igdb}:${rating.igdb}`, rating.word]))
const labels = new Map(all.map((rating) => [rating.word, rating.label]))

/** The ESRB's Adults Only (spec 3.13). */
export const ADULTS_ONLY = 'esrb-ao'

/** A game's age ratings as words, in the list's order, from IGDB's `age_ratings`. */
export const ageWordsOf = (
  ratings: readonly { organization?: number; rating_category?: { rating?: string } }[],
): string[] => {
  const words = new Set(
    ratings.flatMap((rating) => {
      const word = byIgdb.get(`${rating.organization}:${rating.rating_category?.rating}`)
      return word ? [word] : []
    }),
  )
  return ageWords.filter((word) => words.has(word))
}

/** How the panel and the chips name a rating: the board, then its rating, "PEGI 18". */
export const ageLabel = (word: string): string => labels.get(word) ?? word
