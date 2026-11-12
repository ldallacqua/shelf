import { isHex } from '@/domain/color/palette'

import { isPreset, type Preset } from './names'

/**
 * A colorway: the colors Shelf is drawn in, chosen on the device (issue 206).
 * It sets the meaning tokens of `src/ui/tokens/theme.css` in both themes, and
 * the LED's resting color. The lighting (how bright the LEDs are, the shadows)
 * stays the theme's: a colorway is another paint for the same room, lit the
 * same way.
 *
 * A colorway is worked out from three colors, its seeds (`derive.ts`): the
 * accent (buttons, links, focus), the room (a tint for the walls, the shelves
 * and the text) and the light (the LEDs at rest). A preset is three seeds, and
 * so is a colorway of one's own: the same rules make both.
 *
 * The names alone are `names.ts`; the seeds are here, and the arithmetic is
 * `derive.ts`, both loaded only where colorways are chosen.
 */

/** Three colors a colorway is worked out from; pastel ones are worked out softer. */
export type Seeds = { accent: string; room: string; led: string; pastel?: boolean }

/**
 * Each preset's seeds. Violet is Shelf's own colors, which `theme.css` draws
 * with no colorway at all; its seeds are where a colorway of one's own starts
 * from.
 */
export const presets: Record<Preset, Seeds> = {
  violet: { accent: '#6a4cf5', room: '#3a4152', led: '#7c5cff' },
  ocean: { accent: '#1f8fd6', room: '#2c4a66', led: '#22c8ee' },
  ember: { accent: '#f26b2a', room: '#463d3a', led: '#ff7a3d' },
  arcade: { accent: '#f0399b', room: '#3a2860', led: '#ff4fd8' },
  crimson: { accent: '#e5223a', room: '#3c3f46', led: '#ff3b3b' },
  graphite: { accent: '#24282f', room: '#808080', led: '#d3d8e4' },
  lilac: { accent: '#9b7fe0', room: '#b9a6e8', led: '#c8b2ff', pastel: true },
  mint: { accent: '#3fb29a', room: '#a8dcc8', led: '#9ef0d4', pastel: true },
  peach: { accent: '#e98a6b', room: '#f1c2ad', led: '#ffc2a0', pastel: true },
  sky: { accent: '#5aa3e0', room: '#a9cdee', led: '#a8dcff', pastel: true },
  rose: { accent: '#e07a9e', room: '#f0b7c9', led: '#ffb3cf', pastel: true },
}

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
/** Every color of a colorway: its tokens in each theme, and its LED at rest. */
export type Colors = { light: ThemeColors; dark: ThemeColors; led: string }

/**
 * A colorway of one's own as the device keeps it: the three colors picked, the
 * preset they started from, and every color worked out from them, so the theme
 * script can paint a page in it before any of the arithmetic has loaded.
 */
export type OwnColorway = { seeds: Seeds; from: Preset; colors: Colors }

/** Seeds read from anywhere (storage, a form): three #rrggbb colors and maybe pastel, or nothing. */
export function parseSeeds(value: unknown): Seeds | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { accent, room, led, pastel } = value as Record<string, unknown>
  if (!isHex(accent) || !isHex(room) || !isHex(led)) return undefined
  const seeds = { accent: accent.toLowerCase(), room: room.toLowerCase(), led: led.toLowerCase() }
  return pastel === true ? { ...seeds, pastel: true } : seeds
}

function parseThemeColors(value: unknown): ThemeColors | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const colors = value as Record<string, unknown>
  const pairs = colorTokens.map((token) => [token, colors[token]] as const)
  if (!pairs.every(([, color]) => isHex(color))) return undefined
  return Object.fromEntries(
    pairs.map(([token, color]) => [token, String(color).toLowerCase()]),
  ) as ThemeColors
}

/** A colorway of one's own read from storage: whole, every color #rrggbb, or nothing. */
export function parseOwnColorway(value: unknown): OwnColorway | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { seeds, from, colors } = value as Record<string, unknown>
  const parsedSeeds = parseSeeds(seeds)
  if (!parsedSeeds || !isPreset(from) || typeof colors !== 'object' || colors === null) {
    return undefined
  }
  const { light, dark, led } = colors as Record<string, unknown>
  const parsedLight = parseThemeColors(light)
  const parsedDark = parseThemeColors(dark)
  if (!parsedLight || !parsedDark || !isHex(led)) return undefined
  return {
    seeds: parsedSeeds,
    from,
    colors: { light: parsedLight, dark: parsedDark, led: led.toLowerCase() },
  }
}
