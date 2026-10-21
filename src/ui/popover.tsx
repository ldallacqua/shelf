'use client'

import { Popover as Primitive } from 'radix-ui'
import type { ComponentProps } from 'react'

import { cn } from '@/ui/cn'

/**
 * A small panel that opens from a button and stays beside it: a calendar,
 * say. Escape or a click outside closes it, and focus goes back to the
 * button.
 */
const Popover = Primitive.Root
const PopoverTrigger = Primitive.Trigger
const PopoverClose = Primitive.Close

function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={16}
        className={cn(
          'z-50 origin-(--radix-popover-content-transform-origin) rounded-panel border border-line bg-surface-raised p-3 text-text shadow-panel',
          'motion-safe:data-[state=open]:animate-menu-in motion-reduce:data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  )
}

export { Popover, PopoverClose, PopoverContent, PopoverTrigger }
