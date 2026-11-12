import { BLACK_KEEP, blackDarkened, blackOf, blackWalls, colorsOf } from '@/domain/colorway/derive'
import { DEFAULT_PRESET, OWN, presetNames, type Preset } from '@/domain/colorway/names'
import {
  colorTokens,
  presets,
  type Colors,
  type Theme,
  type ThemeColors,
} from '@/domain/colorway/presets'
import { readPalette, readTheme, resolve } from '@/ui/tokens/read-tokens'

/**
 * The text of `src/ui/tokens/colorways.css`, written by `pnpm tokens:colorways`
 * and checked against the file by a test, so a preset's colors live in one
 * place: its seeds, in `domain/colorway/presets.ts`.
 *
 * Shelf's own colors (violet) are `theme.css` and need no colorway on <html>;
 * they are written here too, so anything can draw itself in them, as the
 * picker's own swatch does inside a page of another colorway.
 */

const ownColors = (): Colors => {
  const palette = readPalette()
  const of = (theme: Theme) => {
    const tokens = readTheme(theme)
    return Object.fromEntries(
      colorTokens.map((token) => [token, resolve(`--${token}`, tokens, palette)]),
    ) as Colors[Theme]
  }
  return {
    light: of('light'),
    dark: of('dark'),
    led: resolve('--led', readTheme('light'), palette),
  }
}

export const colorsOfPreset = (name: Preset): Colors =>
  name === DEFAULT_PRESET ? ownColors() : colorsOf(presets[name])

/** Each selector a colorway's theme is drawn by: on <html>, or on any element inside one theme or another. */
const selectors = (name: string, theme: Theme): string[] =>
  theme === 'light'
    ? [
        `[data-colors='${name}']`,
        `[data-colors='${name}'] [data-theme='light']`,
        `[data-theme='light'] [data-colors='${name}']`,
      ]
    : [
        `[data-colors='${name}'][data-theme='dark']`,
        `[data-colors='${name}'] [data-theme='dark']`,
        `[data-theme='dark'] [data-colors='${name}']`,
      ]

const block = (name: string, theme: Theme, colors: Colors): string =>
  `${selectors(name, theme).join(',\n')} {\n${[
    ...colorTokens.map((token) => `  --${token}: ${colors[theme][token]};`),
    `  --led: ${colors.led};`,
  ].join('\n')}\n}\n`

export function colorwaysCss(): string {
  const header = `/*
 * Colorways (issue 206): the meaning tokens and the LED's resting color, for
 * each preset in each theme. Written by \`pnpm tokens:colorways\` from the seeds
 * in src/domain/colorway/presets.ts. Don't edit it: change a seed and run it.
 *
 * <html> carries \`data-colors\` for every colorway but Shelf's own, which is
 * theme.css. Any element may carry it too, to draw itself in one, within the
 * theme around it. Both forms are more specific than theme.css's own blocks.
 * One's own is last: its colors are properties on <html>.
 *
 * \`data-black\` on <html> is pure black for OLED screens: each colorway's
 * dark theme with its walls fully black, and its panels, shelves and lines
 * mixed with black. Its blocks come after the themes', and are more specific.
 */
`
  const blocks = presetNames.flatMap((name) => {
    const colors = colorsOfPreset(name)
    const seeds = presets[name]
    const seeded = `accent ${seeds.accent}, room ${seeds.room}, light ${seeds.led}${seeds.pastel ? ', pastel' : ''}`
    return [
      name === DEFAULT_PRESET
        ? `\n/* ${name}: Shelf's own, theme.css's. One's own starts from ${seeded} */\n`
        : `\n/* ${name}: ${seeded} */\n`,
      block(name, 'light', colors),
      block(name, 'dark', colors),
    ]
  })
  return header + blocks.join('') + ownBlocks() + blackBlocks()
}

/** The tokens pure black changes, each the only ones its blocks set. */
const blackTokens = [...blackWalls, ...blackDarkened]

/** Each selector a colorway's pure black is drawn by; Shelf's own also on <html> naming none. */
const blackSelectors = (name: string): string[] => [
  `[data-black][data-theme='dark'][data-colors='${name}']`,
  `[data-black][data-theme='dark'] [data-colors='${name}']`,
  ...(name === DEFAULT_PRESET ? [`[data-black][data-theme='dark']`] : []),
]

const blackBlock = (name: string, colors: Partial<ThemeColors>): string =>
  `${blackSelectors(name).join(',\n')} {\n${blackTokens
    .map((token) => `  --${token}: ${colors[token]};`)
    .join('\n')}\n}\n`

/**
 * Pure black: every preset's worked out by `blackOf`, and one's own mixed in
 * CSS from the dark colors <html> carries, the same mix with black in OKLab.
 */
function blackBlocks(): string {
  const presetBlocks = presetNames.map((name) =>
    blackBlock(name, blackOf(colorsOfPreset(name).dark)),
  )
  const own = ownColors().dark
  const keep = `${Math.round(BLACK_KEEP * 100)}%`
  const ownBlack = Object.fromEntries([
    ...blackWalls.map((token) => [token, '#000000']),
    ...blackDarkened.map((token) => [
      token,
      `color-mix(in oklab, var(${ownProperty('dark', token)}, ${own[token]}) ${keep}, #000000)`,
    ]),
  ]) as Partial<ThemeColors>
  return [
    `\n/* Pure black, for OLED screens */\n`,
    ...presetBlocks,
    blackBlock(OWN, ownBlack),
  ].join('')
}

/** The custom property on <html> that carries one token of one's own colorway in one theme. */
export const ownProperty = (theme: Theme, token: string): string => `--own-${theme}-${token}`
export const OWN_LED = '--own-led'

/**
 * One's own colorway: every token read from a property on <html>, which the
 * theme script or the picker sets from what the device keeps, and Shelf's own
 * color where it is missing.
 */
function ownBlocks(): string {
  const own = ownColors()
  const read = (theme: Theme) =>
    Object.fromEntries(
      colorTokens.map((token) => [
        token,
        `var(${ownProperty(theme, token)}, ${own[theme][token]})`,
      ]),
    ) as Colors[Theme]
  const colors: Colors = {
    light: read('light'),
    dark: read('dark'),
    led: `var(${OWN_LED}, ${own.led})`,
  }
  return [
    `
/* ${OWN}: one's own, worked out on the device; <html> carries its colors */
`,
    block(OWN, 'light', colors),
    block(OWN, 'dark', colors),
  ].join('')
}
