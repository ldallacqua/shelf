import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/ui/cn'

type LedgeProps = Omit<ComponentProps<'div'>, 'children'> & {
  /** What stands on the shelf. */
  children?: ReactNode
  /** A label clipped to the front of the shelf. */
  label?: ReactNode
  /** Classes for the row the items stand in, for example a height when it is empty. */
  itemsClassName?: string
}

/**
 * One stretch of wall with a shelf at its foot, lit from behind by the shelf's
 * LED bar. Its light comes from the lighting tokens, so it needs nothing to
 * change theme. Set `--led` in `style` to give this shelf its own light color.
 */
function Ledge({ children, label, className, itemsClassName, ...props }: LedgeProps) {
  return (
    <div data-slot="ledge" className={cn('bay', className)} {...props}>
      <div aria-hidden="true" className="bay-glow" />
      <div className={cn('bay-items', itemsClassName)}>{children}</div>
      <div className="ledge">
        {label ? <div className="absolute top-0 left-3">{label}</div> : null}
      </div>
    </div>
  )
}

type ShelfLabelProps = ComponentProps<'span'> & {
  /** A number shown after the name, for example how many games the shelf holds. */
  count?: ReactNode
}

/** Names a shelf, and optionally counts what is on it. */
function ShelfLabel({ children, count, className, ...props }: ShelfLabelProps) {
  return (
    <span data-slot="shelf-label" className={cn('shelf-label', className)} {...props}>
      <span>{children}</span>
      {count === undefined ? null : <span className="shelf-label-count">{count}</span>}
    </span>
  )
}

export { Ledge, ShelfLabel }
