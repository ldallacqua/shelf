import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { presetNames } from '@/domain/colorway/names'

import { frameParts, landingCoverage, landingParts, specSections } from './coverage'

/**
 * The landing page's map against the spec (AGENTS.md, "The landing page"). When this fails after a
 * new feature, give its section a part of the landing page that shows it, in the same change, and
 * map it here. The page's own test holds the parts to the elements drawn (`landing.test.tsx`).
 */

const spec = specSections(readFileSync(new URL('../../../docs/spec.md', import.meta.url), 'utf8'))
const mapped = Object.entries(landingCoverage)

describe('the landing page’s map of the spec', () => {
  it('reads the spec’s numbered sections', () => {
    expect(spec.get('1')).toBe('What Shelf is')
    expect(spec.get('4.2a')).toBe('A game IGDB does not have')
    expect(spec.get('17a')).toBe('The admin page')
    expect(spec.size).toBeGreaterThan(50)
  })

  it.each([...spec])('names section %s, %s', (number, title) => {
    const entry = landingCoverage[number]
    expect(
      entry,
      `Spec section ${number} "${title}" is new. Show it on the landing page and map it in src/features/landing/coverage.ts, or say there why a visitor wouldn't choose Shelf for it.`,
    ).toBeDefined()
    expect(entry?.title, `Spec section ${number} was renamed: update its entry`).toBe(title)
  })

  it('names no section the spec no longer has', () => {
    const gone = mapped.filter(([number]) => !spec.has(number)).map(([number]) => number)
    expect(gone).toEqual([])
  })

  it('shows each section on a part of the page, or says why not', () => {
    for (const [number, entry] of mapped) {
      if ('left' in entry) {
        expect(entry.left.trim().length, `section ${number} needs a reason`).toBeGreaterThan(10)
      } else {
        expect(entry.shown.length, `section ${number}`).toBeGreaterThan(0)
        for (const part of entry.shown) expect(landingParts).toContain(part)
      }
    }
  })

  it('shows a feature on every part of the page but its close', () => {
    const shown = new Set(mapped.flatMap(([, entry]) => ('shown' in entry ? entry.shown : [])))
    const idle = landingParts.filter((part) => !shown.has(part) && !frameParts.includes(part))
    expect(idle).toEqual([])
  })
})

describe('landing.css', () => {
  it('shows the room of whichever colorway chip is checked, for every colorway', () => {
    const css = readFileSync(new URL('./landing.css', import.meta.url), 'utf8')
    for (const name of presetNames) {
      expect(css).toContain(`.look-demo:has(input[value='${name}']:checked) [data-stage='${name}']`)
    }
  })
})
