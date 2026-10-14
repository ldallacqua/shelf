import { describe, expect, it } from 'vitest'

import { caseShapes, type CaseShape } from '@/ui/game-case'

import {
  BACK_GAP,
  BAY_GAP,
  BAY_WIDTH,
  boxAt,
  boxIndexOf,
  caseDepths,
  COVER_ONLY_DEPTH,
  FLOOR,
  layoutRoom,
  LEDGES_PER_BAY,
  type LayoutBox,
} from './layout'

const boxes = (count: number, shape: CaseShape = 'bluRay'): LayoutBox[] =>
  Array.from({ length: count }, () => ({ shape, coverOnly: false }))

describe('the room', () => {
  it('stands boxes left to right on the top ledge first', () => {
    const room = layoutRoom([boxes(3)], 'covers')
    const [a, b, c] = room.boxes
    expect(a!.ledge).toBe(0)
    expect(a!.x).toBeLessThan(b!.x)
    expect(b!.x).toBeLessThan(c!.x)
    // The top ledge of the bay is the highest one.
    expect(a!.y).toBe(FLOOR + (LEDGES_PER_BAY - 1) * room.pitches[0]!)
  })

  it('wraps onto the ledge below when a ledge is full, then into the next bay', () => {
    const width = caseShapes.bluRay.width
    const perLedge = Math.floor((BAY_WIDTH + 16) / (width + 16))
    const room = layoutRoom([boxes(perLedge * LEDGES_PER_BAY + 1)], 'covers')

    const second = room.boxes[perLedge]!
    expect(second.ledge).toBe(1)
    expect(second.y).toBeLessThan(room.boxes[0]!.y)

    const overflow = room.boxes.at(-1)!
    expect(room.ledges[overflow.ledge]!.bay).toBe(1)
    expect(overflow.x).toBeGreaterThan(BAY_WIDTH + BAY_GAP)
    expect(room.shelves[0]!.bays).toBe(2)
  })

  it('keeps every box inside its bay', () => {
    const room = layoutRoom([boxes(57, 'jewel'), boxes(12, 'boxWide')], 'covers')
    for (const box of room.boxes) {
      const ledge = room.ledges[box.ledge]!
      expect(box.x - box.width / 2).toBeGreaterThanOrEqual(ledge.x0)
      expect(box.x + box.width / 2).toBeLessThanOrEqual(ledge.x1)
    }
  })

  it('puts each shelf in its own bays, in order, with a gap between', () => {
    const room = layoutRoom([boxes(4), boxes(4), boxes(4)], 'covers')
    const [first, second, third] = room.shelves
    expect(second!.x0).toBe(first!.x1 + BAY_GAP)
    expect(third!.x0).toBe(second!.x1 + BAY_GAP)
    expect(room.x1).toBe(third!.x1)
  })

  it('makes a shelf of small cases lower than a shelf of tall ones', () => {
    const room = layoutRoom([boxes(2, 'keepCase'), boxes(2, 'ds')], 'covers')
    expect(room.pitches[1]).toBeLessThan(room.pitches[0]!)
  })

  it('gives a box its real size, and a download almost none from front to back', () => {
    const room = layoutRoom(
      [
        [
          { shape: 'switch', coverOnly: false },
          { shape: 'switch', coverOnly: true },
        ],
      ],
      'covers',
    )
    const [boxed, download] = room.boxes
    expect(boxed).toMatchObject({ width: 105, height: 170, depth: caseDepths.switch })
    expect(download).toMatchObject({ width: 100, height: 151, depth: COVER_ONLY_DEPTH })
    // Both stand with their backs the same distance from the wall.
    expect(boxed!.z - boxed!.depth / 2).toBe(BACK_GAP)
    expect(download!.z - download!.depth / 2).toBe(BACK_GAP)
  })

  it('turns boxes a quarter spine-out, so many more fit on a ledge', () => {
    const covers = layoutRoom([boxes(40)], 'covers')
    const compact = layoutRoom([boxes(40)], 'compact')
    expect(compact.boxes[0]).toMatchObject({
      width: caseDepths.bluRay,
      depth: caseShapes.bluRay.width,
    })
    expect(compact.ledges.length).toBeLessThan(covers.ledges.length)
  })

  it('still has a bay for a shelf with no boxes', () => {
    const room = layoutRoom([[]], 'covers')
    expect(room.shelves[0]).toMatchObject({ bays: 1, from: 0, to: 0 })
    expect(room.ledges).toHaveLength(1)
  })

  it('lays out 1,000 games in a few milliseconds', () => {
    const shelves = Array.from({ length: 12 }, (_, at) => boxes(84, at % 2 ? 'switch' : 'bluRay'))
    const started = performance.now()
    const room = layoutRoom(shelves, 'covers')
    expect(room.boxes).toHaveLength(1008)
    expect(performance.now() - started).toBeLessThan(50)
  })
})

describe('picking by arithmetic', () => {
  const room = layoutRoom([boxes(30), boxes(5, 'ds')], 'covers')

  it('finds the box under a point on the wall', () => {
    for (const [at, box] of room.boxes.entries()) {
      expect(boxAt(room, box.x, box.y + box.height / 2)).toBe(at)
    }
  })

  it('finds nothing between boxes, above them, or off the wall', () => {
    const [a, b] = room.boxes
    expect(boxAt(room, (a!.x + a!.width / 2 + b!.x - b!.width / 2) / 2, a!.y + 10)).toBeUndefined()
    expect(boxAt(room, a!.x, a!.y + a!.height + 20)).toBeUndefined()
    expect(boxAt(room, -500, a!.y + 10)).toBeUndefined()
    expect(boxAt(room, a!.x, 0)).toBeUndefined()
  })

  it('names a box by its shelf and its place on it', () => {
    expect(boxIndexOf(room, 1, 0)).toBe(30)
    expect(boxIndexOf(room, 1, 4)).toBe(34)
    expect(boxIndexOf(room, 1, 5)).toBeUndefined()
    expect(boxIndexOf(room, 2, 0)).toBeUndefined()
  })
})
