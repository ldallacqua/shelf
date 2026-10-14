import type { CaseShape } from '@/ui/game-case'
import { caseShapes } from '@/ui/game-case'

/**
 * Where everything stands in the 3D room, in millimeters.
 *
 * The room is a display wall seen from the front: x runs left to right along
 * the wall, y up from the floor, z out of the wall toward the visitor. Each
 * shelf is a bay of ledges. A shelf fills its ledges from the top, left to
 * right, as the 2D shelf fills its rows, and carries on into another bay to
 * the right when its ledges are full. Bays run left to right in shelf order,
 * so walking along the wall reads the library in order.
 *
 * Pure arithmetic: no three.js, so it is tested on its own and picking can
 * search it without touching the scene.
 */

/** How a box stands: cover toward you, or spine toward you (the compact option). */
export type Standing = 'covers' | 'compact'

/** How thick each kind of case is, front to back. Measured where it could be; the cardboard ones are estimates. */
export const caseDepths: Record<CaseShape, number> = {
  bluRay: 14,
  keepCase: 14,
  switch: 10,
  jewel: 10,
  ds: 14,
  vita: 12,
  psp: 14,
  boxTall: 40,
  boxWide: 30,
  boxSmall: 25,
}

/** A download has no case: only the cover, standing like a card. */
export const COVER_ONLY_DEPTH = 3

/** The inside width of a bay. About eight Blu-ray cases cover-out. */
export const BAY_WIDTH = 1250
/** Between one bay and the next: the uprights. */
export const BAY_GAP = 240
/** Three, so a whole bay fits the window with cases at about the size the 2D shelf draws them. */
export const LEDGES_PER_BAY = 3
/** How far a ledge stands out from the wall, and how thick it is. */
export const LEDGE_DEPTH = 170
export const LEDGE_THICKNESS = 22
/** Room above the tallest case on a ledge, to the underside of the ledge above. */
export const HEADROOM = 64
/** The lowest ledge's top, above the floor. */
export const FLOOR = 400
/** Gap from the wall to the back of a box. The LED bar sits in it. */
export const BACK_GAP = 24
/** Space between boxes standing cover-out, and spine-out. */
const GAP = { covers: 16, compact: 3 } as const

/** One box as the layout needs to know it. */
export type LayoutBox = {
  shape: CaseShape
  /** A download: a cover with no case. */
  coverOnly: boolean
}

export type PlacedBox = {
  /** Which shelf, and which box on it, by position. */
  shelf: number
  index: number
  ledge: number
  shape: CaseShape
  /** Center of the box along the wall, its bottom, and the middle of its depth. */
  x: number
  y: number
  z: number
  /** Size as it stands: across, up, and front to back. Spine-out swaps across and front to back. */
  width: number
  height: number
  depth: number
}

export type PlacedLedge = {
  shelf: number
  bay: number
  /** Along the wall, and the height of its top surface. */
  x0: number
  x1: number
  y: number
  /** The boxes on it, as a range of indices into `boxes`, in order left to right. */
  from: number
  to: number
}

export type PlacedShelf = {
  /** Its bays' outer edges along the wall. */
  x0: number
  x1: number
  /** How many bays it spans. */
  bays: number
  /** Its boxes, as a range of indices into `boxes`. */
  from: number
  to: number
  /** Where its label sits: above its top ledge, at the left of its first bay. */
  labelX: number
  labelY: number
}

export type RoomLayout = {
  boxes: PlacedBox[]
  ledges: PlacedLedge[]
  shelves: PlacedShelf[]
  /** The whole wall's extent along x, and the height of the top of the highest bay. */
  x0: number
  x1: number
  top: number
  /** Distance between one ledge's top and the next. The same in every bay of a shelf, not across shelves. */
  pitches: number[]
}

/** A download stands as its cover would inside the case: a little smaller than the case. */
export const COVER_ONLY_SCALE = { width: 0.95, height: 0.89 }

const footprint = (box: LayoutBox, standing: Standing) => {
  const shape = caseShapes[box.shape]
  const width = box.coverOnly ? Math.round(shape.width * COVER_ONLY_SCALE.width) : shape.width
  const height = box.coverOnly ? Math.round(shape.height * COVER_ONLY_SCALE.height) : shape.height
  const depth = box.coverOnly ? COVER_ONLY_DEPTH : caseDepths[box.shape]
  return standing === 'covers'
    ? { width, height, depth }
    : // Spine-out: the box is turned a quarter, so its thickness runs along the wall.
      { width: depth, height, depth: width }
}

