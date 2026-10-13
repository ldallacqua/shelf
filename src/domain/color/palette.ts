/**
 * Three colors from a cover, and the light a game gives its shelf. Pure
 * arithmetic on pixels: the server decodes the image and hands the pixels in.
 */

export type Rgb = readonly [number, number, number]

/** `[accent, second, base]`: the most vivid color, a contrasting one, and the most common. */
export type Palette = readonly [string, string, string]

const clamp = (value: number, min = 0, max = 255) => Math.min(max, Math.max(min, value))

export const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((channel) => Math.round(clamp(channel)).toString(16).padStart(2, '0')).join('')}`

export const fromHex = (hex: string): Rgb => {
  const value = hex.replace('#', '')
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

const HEX = /^#[0-9a-f]{6}$/i

export const isHex = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value)

type Hsl = readonly [hue: number, saturation: number, lightness: number]

export const toHsl = ([r, g, b]: Rgb): Hsl => {
  const red = r / 255
  const green = g / 255
  const blue = b / 255
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const lightness = (max + min) / 2
  const spread = max - min
  if (spread === 0) return [0, 0, lightness]
  const saturation = spread / (1 - Math.abs(2 * lightness - 1))
  let hue: number
  if (max === red) hue = ((green - blue) / spread) % 6
  else if (max === green) hue = (blue - red) / spread + 2
  else hue = (red - green) / spread + 4
  return [(hue * 60 + 360) % 360, saturation, lightness]
}

export const fromHsl = ([hue, saturation, lightness]: Hsl): Rgb => {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  const sector = hue / 60
  const x = chroma * (1 - Math.abs((sector % 2) - 1))
  const [r, g, b] =
    sector < 1
      ? [chroma, x, 0]
      : sector < 2
        ? [x, chroma, 0]
        : sector < 3
          ? [0, chroma, x]
          : sector < 4
            ? [0, x, chroma]
            : sector < 5
              ? [x, 0, chroma]
              : [chroma, 0, x]
  const lift = lightness - chroma / 2
  return [(r + lift) * 255, (g + lift) * 255, (b + lift) * 255]
}

/** How colorful a color is, 0 to 1: the spread between its channels. */
const chromaOf = ([r, g, b]: Rgb): number => (Math.max(r, g, b) - Math.min(r, g, b)) / 255

const distance = (a: Rgb, b: Rgb): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 441.673

type Box = { pixels: Rgb[] }

const rangeOf = (box: Box, channel: 0 | 1 | 2): number => {
  let min = 255
  let max = 0
  for (const pixel of box.pixels) {
    if (pixel[channel] < min) min = pixel[channel]
    if (pixel[channel] > max) max = pixel[channel]
  }
  return max - min
}

const widest = (box: Box): { channel: 0 | 1 | 2; range: number } => {
  let best: { channel: 0 | 1 | 2; range: number } = { channel: 0, range: -1 }
  for (const channel of [0, 1, 2] as const) {
    const range = rangeOf(box, channel)
    if (range > best.range) best = { channel, range }
  }
  return best
}

const average = (pixels: readonly Rgb[]): Rgb => {
  let r = 0
  let g = 0
  let b = 0
  for (const pixel of pixels) {
    r += pixel[0]
    g += pixel[1]
    b += pixel[2]
  }
  const count = Math.max(1, pixels.length)
  return [r / count, g / count, b / count]
}

/** Median cut: split the pixels into boxes of similar color, widest box first. */
const quantize = (pixels: Rgb[], count: number): { color: Rgb; share: number }[] => {
  const boxes: Box[] = [{ pixels }]
  while (boxes.length < count) {
    let target = -1
    let targetScore = 0
    for (const [index, box] of boxes.entries()) {
      if (box.pixels.length < 2) continue
      const score = widest(box).range * Math.sqrt(box.pixels.length)
      if (score > targetScore) {
        target = index
        targetScore = score
      }
    }
    const box = boxes[target]
    if (!box) break
    const { channel } = widest(box)
    const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel])
    const middle = sorted.length >> 1
    boxes.splice(target, 1, { pixels: sorted.slice(0, middle) }, { pixels: sorted.slice(middle) })
  }
  return boxes
    .filter((box) => box.pixels.length > 0)
    .map((box) => ({ color: average(box.pixels), share: box.pixels.length / pixels.length }))
}

/** What a cover with no usable pixels gets: the room's own neutral grays. */
export const NEUTRAL_PALETTE: Palette = ['#8a90a0', '#3a3f4c', '#1c202b']

/**
 * Three colors from an image's pixels (`rgba` is 4 bytes per pixel).
 *
 * - **base**: the largest area of similar color.
 * - **accent**: the most colorful area of any real size. It becomes the LED.
 * - **second**: whatever differs most from both.
 */
export const extractPalette = (rgba: Uint8Array | Uint8ClampedArray): Palette => {
  const pixels: Rgb[] = []
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if ((rgba[i + 3] ?? 0) < 128) continue
    pixels.push([rgba[i] ?? 0, rgba[i + 1] ?? 0, rgba[i + 2] ?? 0])
  }
  if (pixels.length === 0) return NEUTRAL_PALETTE

  const swatches = quantize(pixels, 8)
  const base = swatches.reduce((a, b) => (b.share > a.share ? b : a))

  const accent = swatches.reduce((a, b) => {
    // Colorful, and not a speck: a 3% patch of red should not light the shelf.
    const score = (swatch: typeof a) => chromaOf(swatch.color) * Math.min(1, swatch.share / 0.08)
    return score(b) > score(a) ? b : a
  })

  const second = swatches.reduce((a, b) => {
    const score = (swatch: typeof a) =>
      Math.min(distance(swatch.color, base.color), distance(swatch.color, accent.color)) *
      Math.sqrt(swatch.share)
    return score(b) > score(a) ? b : a
  })

  return [toHex(accent.color), toHex(second.color), toHex(base.color)]
}

/** The light a room's LEDs show when no game is in focus. Matches `--violet-500`. */
export const DEFAULT_LED = '#7c5cff'

/**
 * The light a game gives its shelf: its accent, made bright and saturated
 * enough to read as light. A gray cover gives a cool white.
 */
export const ledFrom = (accent: string): string => {
  const [hue, saturation, lightness] = toHsl(fromHex(accent))
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation
  if (chroma < 0.1) return '#cdd5ff'
  return toHex(
    fromHsl([
      hue,
      Math.min(1, Math.max(0.72, saturation)),
      Math.min(0.66, Math.max(0.56, lightness)),
    ]),
  )
}
