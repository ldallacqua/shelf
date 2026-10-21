'use client'

import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { Select as Primitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/ui/cn'
import { fieldClass } from '@/ui/field'

/**
 * A choice of one from a list, drawn by the page rather than the browser: a
 * button that looks like a field, and a list that opens beside it. Type to
 * jump to an option; arrow keys move; Enter or a click chooses; Escape
 * closes without changing anything. Values are strings.
 */
const Select = Primitive.Root
const SelectGroup = Primitive.Group
/** What the button shows: the chosen option's text, or `placeholder` while none is chosen. */
const SelectValue = Primitive.Value

function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      data-slot="select-trigger"
      className={cn(
        fieldClass,
        // A button, not a text box, so a phone never zooms into it: the smaller size everywhere.
        'group/select flex h-10 cursor-pointer items-center justify-between gap-2 text-left text-sm pointer-coarse:h-11',
        'hover:bg-surface-raised data-[placeholder]:text-muted',
        'data-[state=open]:border-accent',
        // The chosen option's text stays on one line, and gives way to the arrow.
        '[&>span]:min-w-0 [&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <Primitive.Icon asChild>
        <ChevronDownIcon
          aria-hidden="true"
          // The trigger's own state: a sheet around it is "open" too.
          className="size-4 flex-none text-muted duration-quick ease-settle group-data-[state=open]/select:rotate-180 motion-safe:transition-transform"
        />
      </Primitive.Icon>
    </Primitive.Trigger>
  )
}

const scrollButton = 'flex h-6 cursor-default items-center justify-center text-muted'

function SelectContent({
  className,
  children,
  position = 'popper',
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={position === 'popper' ? sideOffset : undefined}
        className={cn(
          'relative z-50 max-h-(--radix-select-content-available-height) overflow-hidden',
          'origin-(--radix-select-content-transform-origin)',
          'rounded-panel border border-line bg-surface-raised text-text shadow-panel',
          'motion-safe:data-[state=open]:animate-menu-in motion-reduce:data-[state=open]:animate-fade-in',
          position === 'popper' && 'max-w-[calc(100vw-2rem)] min-w-(--radix-select-trigger-width)',
          className,
        )}
        {...props}
      >
        <Primitive.ScrollUpButton className={scrollButton}>
          <ChevronUpIcon aria-hidden="true" className="size-4" />
        </Primitive.ScrollUpButton>
        <Primitive.Viewport className="p-1">{children}</Primitive.Viewport>
        <Primitive.ScrollDownButton className={scrollButton}>
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </Primitive.ScrollDownButton>
      </Primitive.Content>
    </Primitive.Portal>
  )
}

type SelectItemProps = ComponentProps<typeof Primitive.Item> & {
  /**
   * More about the option, drawn under its text in the list but never in the
   * button: a game's year and platforms, say.
   */
  detail?: ReactNode
  /** Drawn before the option's text in the list only: a cover, say. */
  media?: ReactNode
}

function SelectItem({ className, children, detail, media, ...props }: SelectItemProps) {
  return (
    <Primitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex min-h-9 cursor-default items-center gap-3 rounded-[4px] py-1.5 pr-9 pl-2.5 text-sm outline-none select-none',
        'pointer-coarse:min-h-11',
        'data-[highlighted]:bg-text/8',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        'data-[state=checked]:font-semibold',
        className,
      )}
      {...props}
    >
      {media}
      <span className="grid min-w-0 gap-0.5">
        <Primitive.ItemText>{children}</Primitive.ItemText>
        {detail ? <span className="text-xs font-normal text-muted">{detail}</span> : null}
      </span>
      <span className="absolute right-2.5 flex size-4 items-center justify-center text-accent">
        <Primitive.ItemIndicator>
          <CheckIcon aria-hidden="true" className="size-4" />
        </Primitive.ItemIndicator>
      </span>
    </Primitive.Item>
  )
}

function SelectLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      data-slot="select-label"
      className={cn('px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted', className)}
      {...props}
    />
  )
}

function SelectSeparator({ className, ...props }: ComponentProps<typeof Primitive.Separator>) {
  return (
    <Primitive.Separator
      data-slot="select-separator"
      className={cn('-mx-1 my-1 h-px bg-line', className)}
      {...props}
    />
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
