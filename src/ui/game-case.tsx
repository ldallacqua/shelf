import type { ComponentProps, CSSProperties, ReactNode } from 'react'

import { cn } from '@/ui/cn'

/**
 * Real case sizes in millimeters, front view. A case's shape says which
 * platform it is for before any label does.
 */
export const caseShapes = {
  bluRay: { width: 135, height: 171 }, // PlayStation 3, 4 and 5; Xbox One and Series
  keepCase: { width: 135, height: 190 }, // PlayStation 2, Xbox, Xbox 360, Wii, GameCube
  switch: { width: 105, height: 170 },
  jewel: { width: 142, height: 125 }, // PlayStation, Dreamcast, Saturn
  ds: { width: 122, height: 135 }, // DS and 3DS
  vita: { width: 105, height: 135 },
  psp: { width: 99, height: 168 },
  // Cardboard boxes and clamshells. These three are estimates, not measured.
  boxTall: { width: 127, height: 178 }, // NES, Mega Drive, Master System
  boxWide: { width: 178, height: 127 }, // SNES, Nintendo 64
  boxSmall: { width: 124, height: 124 }, // Game Boy and other handhelds
} as const

/** The plastic a case is made of, as paint. */
export const plastics = {
  blue: 'var(--plastic-blue)',
  red: 'var(--plastic-red)',
  green: 'var(--plastic-green)',
  white: 'var(--plastic-white)',
  black: 'var(--plastic-black)',
  clear: 'var(--plastic-clear)',
} as const

export type PlasticName = keyof typeof plastics

export type CaseShape = keyof typeof caseShapes

type GameCaseProps = Omit<ComponentProps<'span'>, 'children'> & {
  shape: CaseShape
  /** The color of the case's plastic: blue, red, green, white or black. */
  frame: string
  /** The light this game gives off when it is in focus. */
  led?: string
  /** Lifts the case toward the viewer and lights it in its own color. */
  active?: boolean
  /** The cover. Until one loads, pass a placeholder. */
  children?: ReactNode
}

/**
 * A game case facing out. Its size is its real size in millimeters times
 * `--mm`, a length the shelf sets, so cases keep their proportions to each
 * other at any scale.
 */
function GameCase({
  shape,
  frame,
  led,
  active,
  className,
  style,
  children,
  ...props
}: GameCaseProps) {
  const { width, height } = caseShapes[shape]
  return (
    <span
      data-slot="game-case"
      data-active={active ? 'true' : undefined}
      className={cn('game-case', className)}
      style={
        {
          width: `calc(var(--mm) * ${width})`,
          height: `calc(var(--mm) * ${height})`,
          '--case-frame': frame,
          '--case-led': led,
          ...style,
        } as CSSProperties
      }
      {...props}
    >
      <span className="game-case-cover">{children}</span>
    </span>
  )
}

type CoverPlaceholderProps = {
  /** Three colors from the cover, most dominant last. */
  colors: readonly [string, string, string]
}

/**
 * Stands in for a cover that has not loaded: a soft blur of its colors.
 * It is never a drawing of a cover.
 */
function CoverPlaceholder({ colors }: CoverPlaceholderProps) {
  const [a, b, c] = colors
  return (
    <span
      className="block size-full"
      style={{
        background: `radial-gradient(90% 70% at 25% 18%, ${a}, transparent 68%), radial-gradient(85% 75% at 85% 92%, ${b}, transparent 62%), ${c}`,
      }}
    />
  )
}

export { CoverPlaceholder, GameCase }
