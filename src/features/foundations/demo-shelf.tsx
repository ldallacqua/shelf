'use client'

import { useState, type CSSProperties } from 'react'

import { cn } from '@/ui/cn'
import { CoverPlaceholder, GameCase } from '@/ui/game-case'
import { Ledge, ShelfLabel } from '@/ui/ledge'

import { CASE_GAP_MM, rowWidth, type BlankCase } from './blank-cases'

type DemoShelfProps = {
  cases: readonly BlankCase[]
  /** How many of the cases to keep when the shelf is narrow, as on a phone. */
  narrowCount?: number
  /** The largest a millimeter may be drawn, in pixels. */
  maxScale?: number
  /** The LED's color while no case is in focus. Defaults to the room's. */
  led?: string
  /** Describes the scene to people who cannot see it. */
  description: string
  /** The name on the shelf's label. The count beside it is the number of cases showing. */
  label?: string
  className?: string
}

/**
 * A lit shelf of blank cases. Point at a case, or touch it, and the shelf's
 * light takes that case's color: the same thing the real shelf does with the
 * game in focus. The scene is a picture to assistive technology; the LED
 * color control next to it does the same job from the keyboard.
 */
export function DemoShelf({
  cases,
  narrowCount = cases.length,
  maxScale = 1.1,
  led,
  description,
  label,
  className,
}: DemoShelfProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = cases.find((item) => item.id === activeId)

  const sizes = {
    '--row-narrow': rowWidth(cases.slice(0, narrowCount)),
    '--row-wide': rowWidth(cases),
  } as CSSProperties

  const light = {
    '--led': active?.led ?? led,
    '--mm': `min(calc(100cqw / var(--row)), ${maxScale}px)`,
    gap: `calc(var(--mm) * ${CASE_GAP_MM})`,
  } as CSSProperties

  return (
    <div className={cn('@container', className)}>
      <div style={sizes} className="[--row:var(--row-narrow)] @xl:[--row:var(--row-wide)]">
        <Ledge
          role="img"
          aria-label={description}
          label={
            label ? (
              <ShelfLabel
                count={
                  <>
                    <span className="@xl:hidden">{Math.min(narrowCount, cases.length)}</span>
                    <span className="@max-xl:hidden">{cases.length}</span>
                  </>
                }
              >
                {label}
              </ShelfLabel>
            ) : null
          }
          style={light}
          itemsClassName="justify-center gap-[inherit]"
          className="pt-6"
          onPointerLeave={(event) => {
            // A finger leaves the moment it lifts. Keep its case lit until another is touched.
            if (event.pointerType !== 'touch') setActiveId(null)
          }}
        >
          {cases.map((item, index) => (
            <GameCase
              key={item.id}
              shape={item.shape}
              frame={item.frame}
              led={item.led}
              active={item.id === activeId}
              onPointerEnter={() => setActiveId(item.id)}
              className={cn(index >= narrowCount && '@max-xl:hidden')}
            >
              <CoverPlaceholder colors={item.art} />
            </GameCase>
          ))}
        </Ledge>
      </div>
    </div>
  )
}
