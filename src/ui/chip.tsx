import { CheckIcon } from 'lucide-react'
import type { ComponentProps } from 'react'

import { cn } from '@/ui/cn'

/**
 * A pill that is chosen or not: a status, a platform owned. Chosen, it fills
 * with the accent's tint and gains a tick, so the state shows by shape as
 * well as color.
 */
const chip = cn(
  'inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-sm select-none',
  'transition-[background-color,border-color,color] duration-quick ease-settle',
  'hover:border-muted hover:bg-text/5',
  'pointer-coarse:min-h-11',
)
const chosen = 'border-accent bg-accent/15 font-semibold hover:border-accent hover:bg-accent/20'

const tick = '-ml-0.5 size-4 flex-none text-accent'

type ChoiceChipProps = Omit<ComponentProps<'input'>, 'type'> & {
  type: 'radio' | 'checkbox'
}

/** A chip around the browser's own radio button or checkbox: one of a set, or any of a set. */
function ChoiceChip({ className, children, type, ...props }: ChoiceChipProps) {
  return (
    <label
      data-slot="choice-chip"
      className={cn(
        chip,
        'has-[:checked]:border-accent has-[:checked]:bg-accent/15 has-[:checked]:font-semibold',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
        'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
        className,
      )}
    >
      <input type={type} className="peer sr-only" {...props} />
      <CheckIcon
        aria-hidden="true"
        strokeWidth={2.5}
        className={cn(tick, 'hidden peer-checked:block')}
      />
      {children}
    </label>
  )
}

type ToggleChipProps = Omit<ComponentProps<'button'>, 'type' | 'aria-pressed'> & {
  pressed: boolean
}

/** A chip that is a button, pressed or not. */
function ToggleChip({ className, children, pressed, ...props }: ToggleChipProps) {
  return (
    <button
      data-slot="toggle-chip"
      type="button"
      aria-pressed={pressed}
      className={cn(
        chip,
        pressed && chosen,
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {pressed ? <CheckIcon aria-hidden="true" strokeWidth={2.5} className={tick} /> : null}
      {children}
    </button>
  )
}

export { ChoiceChip, ToggleChip }
