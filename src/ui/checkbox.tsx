import { CheckIcon } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/ui/cn'

/**
 * A checkbox, a radio button and a switch, drawn by the page. Each is the
 * browser's own input underneath, with its keys, its form value and its
 * name from a label, so they cost no script. State shows by shape as well
 * as color: a tick, a dot, a thumb that moves.
 */

type BoxProps = Omit<ComponentProps<'input'>, 'type'>

const box = cn(
  'peer cursor-pointer appearance-none border border-line-strong bg-surface',
  'transition-[background-color,border-color] duration-quick ease-settle',
  'checked:border-accent hover:border-muted',
  'disabled:cursor-not-allowed disabled:opacity-50',
)

function Checkbox({ className, ...props }: BoxProps) {
  return (
    <span
      data-slot="checkbox"
      className={cn('relative inline-flex size-5 flex-none items-center justify-center', className)}
    >
      <input
        type="checkbox"
        className={cn(box, 'size-5 rounded-[5px] checked:bg-accent')}
        {...props}
      />
      <CheckIcon
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute size-3.5 text-on-accent opacity-0 peer-checked:opacity-100"
      />
    </span>
  )
}

function Radio({ className, ...props }: BoxProps) {
  return (
    <span
      data-slot="radio"
      className={cn('relative inline-flex size-5 flex-none items-center justify-center', className)}
    >
      <input type="radio" className={cn(box, 'size-5 rounded-full')} {...props} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute size-2.5 rounded-full bg-accent opacity-0 transition-opacity duration-quick ease-settle peer-checked:opacity-100 motion-safe:scale-50 motion-safe:transition-[opacity,scale] motion-safe:peer-checked:scale-100"
      />
    </span>
  )
}

/** On or off, taking effect at once: a setting, not a choice to submit. */
function Switch({ className, ...props }: BoxProps) {
  return (
    <span
      data-slot="switch"
      className={cn('relative inline-flex h-6 w-10 flex-none items-center', className)}
    >
      <input
        type="checkbox"
        role="switch"
        className={cn(box, 'h-6 w-10 rounded-full bg-line checked:bg-accent')}
        {...props}
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-1 size-4 rounded-full bg-muted shadow-panel',
          'transition-colors duration-quick ease-settle motion-safe:transition-[translate,background-color]',
          'peer-checked:translate-x-4 peer-checked:bg-on-accent',
        )}
      />
    </span>
  )
}

export { Checkbox, Radio, Switch }
