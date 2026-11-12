import { ledFrom, type Palette } from '@/domain/color/palette'
import { colorsOf } from '@/domain/colorway/derive'
import { colorTokens } from '@/domain/colorway/presets'

/**
 * Paints the room in a game's colors, worked out from the three its cover
 * gave (`[accent, second, base]`) by the same rules as every colorway: its
 * accent, a room tinted by its most common color, and the light its shelf
 * already takes. Pastel when the colorway chosen is. Loaded only once
 * following is on, as it carries the arithmetic.
 */
export function paintGame(palette: Palette, key: string): void {
  const root = document.documentElement
  const [accent, , base] = palette
  const colors = colorsOf({
    accent,
    room: base,
    led: ledFrom(accent),
    pastel: root.dataset.follow === 'pastel',
  })
  for (const theme of ['light', 'dark'] as const) {
    for (const token of colorTokens) {
      root.style.setProperty(`--game-${theme}-${token}`, colors[theme][token])
    }
  }
  root.style.setProperty('--game-led', colors.led)
  root.dataset.game = key
}
