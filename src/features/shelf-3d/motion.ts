import { ease, type EaseName } from '@/ui/tokens/motion'

/**
 * Motion inside the scene, where CSS cannot reach. Two kinds: damping, for
 * anything that follows a moving target (the camera, a box coming forward,
 * the LED's color), and the design system's curves, for a change with a
 * known length (the switch between 2D and 3D).
 */

/**
 * Moves `current` toward `target`, framerate-independent. `rate` is how fast,
 * per second: about 10 settles in a third of a second. Nothing overshoots,
 * so nothing bounces.
 */
export const damp = (current: number, target: number, rate: number, seconds: number): number =>
  target + (current - target) * Math.exp(-rate * seconds)

/** Close enough to stop drawing frames for. */
export const settled = (current: number, target: number, tolerance = 0.05): boolean =>
  Math.abs(current - target) < tolerance

/**
 * A CSS cubic-bezier as a function from progress (0 to 1) to eased progress.
 * Solved by Newton's method with a bisection fallback, as browsers do.
 */
export const cubicBezier = (x1: number, y1: number, x2: number, y2: number) => {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx

  const solve = (x: number): number => {
    let t = x
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(t) - x
      if (Math.abs(error) < 1e-6) return t
      const slope = slopeX(t)
      if (Math.abs(slope) < 1e-6) break
      t -= error / slope
    }
    let low = 0
    let high = 1
    t = x
    while (high - low > 1e-6) {
      if (sampleX(t) < x) low = t
      else high = t
      t = (low + high) / 2
    }
    return t
  }

  return (progress: number): number => {
    if (progress <= 0) return 0
    if (progress >= 1) return 1
    return sampleY(solve(progress))
  }
}

/** One of the design system's three curves. */
export const curve = (name: EaseName) => {
  const [x1, y1, x2, y2] = ease[name]
  return cubicBezier(x1, y1, x2, y2)
}
