/**
 * WCAG 2 contrast, for working out a colorway. The design system's own copy
 * (`src/ui/tokens/contrast.ts`) checks the stylesheets; the two layers may not
 * import each other, and both are a few lines of the same published formula.
 */

const channels = (hex: string): [number, number, number] => {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

const luminance = (hex: string): number => {
  const [red, green, blue] = channels(hex).map((channel) => {
    const share = channel / 255
    return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** From 1 (none) to 21 (black on white), between two #rrggbb colors. */
export function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

/** Mixes `share` (0 to 1) of one #rrggbb color into another, as CSS color-mix in srgb does. */
export function mix(base: string, added: string, share: number): string {
  const [b, a] = [channels(base), channels(added)]
  const mixed = b.map((channel, index) => Math.round(channel + ((a[index] ?? 0) - channel) * share))
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}
