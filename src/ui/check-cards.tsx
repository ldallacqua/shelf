'use client'

import { CheckIcon } from 'lucide-react'
import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/ui/cn'

type CheckCardsProps = ComponentProps<'fieldset'> & {
  /** What the set asks, read first by assistive technology. */
  legend: ReactNode
  /** Shown to everyone, or only to assistive technology when the page's heading already asks it. */
  legendHidden?: boolean
}

/**
 * A set of cards where any number may be chosen, each a checkbox with an icon, a name and a few
 * words: the many-of-a-set sibling of `ChoiceCards`. Tab reaches each card and Space chooses it,
 * as the browser's own checkboxes do.
 */
function CheckCards({ legend, legendHidden, className, children, ...props }: CheckCardsProps) {
  return (
    <fieldset data-slot="check-cards" className={cn('min-w-0', className)} {...props}>
      <legend className={cn('mb-3 text-sm font-medium', legendHidden && 'sr-only')}>
        {legend}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

type CheckCardProps = Omit<ComponentProps<'input'>, 'type' | 'children'> & {
  label: ReactNode
  /** A few words under the name: what choosing it leads to. */
  detail?: ReactNode
  /** An icon beside the name. Hidden from assistive technology: the name says it. */
  icon?: ReactNode
}

function CheckCard({ label, detail, icon, className, ...props }: CheckCardProps) {
  const id = useId()
  return (
    <label
      data-slot="check-card"
      className={cn(
        'group relative flex min-h-16 cursor-pointer items-center gap-3 rounded-panel border border-line bg-surface p-3.5 pr-11',
        'transition-[border-color,background-color,box-shadow] duration-quick ease-settle hover:border-line-strong',
        // Chosen: a thicker edge in the accent, a tinted face and a tick, never color alone.
        'has-checked:border-accent has-checked:bg-accent/10 has-checked:shadow-[inset_0_0_0_1px_var(--accent)]',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus',
        'has-disabled:cursor-not-allowed has-disabled:opacity-50',
        className,
      )}
    >
      <input
        type="checkbox"
        aria-labelledby={`${id}-label`}
        aria-describedby={detail ? `${id}-detail` : undefined}
        className="peer sr-only"
        {...props}
      />
      {icon ? (
        <span
          aria-hidden="true"
          className="grid size-10 flex-none place-items-center rounded-control bg-text/6 text-text group-has-checked:bg-accent/20 [&_svg]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <span className="grid min-w-0 gap-0.5">
        <span id={`${id}-label`} className="font-medium text-text">
          {label}
        </span>
        {detail ? (
          <span id={`${id}-detail`} className="text-sm text-pretty text-muted">
            {detail}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute top-1/2 right-3.5 grid size-5 -translate-y-1/2 place-items-center rounded-[5px] border border-line-strong text-on-accent',
          'peer-checked:border-accent peer-checked:bg-accent',
        )}
      >
        <CheckIcon strokeWidth={3} className="size-3.5 opacity-0 group-has-checked:opacity-100" />
      </span>
    </label>
  )
}

export { CheckCard, CheckCards }
