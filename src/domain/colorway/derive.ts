import { contrast, mix } from './contrast'
import { fromOklch, toOklch, type Oklch } from './oklch'
import type { Seeds } from './presets'

/**
 * How a colorway's every color is worked out from its three seeds (see
 * `presets.ts`), the same way for a preset and for one's own. Every pair the
 * interface may use reaches its contrast in both themes, whatever the seeds.
 */

/** The meaning tokens a colorway sets, in each theme. */
export const colorTokens = [
  'wall',
  'wall-deep',
  'surface',
  'surface-raised',
  'ledge',
  'ledge-top',
  'on-ledge',
  'text',
  'text-muted',
  'accent',
  'on-accent',
  'marker',
  'line',
  'line-strong',
  'focus',
] as const
export type ColorToken = (typeof colorTokens)[number]

export type Theme = 'light' | 'dark'
export type ThemeColors = Record<ColorToken, string>
export type Colors = { light: ThemeColors; dark: ThemeColors; led: string }

type Neutral = Exclude<ColorToken, 'accent' | 'on-accent' | 'marker' | 'focus'>

/**
 * Shelf's own neutrals, as lightness and chroma in OKLCH, read from `theme.css`.
 * A room keeps every lightness and takes its hue; its chroma scales these.
 */
const ladder: Record<Theme, Record<Neutral, [number, number]>> = {
  light: {
    wall: [0.949, 0.0058],
    'wall-deep': [0.918, 0.0087],
    surface: [0.979, 0.0029],
    'surface-raised': [1, 0],
    ledge: [0.236, 0.0179],
    'ledge-top': [0.376, 0.0307],
    'on-ledge': [0.967, 0.0058],
    text: [0.173, 0.0089],
    'text-muted': [0.474, 0.0258],
    line: [0.832, 0.015],
    'line-strong': [0.603, 0.0257],
  },
  dark: {
    wall: [0.159, 0.0111],
    'wall-deep': [0.135, 0.0094],
    surface: [0.205, 0.0167],
    'surface-raised': [0.245, 0.0219],
    ledge: [0.205, 0.0167],
    'ledge-top': [0.29, 0.0249],
    'on-ledge': [0.967, 0.0058],
    text: [0.967, 0.0058],
    'text-muted': [0.74, 0.0248],
    line: [0.29, 0.0249],
    'line-strong': [0.574, 0.0386],
  },
}

/** The chroma of Shelf's own room seed: a room this colorful tints exactly as Shelf does. */
const ROOM_CHROMA = 0.0307
/** How far a room may tint: past this, walls stop reading as a room's and become a color. */
const MOST_TINT = 3.2

/** "Playing", in each theme: a green that never changes hue, so it keeps its meaning. */
const marker: Record<Theme, Oklch> = {
  light: { l: 0.465, c: 0.1138, h: 154 },
  dark: { l: 0.8, c: 0.1821, h: 152 },
}

/**
 * How strongly the LED washes the walls, `--led-strength` times `--led-wash`
 * in each theme of `theme.css` (a test keeps them equal), and the light that
 * would move the wall furthest toward the text.
 */
export const ledWash: Record<Theme, { share: number; worst: string }> = {
  light: { share: 0.45 * 0.1, worst: '#000000' },
  dark: { share: 1 * 0.18, worst: '#ffffff' },
}

/** Text needs 4.5:1; anything else that must be seen, 3:1. The pairs `tokens.test.ts` requires. */
export const requiredPairs: [ColorToken, ColorToken[], number][] = [
  ['text', ['wall', 'wall-deep', 'surface', 'surface-raised'], 4.5],
  ['text-muted', ['wall', 'wall-deep', 'surface', 'surface-raised'], 4.5],
  ['accent', ['wall', 'wall-deep', 'surface', 'surface-raised'], 4.5],
  ['marker', ['wall', 'wall-deep', 'surface', 'surface-raised'], 4.5],
  ['on-accent', ['accent'], 4.5],
  ['on-ledge', ['ledge'], 4.5],
  ['line-strong', ['wall', 'surface', 'surface-raised'], 3],
  ['focus', ['wall', 'wall-deep', 'surface', 'surface-raised'], 3],
]

