'use client'

import { Tabs as Primitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/ui/cn'

/**
 * Tabs: a row of labels, one panel shown. Arrow keys move between the
 * labels; the panel follows. Drawn like the segmented control, which is
 * the same idea for a setting rather than a place.
 */

const Tabs = Primitive.Root

function TabsList({ className, ...props }: ComponentProps<typeof Primitive.List>) {
  return (
    <Primitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex w-fit items-center gap-0.5 rounded-control border border-line-strong bg-surface p-0.5',
        className,
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-[4px] px-3 text-sm font-medium whitespace-nowrap text-muted select-none pointer-coarse:h-10',
        'transition-colors duration-quick ease-settle hover:text-text focus-visible:z-10',
        'data-[state=active]:bg-accent data-[state=active]:text-on-accent',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Content
      data-slot="tabs-content"
      className={cn('outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
