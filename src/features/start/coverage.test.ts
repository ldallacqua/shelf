import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { setupSteps } from '@/domain/setup/setup'
import { specSections } from '@/features/landing/coverage'

import { setupCoverage } from './coverage'

/**
 * Setting a shelf up against the spec (AGENTS.md, "Every feature is offered in setup where it helps
 * a new shelf"). When this fails after a new feature, decide whether a new shelf needs it: offer it
 * in the step where it helps, in the same change, and name that step here; or say why not.
 */

const spec = specSections(readFileSync(new URL('../../../docs/spec.md', import.meta.url), 'utf8'))
const mapped = Object.entries(setupCoverage)

describe('setting a shelf up, mapped to the spec', () => {
  it.each([...spec])('decides on section %s, %s', (number, title) => {
    expect(
      setupCoverage[number],
      `Spec section ${number} "${title}" is new. Decide whether setting a shelf up should offer it, in src/features/start/coverage.ts: the steps that offer it (built in the same change), or why a new shelf doesn't need it.`,
    ).toBeDefined()
  })

  it('names no section the spec no longer has', () => {
    expect(mapped.filter(([number]) => !spec.has(number)).map(([number]) => number)).toEqual([])
  })

  it('names real steps, or gives a reason', () => {
    for (const [number, entry] of mapped) {
      if (typeof entry === 'string') {
        expect(entry.trim().length, `section ${number} needs a reason`).toBeGreaterThan(5)
      } else {
        expect(entry.length, `section ${number}`).toBeGreaterThan(0)
        for (const step of entry) expect(setupSteps).toContain(step)
      }
    }
  })

  it('has every step offer something', () => {
    const offered = new Set(mapped.flatMap(([, entry]) => (typeof entry === 'string' ? [] : entry)))
    expect(setupSteps.filter((step) => !offered.has(step))).toEqual([])
  })
})
