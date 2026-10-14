import { damp, settled } from './motion'

/**
 * The camera walks sideways along the wall, as a visitor would. Everything
 * that moves it (wheel, trackpad, drag, keys, the index, focus) sets where it
 * is going; each frame it eases toward that, and it can never leave the wall.
 */

/** The camera's field of view, top to bottom, in degrees. Narrow, so cases keep their shape at the edges. */
export const FIELD_OF_VIEW = 28

/** How fast the camera follows: settles in about a third of a second. */
const RATE = 9

export type Rig = {
  /** Where the camera is along the wall, and where it is going. */
  x: number
  target: number
  /** How far it may go: the wall's ends, less half of what the camera sees. */
  min: number
  max: number
}

/** How wide a slice of the wall the camera sees from `distance` away. */
export const visibleWidth = (distance: number, aspect: number, fov = FIELD_OF_VIEW): number =>
  2 * Math.tan(((fov / 2) * Math.PI) / 180) * distance * aspect

/** How far back the camera stands to see `height` of the wall, top to bottom. */
export const distanceFor = (height: number, fov = FIELD_OF_VIEW): number =>
  height / 2 / Math.tan(((fov / 2) * Math.PI) / 180)

/**
 * The range the camera's center may take. A wall narrower than the view is
 * centered and does not move at all.
 */
export const limits = (
  wallX0: number,
  wallX1: number,
  seen: number,
  margin: number,
): { min: number; max: number } => {
  const half = seen / 2
  const min = wallX0 + half - margin
  const max = wallX1 - half + margin
  if (min >= max) {
    const middle = (wallX0 + wallX1) / 2
    return { min: middle, max: middle }
  }
  return { min, max }
}

export const createRig = (x: number, min: number, max: number): Rig => {
  const start = clamp(x, min, max)
  return { x: start, target: start, min, max }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Sends the camera toward a place on the wall, or as near as it may go. */
export const aim = (rig: Rig, x: number): void => {
  rig.target = clamp(x, rig.min, rig.max)
}

/** Moves the camera's goal by a distance, as the wheel and a drag do. */
export const nudge = (rig: Rig, by: number): void => aim(rig, rig.target + by)

/** New ends of the wall, as when the shelves change. The camera stays where it can. */
export const relimit = (rig: Rig, min: number, max: number): void => {
  rig.min = min
  rig.max = max
  rig.target = clamp(rig.target, min, max)
  rig.x = clamp(rig.x, min, max)
}

/**
 * One frame. Returns whether the camera is still moving, so the scene knows
 * whether to ask for another frame. Under reduced motion it cuts.
 */
export const step = (rig: Rig, seconds: number, calm: boolean): boolean => {
  if (calm || settled(rig.x, rig.target)) {
    rig.x = rig.target
    return false
  }
  rig.x = damp(rig.x, rig.target, RATE, seconds)
  return true
}

/**
 * The wheel's movement as a distance along the wall. A trackpad's sideways
 * swipe and a mouse wheel's turn both walk the camera; whichever is larger
 * wins, so a diagonal swipe does not jitter. Lines and pages are converted
 * the way browsers scroll them.
 */
export const wheelDistance = (
  event: { deltaX: number; deltaY: number; deltaMode: number },
  pixelsToWall: number,
): number => {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  return delta * unit * pixelsToWall
}
