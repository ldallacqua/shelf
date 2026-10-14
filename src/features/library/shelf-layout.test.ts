import { describe, expect, it } from 'vitest'

import { boardsOf, piecesOf, runsOf } from './shelf-layout'
import type { RowWindow } from './use-row-window'

const measured = (columns: number, count: number, start: number, end: number): RowWindow => ({
  columns,
  pitch: 200,
  rows: Math.ceil(count / columns),
  start,
  end,
  away: false,
})

/** A compact picture of a shelf: `#` a box, `.` a place kept in a row, `=` a whole row kept. */
const draw = (pieces: ReturnType<typeof piecesOf>): string =>
  pieces
    .map((piece) =>
      piece.kind === 'box'
        ? '#'
        : piece.kind === 'rows'
          ? '='.repeat(piece.rows)
          : '.'.repeat(piece.places),
    )
    .join('')

describe('which boxes are in the page', () => {
  it('draws its share of the first screen before it is measured', () => {
    expect(runsOf(undefined, 60, 48, 0)).toEqual([{ from: 0, to: 48, boards: true }])
    expect(runsOf(undefined, 5, 48, 0)).toEqual([{ from: 0, to: 5, boards: true }])
  })

  it('draws nothing when it has no share: it is measured a frame later', () => {
    expect(runsOf(undefined, 60, 0, 0)).toEqual([])
  })

  it('draws nothing for a shelf with nothing on it', () => {
    expect(runsOf(undefined, 0, 48, 0)).toEqual([])
    expect(runsOf(measured(4, 0, 0, 0), 0, 48, 0)).toEqual([])
  })

  it('draws the rows near the screen once it is measured', () => {
    expect(runsOf(measured(4, 40, 2, 5), 40, 48, 9)).toEqual([{ from: 8, to: 20, boards: true }])
  })

  it('stops at the last box when the last row is short', () => {
    expect(runsOf(measured(4, 10, 0, 3), 10, 48, 0)).toEqual([{ from: 0, to: 10, boards: true }])
  })

  it('keeps the box Tab stops at, alone, when its row is away from the screen', () => {
    expect(runsOf(measured(4, 40, 4, 7), 40, 48, 0)).toEqual([
      { from: 0, to: 1, boards: false },
      { from: 16, to: 28, boards: true },
    ])
    expect(runsOf(measured(4, 40, 0, 2), 40, 48, 30)).toEqual([
      { from: 0, to: 8, boards: true },
      { from: 30, to: 31, boards: false },
    ])
  })

  it('keeps only that box when no row is near the screen', () => {
    expect(runsOf(measured(4, 40, 0, 0), 40, 48, 0)).toEqual([{ from: 0, to: 1, boards: false }])
  })

  it('keeps no box for a shelf that is away sideways, and still keeps its height', () => {
    const away = { ...measured(4, 40, 0, 0), away: true }
    expect(runsOf(away, 40, 48, 0)).toEqual([])
    expect(draw(piecesOf([], 4, 10))).toBe('==========')
    expect(boardsOf([], 4)).toEqual([])
  })
})

describe('what keeps the place of boxes that are not in the page', () => {
  it('needs nothing when every box is drawn', () => {
    const runs = runsOf(measured(4, 10, 0, 3), 10, 48, 0)
    expect(draw(piecesOf(runs, 4, 3))).toBe('##########')
  })

  it('stands one tall gap in for the rows above and below', () => {
    const runs = runsOf(measured(4, 40, 2, 5), 40, 48, 9)
    expect(draw(piecesOf(runs, 4, 10))).toBe('==' + '#'.repeat(12) + '=====')
  })

  it('finishes the row of a box that stands alone above the screen', () => {
    // Tab stops at the second box; rows 4 to 6 are near the screen.
    const runs = runsOf(measured(4, 40, 4, 7), 40, 48, 1)
    expect(draw(piecesOf(runs, 4, 10))).toBe('.#..' + '===' + '#'.repeat(12) + '===')
  })

  it('leads up to a box that stands alone below the screen', () => {
    // Tab stops at box 30: row 7, third place.
    const runs = runsOf(measured(4, 40, 0, 2), 40, 48, 30)
    expect(draw(piecesOf(runs, 4, 10))).toBe('#'.repeat(8) + '=====' + '..#' + '==')
  })

  it('keeps every row for a shelf whose only box is the one Tab stops at', () => {
    const runs = runsOf(measured(4, 40, 0, 0), 40, 48, 0)
    expect(draw(piecesOf(runs, 4, 10))).toBe('#' + '=========')
  })

  it('never keeps more or fewer places than the shelf has', () => {
    const count = 37
    const columns = 5
    const rows = Math.ceil(count / columns)
    for (let start = 0; start <= rows; start += 1) {
      for (let end = start; end <= rows; end += 1) {
        for (let tabStop = 0; tabStop < count; tabStop += 1) {
          const runs = runsOf(measured(columns, count, start, end), count, 48, tabStop)
          // Walk the pieces the way the grid places them and count the rows used.
          let place = 0
          for (const piece of piecesOf(runs, columns, rows)) {
            if (piece.kind === 'box') {
              expect(piece.index).toBe(place)
              place += 1
            } else if (piece.kind === 'places') {
              place += piece.places
            } else {
              // A gap is as wide as the shelf: it starts on a new row.
              place = (Math.ceil(place / columns) + piece.rows) * columns
            }
          }
          expect(Math.ceil(place / columns)).toBe(rows)
        }
      }
    }
  })

  it('gives each box its turn in the arrival stagger, counted from the start of its run', () => {
    const runs = runsOf(measured(4, 40, 2, 3), 40, 48, 8)
    const boxes = piecesOf(runs, 4, 10).filter((piece) => piece.kind === 'box')
    expect(boxes.map((piece) => piece.stagger)).toEqual([0, 1, 2, 3])
  })
})

describe('which rows get a lit board', () => {
  it('lights the rows near the screen', () => {
    const runs = runsOf(measured(4, 40, 2, 5), 40, 48, 9)
    expect(boardsOf(runs, 4)).toEqual([2, 3, 4])
  })

  it('lights the short last row too', () => {
    const runs = runsOf(measured(4, 10, 0, 3), 10, 48, 0)
    expect(boardsOf(runs, 4)).toEqual([0, 1, 2])
  })

  it('does not light the row of a box that stands alone', () => {
    const runs = runsOf(measured(4, 40, 4, 6), 40, 48, 0)
    expect(boardsOf(runs, 4)).toEqual([4, 5])
  })

  it('lights enough boards for the narrowest shelf before it is measured', () => {
    expect(boardsOf(runsOf(undefined, 60, 7, 0), 3)).toEqual([0, 1, 2])
  })
})
