/**
 * The room's light, read from the page. The 2D shelf draws with the lighting
 * tokens as CSS; the 3D shelf reads the same properties and feeds them to its
 * shaders, so the two cannot drift (architecture, section 11).
 *
 * Colors stay in sRGB, as CSS composites them: the renderer does no color
 * conversion, so a token looks the same on the wall in 3D as in 2D.
 */

export type Rgb = [number, number, number]

export type Lighting = {
  wall: Rgb
  wallDeep: Rgb
  ledge: Rgb
  ledgeTop: Rgb
  text: Rgb
  textMuted: Rgb
  accent: Rgb
  focus: Rgb
  line: Rgb
  marker: Rgb
  /** The LED's resting color. */
  led: Rgb
  ambient: number
  ledStrength: number
  ledWash: number
  shadowDepth: number
  reflect: number
  glow: number
  plastics: Record<'blue' | 'red' | 'green' | 'white' | 'black' | 'clear', Rgb>
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNCTION = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i

/** A CSS color as three channels from 0 to 1. Unknown text comes back as `fallback`. */
export const parseColor = (text: string, fallback: Rgb = [0, 0, 0]): Rgb => {
  const value = text.trim()
  const hex = HEX.exec(value)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex.slice(0, 6)
    return [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16) / 255) as Rgb
  }
  const channels = FUNCTION.exec(value)
  if (channels) return [channels[1], channels[2], channels[3]].map((c) => Number(c) / 255) as Rgb
  return fallback
}

/** `#rrggbb` for a color. */
export const toHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`

let probe: CanvasRenderingContext2D | null | undefined

/**
 * Any color the browser understands, as channels. Registered properties come
 * back as `rgb()`; anything else is handed to a canvas, which normalizes it.
 */
const resolve = (text: string, fallback: Rgb): Rgb => {
  const direct = parseColor(text, [-1, -1, -1])
  if (direct[0] >= 0) return direct
  probe ??= document.createElement('canvas').getContext('2d')
  if (!probe || !text.trim()) return fallback
  probe.fillStyle = '#000'
  probe.fillStyle = text.trim()
  return parseColor(String(probe.fillStyle), fallback)
}

const number = (style: CSSStyleDeclaration, name: string, fallback: number): number => {
  const value = Number.parseFloat(style.getPropertyValue(name))
  return Number.isFinite(value) ? value : fallback
}

/** The lighting as the page has it right now, on `element` (the shelf, so a local `data-theme` counts). */
export const readLighting = (element: Element): Lighting => {
  const style = getComputedStyle(element)
  const color = (name: string, fallback: Rgb) => resolve(style.getPropertyValue(name), fallback)
  return {
    wall: color('--wall', [0.93, 0.93, 0.95]),
    wallDeep: color('--wall-deep', [0.88, 0.89, 0.92]),
    ledge: color('--ledge', [0.1, 0.12, 0.15]),
    ledgeTop: color('--ledge-top', [0.23, 0.25, 0.32]),
    text: color('--text', [0.05, 0.06, 0.08]),
    textMuted: color('--text-muted', [0.33, 0.36, 0.42]),
    accent: color('--accent', [0.36, 0.25, 0.9]),
    focus: color('--focus', [0.36, 0.25, 0.9]),
    line: color('--line-strong', [0.48, 0.5, 0.57]),
    marker: color('--marker', [0.04, 0.42, 0.23]),
    led: color('--led', [0.49, 0.36, 1]),
    ambient: number(style, '--ambient', 1),
    ledStrength: number(style, '--led-strength', 0.45),
    ledWash: number(style, '--led-wash', 0.1),
    shadowDepth: number(style, '--shadow-depth', 0.2),
    reflect: number(style, '--reflect', 0.05),
    glow: number(style, '--glow', 0.25),
    plastics: {
      blue: color('--plastic-blue', [0.12, 0.37, 0.82]),
      red: color('--plastic-red', [0.85, 0.13, 0.17]),
      green: color('--plastic-green', [0.18, 0.6, 0.25]),
      white: color('--plastic-white', [0.93, 0.94, 0.96]),
      black: color('--plastic-black', [0.09, 0.1, 0.12]),
      clear: color('--plastic-clear', [0.67, 0.71, 0.8]),
    },
  }
}

/** Whether two readings differ enough to draw again. */
export const sameLighting = (a: Lighting, b: Lighting): boolean =>
  JSON.stringify(a) === JSON.stringify(b)
