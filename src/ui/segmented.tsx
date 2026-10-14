'use client'

import { ToggleGroup } from 'radix-ui'
import { useEffect, useState, type ComponentProps, type ReactNode } from 'react'

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
 * True from two frames after the caller mounts.
 *
 * A group that remembers a choice (the theme, how boxes stand) is drawn by the
 * server in its default state and corrected as it hydrates. The page's own
 * `data-ready` mark cannot hide that: Next.js hydrates a page's content after
 * its layout, so on the home page the correction lands after the mark. The
 * correction is part of the group's own first commit, so two frames after the
 * group mounts it has painted.
 */
function useSettled(): boolean {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setSettled(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])
  return settled
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
  const settled = useSettled()
  return (
    <ToggleGroup.Root
      data-slot="segmented"
      data-settled={settled ? '' : undefined}
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
        // Only once the group has settled; see useSettled. The length and curve
        // wait too: on their own they would animate every property.
        'in-data-settled:transition-colors in-data-settled:duration-quick in-data-settled:ease-settle',
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