const STEP = 0.004

/**
 * Moves a color's lightness, `way` up or down, until it reaches `ratio`
 * against every background. Gives black or white if no lightness can.
 */
function reach(start: Oklch, against: string[], ratio: number, way: 1 | -1): string {
  for (let l = start.l; l >= 0 && l <= 1; l += way * STEP) {
    const hex = fromOklch({ ...start, l })
    if (against.every((background) => contrast(hex, background) >= ratio)) return hex
  }
  return way > 0 ? '#ffffff' : '#000000'
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** The accent's lightness: the seed's own, within what reads in each theme, mirrored for dark. */
function accentLightness(seed: Oklch): Record<Theme, number> {
  const light = clamp(seed.l, 0.28, 0.58)
  return { light, dark: clamp(1.28 - light, 0.68, 0.92) }
}

function themeColors(seeds: { accent: Oklch; room: Oklch }, theme: Theme): ThemeColors {
  const tint = clamp(seeds.room.c / ROOM_CHROMA, 0, MOST_TINT)
  const neutral = (token: Neutral): Oklch => {
    const [l, c] = ladder[theme][token]
    return { l, c: c * tint, h: seeds.room.h }
  }
  const hex = (token: Neutral) => fromOklch(neutral(token))

  const walls = [hex('wall'), hex('wall-deep'), hex('surface'), hex('surface-raised')]
  // Text must also read on a wall washed by any LED color.
  const { share, worst } = ledWash[theme]
  const washed = [...walls, mix(walls[0]!, worst, share), mix(walls[1]!, worst, share)]
  // Text on a light wall reads by being darker, and on a dark one by being lighter.
  const away: 1 | -1 = theme === 'light' ? -1 : 1

  let accent = reach({ ...seeds.accent, l: accentLightness(seeds.accent)[theme] }, walls, 4.5, away)
  // What is written on the accent: the brightest of the room on a light theme's
  // deeper accent, the room's darkest on a dark theme's paler one.
  const onAccentFirst = theme === 'light' ? hex('surface-raised') : hex('wall')
  let onAccent = onAccentFirst
  if (contrast(onAccent, accent) < 4.5) {
    // Move the accent away from what is written on it until both read.
    accent = reach(toOklch(accent), [onAccentFirst, ...walls], 4.5, away)
    onAccent = contrast(onAccentFirst, accent) >= 4.5 ? onAccentFirst : hex('text')
  }

  const ledge = hex('ledge')
  return {
    wall: walls[0]!,
    'wall-deep': walls[1]!,
    surface: walls[2]!,
    'surface-raised': walls[3]!,
    ledge,
    'ledge-top': hex('ledge-top'),
    'on-ledge': reach(neutral('on-ledge'), [ledge], 4.5, 1),
    text: reach(neutral('text'), washed, 4.5, away),
    'text-muted': reach(neutral('text-muted'), washed, 4.5, away),
    accent,
    'on-accent': onAccent,
    marker: reach(marker[theme], walls, 4.5, away),
    line: hex('line'),
    'line-strong': reach(neutral('line-strong'), [walls[0]!, walls[2]!, walls[3]!], 3, away),
    focus: accent,
  }
}

/** The LED at rest: bright enough to read as light; a gray seed gives a cool white. */
function ledOf(seed: Oklch): string {
  if (seed.c < 0.03) return fromOklch({ l: clamp(seed.l, 0.78, 0.9), c: 0.03, h: 270 })
  return fromOklch({ ...seed, l: clamp(seed.l, 0.58, 0.82) })
}

/** Every color of a colorway, worked out from its seeds. */
export function colorsOf(seeds: Seeds): Colors {
  const accent = toOklch(seeds.accent)
  const room = toOklch(seeds.room)
  return {
    light: themeColors({ accent, room }, 'light'),
    dark: themeColors({ accent, room }, 'dark'),
    led: ledOf(toOklch(seeds.led)),
  }
}
