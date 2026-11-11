import { isHex } from '@/domain/color/palette'

import type { Preset } from './names'

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
 * The names alone are `names.ts`, which every page loads; the seeds are here,
 * and the arithmetic is `derive.ts`, both loaded only where colorways are chosen.
 */

export type Seeds = { accent: string; room: string; led: string }

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
}

/** Seeds read from anywhere (storage, a form): three #rrggbb colors, or nothing. */
export function parseSeeds(value: unknown): Seeds | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { accent, room, led } = value as Record<string, unknown>
  if (!isHex(accent) || !isHex(room) || !isHex(led)) return undefined
  return { accent: accent.toLowerCase(), room: room.toLowerCase(), led: led.toLowerCase() }
}
