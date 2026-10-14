import { describe, expect, it } from 'vitest'

import { ease } from '@/ui/tokens/motion'

import {
  aim,
  createRig,
  distanceFor,
  limits,
  nudge,
  relimit,
  step,
  visibleWidth,
  wheelDistance,
} from './camera-rig'
import { cubicBezier, curve, damp } from './motion'

describe('the camera rig', () => {
  it('eases toward where it is sent, and stops', () => {
    const rig = createRig(0, 0, 10_000)
    aim(rig, 1000)
    const positions: number[] = []
    let moving = true
    for (let frame = 0; frame < 240 && moving; frame += 1) {
      moving = step(rig, 1 / 60, false)
      positions.push(rig.x)
    }
    expect(moving).toBe(false)
    expect(rig.x).toBe(1000)
    // Always forward, never past: nothing bounces.
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]!).toBeGreaterThanOrEqual(positions[i - 1]!)
      expect(positions[i]!).toBeLessThanOrEqual(1000)
    }
    // Most of the way within a third of a second.
    expect(positions[19]!).toBeGreaterThan(900)
  })

  it('cannot leave the wall', () => {
    const rig = createRig(500, 200, 800)
    aim(rig, -10_000)
    expect(rig.target).toBe(200)
    nudge(rig, 50_000)
    expect(rig.target).toBe(800)
  })

  it('cuts instead of gliding under reduced motion', () => {
    const rig = createRig(0, 0, 5000)
    aim(rig, 4000)
    expect(step(rig, 1 / 60, true)).toBe(false)
    expect(rig.x).toBe(4000)
  })

  it('keeps its place when the wall gets shorter, as far as it can', () => {
    const rig = createRig(3000, 0, 5000)
    relimit(rig, 0, 2000)
    expect(rig.x).toBe(2000)
    expect(rig.target).toBe(2000)
  })

  it('centers a wall narrower than what it sees, and does not move', () => {
    expect(limits(0, 1000, 3000, 100)).toEqual({ min: 500, max: 500 })
    expect(limits(0, 10_000, 3000, 100)).toEqual({ min: 1400, max: 8600 })
  })

  it('stands far enough back to see a given height', () => {
    const distance = distanceFor(1200)
    expect(visibleWidth(distance, 1)).toBeCloseTo(1200)
    expect(visibleWidth(distance, 16 / 9)).toBeCloseTo(1200 * (16 / 9))
  })

  it('reads a wheel or a trackpad by its larger movement', () => {
    expect(wheelDistance({ deltaX: 0, deltaY: 100, deltaMode: 0 }, 2)).toBe(200)
    expect(wheelDistance({ deltaX: -30, deltaY: 4, deltaMode: 0 }, 2)).toBe(-60)
    expect(wheelDistance({ deltaX: 0, deltaY: 3, deltaMode: 1 }, 1)).toBe(48)
  })
})

describe('motion in the scene', () => {
  it('damps the same whatever the frame rate', () => {
    let fast = 0
    for (let i = 0; i < 120; i += 1) fast = damp(fast, 100, 8, 1 / 120)
    let slow = 0
    for (let i = 0; i < 30; i += 1) slow = damp(slow, 100, 8, 1 / 30)
    expect(fast).toBeCloseTo(slow, 6)
  })

  it('follows the design system curves', () => {
    const linear = cubicBezier(0, 0, 1, 1)
    expect(linear(0.3)).toBeCloseTo(0.3, 4)
    const glide = curve('glide')
    expect(glide(0)).toBe(0)
    expect(glide(1)).toBe(1)
    expect(glide(0.5)).toBeGreaterThan(0.4)
    // A curve with a slow start stays behind the line early on.
    expect(cubicBezier(...ease.leave)(0.25)).toBeLessThan(0.25)
  })
})
