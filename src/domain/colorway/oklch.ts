import { isHex } from '@/domain/color/palette'

/**
 * OKLCH, the space colorways are worked out in: lightness, chroma and hue, where
 * a step of lightness looks like the same step whatever the hue. Shelf draws in
 * sRGB, so every color goes back there, with its chroma lowered until it fits.
 */

export type Oklch = { l: number; c: number; h: number }

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

const channelsOf = (hex: string): [number, number, number] => {
  if (!isHex(hex)) throw new Error(`Not a #rrggbb color: ${hex}`)
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

export function toOklch(hex: string): Oklch {
  const [r, g, b] = channelsOf(hex).map(toLinear) as [number, number, number]
  const long = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const medium = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const short = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const l = 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short
  const bb = 0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short
  const c = Math.hypot(a, bb)
  const h = c < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360
  return { l, c, h }
}

/** Linear sRGB channels for a color, which may fall outside 0 to 1 when sRGB can't show it. */
function linearOf({ l, c, h }: Oklch): [number, number, number] {
  const angle = (h * Math.PI) / 180
  const a = c * Math.cos(angle)
  const b = c * Math.sin(angle)
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ]
}

const fits = (color: Oklch) =>
  linearOf(color).every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6)

/** `#rrggbb` for a color, keeping its lightness and hue and lowering its chroma until sRGB has it. */
export function fromOklch(color: Oklch): string {
  const l = Math.min(1, Math.max(0, color.l))
  let c = Math.max(0, color.c)
  if (!fits({ l, c, h: color.h })) {
    let low = 0
    let high = c
    for (let step = 0; step < 24; step += 1) {
      const middle = (low + high) / 2
      if (fits({ l, c: middle, h: color.h })) low = middle
      else high = middle
    }
    c = low
  }
  const channels = linearOf({ l, c, h: color.h }).map((channel) =>
    Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, channel))))) * 255),
  )
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
