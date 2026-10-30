'use client'

import { Slot, Tooltip as Primitive } from 'radix-ui'
import {
  createContext,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  useContext,
  useEffect,
} from 'react'

import { cn } from '@/ui/cn'

/**
 * A few words beside a control, on hover and on keyboard focus: what a button
 * that shows only an icon or a mark does. Never the browser's own `title`,
 * which shows late, in the system's type, never on focus, and only to a
 * mouse. Escape hides it; a touch never opens it.
 */

const Shared = createContext(false)

/**
 * One timer for every tip inside it: once one has opened, the next opens at
 * once as the pointer moves along a row of buttons. The layout holds one; a
 * tip outside it brings its own.
 */
function TipProvider({ children }: { children: ReactNode }) {
  return (
    <Primitive.Provider delayDuration={400} skipDelayDuration={300}>
      <Shared value>{children}</Shared>
    </Primitive.Provider>
  )
}

const MOVING_KEYS = new Set([
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

/**
 * Whether focus last moved by the keys that move it. Focus a sheet, a menu or
 * a click put on a button shows no tip: the sheet's close button would greet
 * every opening with one, and Escape would close the tip, not the sheet.
 */
let movedByKeys = false
let listening = false

const listen = () => {
  if (listening) return
  listening = true
  document.addEventListener('keydown', (event) => (movedByKeys = MOVING_KEYS.has(event.key)), true)
  document.addEventListener('pointerdown', () => (movedByKeys = false), true)
}

type TriggerProps = {
  children: ReactNode
  describes: boolean
  ref?: Ref<HTMLElement>
  onFocus?: (event: FocusEvent<HTMLElement>) => void
  'aria-describedby'?: string
  'data-state'?: string
}

/**
 * What the tip's trigger hands its control, less two things. Its `data-state`
 * would take the place of the control's own (a toggle's "on", a menu's
 * "open"), and its description repeats a name that already says the words.
 */
function Trigger({
  children,
  describes,
  onFocus,
  'aria-describedby': description,
  'data-state': _,
  ...props
}: TriggerProps) {
  return (
    <Slot.Root
      {...props}
      {...(describes && description ? { 'aria-describedby': description } : {})}
      onFocus={(event: FocusEvent<HTMLElement>) => {
        if (!movedByKeys) event.preventDefault()
        onFocus?.(event)
      }}
    >
      {children}
    </Slot.Root>
  )
}

type TipProps = {
  /** What the control does, in a few words. */
  label: ReactNode
  /** The control: one element that takes a ref, such as a button or a link. */
  children: ReactElement
  /**
   * The words are not the control's name already, so they are read as its
   * description too: what pressing it does, beside a name that says its
   * state. Otherwise they are shown only, and a screen reader hears the name
   * once.
   */
  describes?: boolean
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** For the tip itself: `md:hidden` where the control's own words show from that width. */
  className?: string
}

function Tip({
  label,
  children,
  describes = false,
  side = 'top',
  align = 'center',
  className,
}: TipProps) {
  const shared = useContext(Shared)
  useEffect(listen, [])
  const tip = (
    <Primitive.Root>
      <Primitive.Trigger asChild>
        <Trigger describes={describes}>{children}</Trigger>
      </Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          data-slot="tip"
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'z-60 max-w-60 origin-(--radix-tooltip-content-transform-origin) rounded-control border border-line bg-surface-raised px-2.5 py-1.5',
            'text-xs leading-snug font-semibold text-pretty text-text shadow-panel select-none',
            'motion-safe:animate-tip-in motion-reduce:animate-fade-in',
            className,
          )}
        >
          {label}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
  return shared ? tip : <TipProvider>{tip}</TipProvider>
}

export { Tip, TipProvider }
