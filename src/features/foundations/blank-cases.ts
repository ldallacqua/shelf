import { caseShapes, type CaseShape } from '@/ui/game-case'

/**
 * Blank game cases for the lighting demo: real case sizes and plastic colors,
 * with a blur of color where the cover would be. No titles, no logos and no
 * cover art. Real covers arrive from IGDB at the next build step.
 */
export type BlankCase = {
  id: string
  shape: CaseShape
  /** The plastic. */
  frame: string
  /** Three colors standing in for a cover, most dominant last. */
  art: readonly [string, string, string]
  /** The light this case gives the shelf when it is in focus. */
  led: string
}

const frames = {
  blue: '#1f5fd0',
  red: '#d9202b',
  green: '#2f9a3f',
  white: '#eef0f4',
  black: '#17191f',
} as const

export const blankCases: readonly BlankCase[] = [
  {
    id: 'ember',
    shape: 'bluRay',
    frame: frames.blue,
    art: ['#ffb347', '#7a1f4d', '#e2502b'],
    led: '#ff7a3d',
  },
  {
    id: 'tide',
    shape: 'switch',
    frame: frames.red,
    art: ['#9ff3ff', '#123b8f', '#1fa8c9'],
    led: '#22c8ee',
  },
  {
    id: 'bloom',
    shape: 'bluRay',
    frame: frames.white,
    art: ['#ffc2e8', '#3a1c8f', '#e0409b'],
    led: '#f0409b',
  },
  {
    id: 'moss',
    shape: 'bluRay',
    frame: frames.green,
    art: ['#e6ff8a', '#0c3b2a', '#4fb53a'],
    led: '#7ddc3c',
  },
  {
    id: 'dusk',
    shape: 'switch',
    frame: frames.red,
    art: ['#c9b8ff', '#141033', '#6a4df0'],
    led: '#7c5cff',
  },
  {
    id: 'gilt',
    shape: 'jewel',
    frame: frames.black,
    art: ['#fff0a8', '#5b2a0c', '#e0a12b'],
    led: '#ffc23d',
  },
  {
    id: 'flare',
    shape: 'keepCase',
    frame: frames.black,
    art: ['#ff9a8a', '#1a0a12', '#d92b3f'],
    led: '#ff4d5e',
  },
  {
    id: 'frost',
    shape: 'bluRay',
    frame: frames.white,
    art: ['#ffffff', '#27407a', '#8fb8ee'],
    led: '#8fc0ff',
  },
]

// Space between two cases, and at each end of the row, in millimeters.
export const CASE_GAP_MM = 14
const END_MARGIN_MM = 18

/**
 * The width of a row of cases in millimeters. A shelf divides its own width
 * by this to find how many pixels a millimeter gets, so the row always fits.
 */
export function rowWidth(cases: readonly BlankCase[]): number {
  const widths = cases.reduce((total, item) => total + caseShapes[item.shape].width, 0)
  return widths + Math.max(cases.length - 1, 0) * CASE_GAP_MM + 2 * END_MARGIN_MM
}
