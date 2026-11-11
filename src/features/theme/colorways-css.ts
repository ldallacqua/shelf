import { colorsOf, colorTokens, type Colors, type Theme } from '@/domain/colorway/derive'
import { DEFAULT_PRESET, presetNames, presets, type Preset } from '@/domain/colorway/presets'
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
 */
`
  const blocks = presetNames.flatMap((name) => {
    const colors = colorsOfPreset(name)
    const seeds = presets[name]
    const seeded = `accent ${seeds.accent}, room ${seeds.room}, light ${seeds.led}`
    return [
      name === DEFAULT_PRESET
        ? `\n/* ${name}: Shelf's own, theme.css's. One's own starts from ${seeded} */\n`
        : `\n/* ${name}: ${seeded} */\n`,
      block(name, 'light', colors),
      block(name, 'dark', colors),
    ]
  })
  return header + blocks.join('')
}
