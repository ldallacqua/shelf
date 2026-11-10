'use client'

import { CheckIcon } from 'lucide-react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import { createContext, useContext, useRef, useState, type ComponentProps } from 'react'

import { cn } from '@/ui/cn'

/** What the trigger needs of its menu: whether it is open, and how to open or close it. */
const Opening = createContext<{ open: boolean; change: (open: boolean) => void } | null>(null)

/**
 * A menu that opens from a button. It does not lock the page behind it: the
 * page stays scrollable and readable, and a click outside closes the menu.
 */
function DropdownMenu({
  modal = false,
  open: given,
  defaultOpen = false,
  onOpenChange,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  const [own, setOwn] = useState(defaultOpen)
  const open = given ?? own
  const change = (next: boolean) => {
    if (given === undefined) setOwn(next)
    onOpenChange?.(next)
  }
  return (
    <Opening value={{ open, change }}>
      <DropdownMenuPrimitive.Root modal={modal} open={open} onOpenChange={change} {...props} />
    </Opening>
  )
}

/**
 * The menu's button. It opens on the click, as a menu button does, not on the press as Radix's own:
 * opened on the press, the menu could come up under the pointer before it is let go, and the
 * release chose the item there. Seen in the app, where a click on Play's ⋯ opened Saves. The keys
 * still open it as Radix does: a key's click has no detail, and is left alone.
 */
function DropdownMenuTrigger({
  onPointerDown,
  onClick,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  const menu = useContext(Opening)
  // Whether it was open as the pointer went down on it: a press outside the menu may close it first.
  const pressed = useRef<boolean | null>(null)
  return (
    <DropdownMenuPrimitive.Trigger
      onPointerDown={(event) => {
        onPointerDown?.(event)
        if (!menu || event.defaultPrevented || event.button !== 0 || event.ctrlKey) return
        pressed.current = menu.open
        // Radix's own opening is passed by; the focus stays where it was, as Radix leaves it.
        event.preventDefault()
      }}
      onClick={(event) => {
        onClick?.(event)
        if (!menu || event.defaultPrevented || event.detail === 0) return
        const wasOpen = pressed.current ?? menu.open
        pressed.current = null
        menu.change(!wasOpen)
      }}
      {...props}
    />
  )
}
const DropdownMenuGroup = DropdownMenuPrimitive.Group
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-40 overflow-y-auto',
          'origin-(--radix-dropdown-menu-content-transform-origin)',
          'rounded-panel border border-line bg-surface-raised p-1 text-text shadow-panel',
          'motion-safe:data-[state=open]:animate-menu-in motion-reduce:data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

const itemClass = cn(
  'relative flex min-h-9 cursor-default items-center gap-2 rounded-[4px] px-2.5 py-1.5 text-sm select-none',
  'pointer-coarse:min-h-11',
  '-outline-offset-2 data-[highlighted]:bg-text/8',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
)

function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(itemClass, className)}
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(itemClass, 'pr-9', className)}
      {...props}
    >
      {children}
      <span className="absolute right-2.5 flex size-4 items-center justify-center text-accent">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon aria-hidden="true" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('px-2.5 pt-1.5 pb-1 text-xs font-medium text-muted', className)}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-line', className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
