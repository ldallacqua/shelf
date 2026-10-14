import { CanvasTexture, LinearFilter, NoColorSpace } from 'three'

import { toHex, type Rgb } from './tokens'

/**
 * Text and marks the scene draws on canvases: the shelves' labels, the
 * spines of the compact option (IGDB has no spine art, so spines are always
 * made, spec 3.2), and the digits for a game owned on several platforms.
 * All in the page's own type.
 */

const texture = (canvas: HTMLCanvasElement): CanvasTexture => {
  const result = new CanvasTexture(canvas)
  result.colorSpace = NoColorSpace
  result.flipY = false
  result.generateMipmaps = false
  result.minFilter = LinearFilter
  result.magFilter = LinearFilter
  return result
}

const canvasOf = (width: number, height: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, context: canvas.getContext('2d') }
}

export type Fonts = { sans: string; display: string; mono: string }

/** The page's type, as the 2D shelf uses it, read from its custom properties. */
export const readFonts = (element: Element): Fonts => {
  const style = getComputedStyle(element)
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    sans: read('--font-sans', 'system-ui, sans-serif'),
    display: read('--font-display', 'system-ui, sans-serif'),
    mono: read('--font-mono', 'ui-monospace, monospace'),
  }
}

/** Waits until the faces the scene draws with are ready, so no label is set in a fallback face. */
export const fontsReady = async (fonts: Fonts): Promise<void> => {
  try {
    await Promise.all([
      document.fonts.load(`800 48px ${fonts.display}`),
      document.fonts.load(`600 14px ${fonts.sans}`),
      document.fonts.load(`400 26px ${fonts.mono}`),
    ])
  } catch {
    // Drawing in a fallback face is better than not drawing.
  }
}

/* ----------------------------------------------------------- shelf labels */

export type LabelText = {
  name: string
  count: string
  /** "2 playing", when the shelf has games being played. */
  playing?: string
}

export type LabelCell = { u: number; v: number; width: number; height: number; aspect: number }

const LABEL = { width: 1024, height: 96 }

/** A label's height on the wall, in millimeters. */
export const LABEL_HEIGHT = 64

export const drawLabels = (
  labels: readonly LabelText[],
  colors: { text: Rgb; muted: Rgb; marker: Rgb },
  fonts: Fonts,
  maxSize: number,
): { texture: CanvasTexture; cells: LabelCell[] } => {
  const columns = 2
  const rows = Math.max(1, Math.ceil(labels.length / columns))
  const height = Math.min(maxSize, rows * LABEL.height)
  const { canvas, context } = canvasOf(LABEL.width * columns, height)
  const cells: LabelCell[] = []
  labels.forEach((label, at) => {
    const column = at % columns
    const row = Math.floor(at / columns)
    const x = column * LABEL.width
    const y = row * LABEL.height
    let used = 0
    if (context && y + LABEL.height <= height) {
      context.textBaseline = 'alphabetic'
      context.font = `800 54px ${fonts.display}`
      context.fillStyle = toHex(colors.text)
      context.fillText(label.name, x + 4, y + 66, LABEL.width - 340)
      used = Math.min(LABEL.width - 340, context.measureText(label.name).width) + 4
      context.font = `400 26px ${fonts.mono}`
      context.fillStyle = toHex(colors.muted)
      context.fillText(label.count, x + used + 22, y + 64)
      used += 22 + context.measureText(label.count).width
      if (label.playing) {
        context.fillStyle = toHex(colors.marker)
        context.beginPath()
        context.arc(x + used + 30, y + 55, 7, 0, Math.PI * 2)
        context.fill()
        context.fillText(label.playing, x + used + 46, y + 64)
        used += 46 + context.measureText(label.playing).width
      }
      used = Math.min(LABEL.width, used + 8)
    }
    cells.push({
      u: x / canvas.width,
      v: y / canvas.height,
      width: used / canvas.width,
      height: LABEL.height / canvas.height,
      aspect: used / LABEL.height,
    })
  })
  return { texture: texture(canvas), cells }
}

/* ----------------------------------------------------------------- spines */

export const SPINE = { width: 24, height: 256 }
export const SPINE_COLUMNS = Math.floor(2048 / SPINE.width)
export const SPINE_ROWS = Math.floor(2048 / SPINE.height)
export const SPINES_PER_PAGE = SPINE_COLUMNS * SPINE_ROWS

/** A spine is the cover's base color, banded in the case's plastic, as the 2D spine. */
export type SpineText = { title: string; color: Rgb; band: Rgb }

/** White or near-black, whichever reads on a color, as the 2D spine chooses. */
const inkOn = ([r, g, b]: Rgb): string =>
  (r * 299 + g * 587 + b * 114) / 1000 > 0.59 ? '#14171f' : '#ffffff'

/** Spines for every box, in pages of the given count. A box past the last page keeps plain plastic. */
export const drawSpines = (
  spines: readonly SpineText[],
  fonts: Fonts,
  pages: number,
): { textures: CanvasTexture[]; cells: { page: number; u: number; v: number }[] } => {
  const sheets = Array.from({ length: pages }, () => canvasOf(2048, 2048))
  const cells: { page: number; u: number; v: number }[] = []
  spines.forEach((spine, at) => {
    const page = Math.floor(at / SPINES_PER_PAGE)
    const sheet = sheets[page]
    if (!sheet?.context) {
      cells.push({ page: -1, u: 0, v: 0 })
      return
    }
    const { context } = sheet
    const cell = at % SPINES_PER_PAGE
    const x = (cell % SPINE_COLUMNS) * SPINE.width
    const y = Math.floor(cell / SPINE_COLUMNS) * SPINE.height
    context.fillStyle = toHex(spine.color)
    context.fillRect(x, y, SPINE.width, SPINE.height)
    // The platform's band across the top, as on the case's front.
    context.fillStyle = toHex(spine.band)
    context.fillRect(x, y, SPINE.width, 22)
    context.save()
    context.translate(x + SPINE.width / 2, y + 30)
    context.rotate(Math.PI / 2)
    context.font = `600 13px ${fonts.sans}`
    context.fillStyle = inkOn(spine.color)
    context.textBaseline = 'middle'
    context.fillText(spine.title, 0, 0, SPINE.height - 38)
    context.restore()
    cells.push({ page, u: x / 2048, v: y / 2048 })
  })
  return { textures: sheets.map(({ canvas }) => texture(canvas)), cells }
}

/* ----------------------------------------------------------------- digits */

/** Ten cells, 0 to 9, as the 2D count shows them; the ninth reads "9+". White on nothing: the shader inks it. */
export const drawDigits = (fonts: Fonts): CanvasTexture => {
  const cell = { width: 48, height: 64 }
  const { canvas, context } = canvasOf(cell.width * 10, cell.height)
  if (context) {
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    for (let digit = 0; digit < 10; digit += 1) {
      const text = digit === 9 ? '9+' : String(digit)
      context.font = `600 ${digit === 9 ? 30 : 34}px ${fonts.mono}`
      context.fillText(
        text,
        digit * cell.width + cell.width / 2,
        cell.height / 2 + 2,
        cell.width - 4,
      )
    }
  }
  return texture(canvas)
}
