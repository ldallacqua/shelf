import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/ui/cn'

/** A ghost's turn in the wave that runs down a page. */
export const ghostOrder = (index: number) => ({ '--i': index }) as CSSProperties

type GhostProps = {
  className?: string
  /** Its turn in the wave. */
  order?: number
}

/**
 * The place of something on its way (spec 3.10), with the size and shape of
 * what replaces it, so nothing moves when it arrives. Its look is `.ghost`,
 * in shelf.css.
 */
export function Ghost({ className, order }: GhostProps) {
  return (
    <span
      className={cn('ghost', className)}
      style={order === undefined ? undefined : ghostOrder(order)}
    />
  )
}

/** A line of words on its way: as tall as a line of the type around it, whatever that is. */
export function GhostText({ className, order }: GhostProps) {
  return (
    <span className="flex h-[1lh] items-center">
      <Ghost className={cn('h-[0.7em]', className)} {...(order === undefined ? {} : { order })} />
    </span>
  )
}

/**
 * Something on its way, for everyone: the ghosts for the eye, and the words
 * saying so for assistive technology alone. A page never shows "Loading" in
 * words (spec 3.10). The ghosts lay out as if they were this element's own
 * children, so `className` is the layout of what replaces them.
 */
export function Loading({
  label,
  className,
  children,
}: {
  /** What is on its way, for a screen reader. */
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div aria-busy="true" className={className}>
      <p className="sr-only" role="status">
        {label}
      </p>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  )
}
