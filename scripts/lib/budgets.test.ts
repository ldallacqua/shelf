import { describe, expect, it } from 'vitest'

import { cpuSlowdownFor } from './budgets.ts'

describe('how much to slow a machine to stand in for a mid-range phone', () => {
  it('slows a fast desktop four times, as Lighthouse does by default', () => {
    expect(cpuSlowdownFor(1533)).toBeCloseTo(4)
  })

  it('slows a faster machine more', () => {
    expect(cpuSlowdownFor(2000)).toBeCloseTo(6)
    expect(cpuSlowdownFor(3630)).toBeCloseTo(13)
  })

  it('slows a weaker machine less', () => {
    expect(cpuSlowdownFor(1300)).toBeCloseTo(3)
    expect(cpuSlowdownFor(1050)).toBeCloseTo(2.5)
    expect(cpuSlowdownFor(800)).toBeCloseTo(2)
    expect(cpuSlowdownFor(475)).toBeCloseTo(1.5)
    expect(cpuSlowdownFor(150)).toBeCloseTo(1)
  })

  it('never jumps between steps', () => {
    for (const edge of [800, 1300]) {
      const below = cpuSlowdownFor(edge - 0.001) ?? 0
      const at = cpuSlowdownFor(edge) ?? 0
      expect(Math.abs(at - below)).toBeLessThan(0.001)
    }
  })

  it('refuses a machine too slow to stand in for that phone', () => {
    expect(cpuSlowdownFor(149)).toBeUndefined()
    expect(cpuSlowdownFor(0)).toBeUndefined()
    expect(cpuSlowdownFor(Number.NaN)).toBeUndefined()
  })
})
