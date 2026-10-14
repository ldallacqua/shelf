import type { RowWindow } from './use-row-window'

/**
 * Which of a shelf's boxes are in the page, and what keeps the place of the
 * ones that are not. Plain arithmetic, apart from the component that draws it.
 */

/** A run of boxes in the page, by position on the shelf: from `from` up to, not including, `to`. */
export type Run = { from: number; to: number; boards: boolean }

/**
 * Which boxes are in the page.
 *
 * Measured: the rows near the screen, and the one box Tab stops at wherever
 * it is, so focus can always land on it. That box stands alone when its row
 * is away from the screen: with a dozen shelves, a whole row for each is a
 * hundred boxes nobody is looking at.
 *
 * A shelf that is away sideways has no boxes at all. It cannot be reached
 * without passing the shelf next to it, and by then it is no longer away.
 *
 * The shelf next to the one in view, before anyone has touched the page,
 * keeps only the box Tab stops at: Tab, Page Down and a screen reader can
 * still land on it, and the touch that starts a swipe fills it.
 *
 * Not yet measured: the first `unmeasured` boxes. A shelf with no share of
 * the first screen draws none, and is measured a frame later.
 */
export const runsOf = (
  rowWindow: RowWindow | undefined,
  count: number,
  unmeasured: number,
  tabStop: number,
): Run[] => {
  if (count === 0) return []
  if (!rowWindow) {
    const to = Math.min(count, Math.max(0, unmeasured))
    return to > 0 ? [{ from: 0, to, boards: true }] : []
  }
  if (rowWindow.away) return []
  if (rowWindow.waiting)
    return tabStop < count ? [{ from: tabStop, to: tabStop + 1, boards: false }] : []
  const { columns, start, end } = rowWindow
  const from = Math.min(count, start * columns)
  const to = Math.min(count, end * columns)
  const near: Run[] = to > from ? [{ from, to, boards: true }] : []
  if (tabStop >= from && tabStop < to) return near
  const alone: Run = { from: tabStop, to: tabStop + 1, boards: false }
  return tabStop < from ? [alone, ...near] : [...near, alone]
}

/** What stands in each place on the shelf, in order: a box, or room kept for boxes left out. */
export type Piece =
  | { kind: 'box'; index: number; stagger: number }
  /** Whole rows left out. */
  | { kind: 'rows'; at: number; rows: number }
  /** Part of a row left out, beside a box that stands alone. */
  | { kind: 'places'; at: number; places: number }

/**
 * Boxes are placed one after another, so whatever is left out between two
 * runs is stood in for: whole rows by one tall gap, part of a row by a spacer
 * as wide as the boxes it replaces.
 */
export const piecesOf = (runs: readonly Run[], perRow: number, rows: number): Piece[] => {
  const pieces: Piece[] = []
  /** The next free place on the shelf, counted in boxes. */
  let place = 0
  for (const run of runs) {
    // The rest of a row that a lone box started.
    if (place % perRow > 0 && run.from > place) {
      const rest = Math.min(run.from - place, perRow - (place % perRow))
      pieces.push({ kind: 'places', at: place, places: rest })
      place += rest
    }
    const wholeRows = Math.floor(run.from / perRow) - Math.floor(place / perRow)
    if (wholeRows > 0) {
      pieces.push({ kind: 'rows', at: place, rows: wholeRows })
      place += wholeRows * perRow
    }
    if (run.from > place) {
      pieces.push({ kind: 'places', at: place, places: run.from - place })
    }
    for (let index = run.from; index < run.to; index += 1) {
      pieces.push({ kind: 'box', index, stagger: index - run.from })
    }
    place = run.to
  }
  // A gap is as wide as the shelf, so it starts on a row of its own.
  const after = rows - Math.ceil(place / perRow)
  if (after > 0) pieces.push({ kind: 'rows', at: place, rows: after })
  return pieces
}

/** The rows that get a lit board: those of every run but a box standing alone. */
export const boardsOf = (runs: readonly Run[], perRow: number): number[] =>
  runs.flatMap((run) => {
    if (!run.boards) return []
    const first = Math.floor(run.from / perRow)
    return Array.from({ length: Math.ceil(run.to / perRow) - first }, (_, at) => first + at)
  })