/**
 * Lays out the shelves along the wall.
 *
 * `shelves` holds, per shelf, its boxes in order. Every ledge of a shelf is
 * as tall as that shelf's tallest case needs, so a shelf of handheld games is
 * lower than a shelf of keep cases, as it would be in a real room.
 */
export const layoutRoom = (
  shelves: readonly (readonly LayoutBox[])[],
  standing: Standing,
): RoomLayout => {
  const boxes: PlacedBox[] = []
  const ledges: PlacedLedge[] = []
  const placedShelves: PlacedShelf[] = []
  const pitches: number[] = []
  const gap = GAP[standing]
  let cursor = 0
  let top = FLOOR

  shelves.forEach((items, shelf) => {
    const tallest = items.reduce((most, box) => Math.max(most, caseShapes[box.shape].height), 0)
    const pitch = (tallest || caseShapes.keepCase.height) + HEADROOM + LEDGE_THICKNESS
    pitches.push(pitch)
    const shelfX0 = cursor
    const from = boxes.length
    let bay = 0
    let level = 0
    let x = 0
    let ledge = -1

    const openLedge = () => {
      const bayX0 = shelfX0 + bay * (BAY_WIDTH + BAY_GAP)
      ledges.push({
        shelf,
        bay,
        x0: bayX0,
        x1: bayX0 + BAY_WIDTH,
        // The top ledge first, as the 2D shelf fills its first row first.
        y: FLOOR + (LEDGES_PER_BAY - 1 - level) * pitch,
        from: boxes.length,
        to: boxes.length,
      })
      ledge = ledges.length - 1
      x = 0
    }

    for (const [index, item] of items.entries()) {
      const size = footprint(item, standing)
      if (ledge < 0) openLedge()
      if (x > 0 && x + size.width > BAY_WIDTH) {
        level += 1
        if (level === LEDGES_PER_BAY) {
          level = 0
          bay += 1
        }
        openLedge()
      }
      const current = ledges[ledge]!
      boxes.push({
        shelf,
        index,
        ledge,
        shape: item.shape,
        x: current.x0 + x + size.width / 2,
        y: current.y,
        z: BACK_GAP + size.depth / 2,
        ...size,
      })
      current.to = boxes.length
      x += size.width + gap
    }

    // An empty shelf is not shown (spec 3.7), but a layout of one still has a bay to stand on.
    if (ledge < 0) openLedge()

    const bays = bay + 1
    const shelfX1 = shelfX0 + bays * BAY_WIDTH + (bays - 1) * BAY_GAP
    const highest = FLOOR + (LEDGES_PER_BAY - 1) * pitch
    top = Math.max(top, highest + pitch)
    placedShelves.push({
      x0: shelfX0,
      x1: shelfX1,
      bays,
      from,
      to: boxes.length,
      labelX: shelfX0,
      labelY: highest + pitch - LEDGE_THICKNESS,
    })
    cursor = shelfX1 + BAY_GAP
  })

  return {
    boxes,
    ledges,
    shelves: placedShelves,
    x0: 0,
    x1: Math.max(0, cursor - BAY_GAP),
    top,
    pitches,
  }
}

/**
 * The box at a point on the wall, as a pointer ray meets the plane of the
 * boxes' fronts. No per-box hit test: a ledge is found by height, then a box
 * on it by a binary search along x.
 */
export const boxAt = (layout: RoomLayout, x: number, y: number): number | undefined => {
  for (const ledge of layout.ledges) {
    if (x < ledge.x0 || x > ledge.x1 || ledge.from === ledge.to) continue
    if (y < ledge.y) continue
    const pitch = layout.pitches[ledge.shelf] ?? 0
    if (y > ledge.y + pitch - LEDGE_THICKNESS) continue

    let low = ledge.from
    let high = ledge.to - 1
    while (low <= high) {
      const middle = (low + high) >> 1
      const box = layout.boxes[middle]!
      if (x < box.x - box.width / 2) high = middle - 1
      else if (x > box.x + box.width / 2) low = middle + 1
      else return y <= box.y + box.height ? middle : undefined
    }
    return undefined
  }
  return undefined
}

/** The box index for a shelf and a position on it. */
export const boxIndexOf = (
  layout: RoomLayout,
  shelf: number,
  index: number,
): number | undefined => {
  const placed = layout.shelves[shelf]
  if (!placed) return undefined
  const at = placed.from + index
  return at < placed.to ? at : undefined
}
