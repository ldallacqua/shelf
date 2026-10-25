import type { ComponentProps } from 'react'

/**
 * Icons lucide does not draw, drawn as it draws its own: a 24-unit square, a
 * 2-unit stroke in the color of the text, so they sit beside lucide's in a
 * button. Never a maker's mark: Nintendo, Microsoft, Sony and Valve do not
 * allow their logos here (architecture, section 25), so a store or console
 * is named in words.
 */

type IconProps = ComponentProps<'svg'>

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** A game cartridge or card, any console's: a body with one corner cut, its label and its grip. */
export function CartridgeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <rect x="9" y="8" width="6" height="6" rx="1" />
      <path d="M10 18h4" />
    </svg>
  )
}
