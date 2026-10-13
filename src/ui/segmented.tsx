'use client'

import { ToggleGroup } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/ui/cn'

type SegmentedProps<Value extends string> = Omit<
  ComponentProps<typeof ToggleGroup.Root>,
  'type' | 'value' | 'defaultValue' | 'onValueChange'
> & {
  /** Names the group for assistive technology. */
  'aria-label': string
  value: Value
  onValueChange: (value: Value) => void
  children: ReactNode
}

/**
 * A row of labeled buttons where exactly one is pressed: Shelf, Wall, List.
 * Arrow keys move between the buttons; the pressed one cannot be un-pressed.
 */
function Segmented<Value extends string>({
  className,
  value,
  onValueChange,
  children,
  ...props
}: SegmentedProps<Value>) {
  return (
    <ToggleGroup.Root
      data-slot="segmented"
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onValueChange(next as Value)
      }}
      className={cn(
        'inline-flex w-fit items-center gap-0.5 rounded-control border border-line-strong bg-surface p-0.5',
        className,
      )}
      {...props}
    >
      {children}
    </ToggleGroup.Root>
  )
}

function SegmentedItem({ className, ...props }: ComponentProps<typeof ToggleGroup.Item>) {
  return (
    <ToggleGroup.Item
      data-slot="segmented-item"
      className={cn(
        'inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-[4px] px-3 text-sm font-medium whitespace-nowrap text-muted select-none',
        'pointer-coarse:h-10',
        'transition-colors duration-quick ease-settle',
        'hover:text-text focus-visible:z-10',
        'data-[state=on]:bg-accent data-[state=on]:text-on-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    />
  )
}

export { Segmented, SegmentedItem }
