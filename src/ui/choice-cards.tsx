'use client'

import { CheckIcon } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useId, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/ui/cn'

type ChoiceCardsProps<Value extends string> = Omit<
  ComponentProps<typeof RadioGroup.Root>,
  'value' | 'defaultValue' | 'onValueChange' | 'orientation'
> & {
  value: Value
  onValueChange: (value: Value) => void
  children: ReactNode
}

/**
 * A set of cards where exactly one is chosen, each showing what it chooses, as
 * colorways do. A radio group: Tab reaches the chosen card, and the arrow keys
 * move between the cards and choose as they go.
 */
function ChoiceCards<Value extends string>({
  value,
  onValueChange,
  className,
  children,
  ...props
}: ChoiceCardsProps<Value>) {
  return (
    <RadioGroup.Root
      data-slot="choice-cards"
      value={value}
      onValueChange={(next) => onValueChange(next as Value)}
      className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', className)}
      {...props}
    >
      {children}
    </RadioGroup.Root>
  )
}

type ChoiceCardProps = Omit<ComponentProps<typeof RadioGroup.Item>, 'children'> & {
  /** The card's name, which is also its name to assistive technology. */
  label: ReactNode
  /** A few words under the name, which assistive technology reads after it as its description. */
  detail?: ReactNode
  /** What the choice looks like. Hidden from assistive technology: the words say it. */
  picture: ReactNode
}

function ChoiceCard({ label, detail, picture, className, ...props }: ChoiceCardProps) {
  const id = useId()
  return (
    <RadioGroup.Item
      data-slot="choice-card"
      aria-labelledby={`${id}-label`}
      aria-describedby={detail ? `${id}-detail` : undefined}
      className={cn(
        'group grid min-w-0 content-start gap-2 rounded-panel border border-line bg-surface p-1.5 text-left',
        'hover:border-line-strong',
        // Chosen: a thicker edge in the accent, and a check, so it never rests on color alone.
        'data-[state=checked]:border-accent data-[state=checked]:shadow-[inset_0_0_0_1px_var(--accent)]',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className="block overflow-hidden rounded-control">
        {picture}
      </span>
      <span className="flex items-start justify-between gap-2 px-1.5 pb-1">
        <span className="grid min-w-0 gap-0.5">
          <span id={`${id}-label`} className="text-sm font-medium text-text">
            {label}
          </span>
          {detail ? (
            <span id={`${id}-detail`} className="text-xs text-muted">
              {detail}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'mt-px grid size-5 shrink-0 place-items-center rounded-full border border-line-strong text-on-accent',
            'group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent',
          )}
        >
          <CheckIcon className="size-3.5 opacity-0 group-data-[state=checked]:opacity-100" />
        </span>
      </span>
    </RadioGroup.Item>
  )
}

export { ChoiceCard, ChoiceCards }
