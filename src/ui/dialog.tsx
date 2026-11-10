'use client'

import { XIcon } from 'lucide-react'
import { Dialog as Primitive } from 'radix-ui'
import { type ComponentProps, type ReactNode, type RefObject, useRef } from 'react'

import { cn } from '@/ui/cn'
import { Tip } from '@/ui/tooltip'

/**
 * What a menu's item, a button or a key opens over the page (ADR 009, decision 3): the one layer above
 * it. Centered on anything wider than a phone, as wide as its content asks; on a phone it rises from the
 * bottom and fills the screen, so a keyboard and a long list both have the room. It holds focus while
 * open, leaves the page behind it inert, closes on Escape, its close button or a press outside, and
 * hands focus back to a control that is still on the page.
 */
const Dialog = Primitive.Root
const DialogTrigger = Primitive.Trigger
const DialogClose = Primitive.Close

/** How wide it may grow on a wider screen: a form, a list to read, a review in rows, a two-pane task. */
const widths = {
  sm: 'sm:w-[28rem]',
  md: 'sm:w-[36rem]',
  lg: 'sm:w-[44rem]',
  xl: 'sm:w-[56rem]',
} as const

/** Where focus goes when it closes: a control, or the way to find one when it closes. */
type FocusTarget = RefObject<HTMLElement | null> | (() => HTMLElement | null | undefined)

type DialogContentProps = Omit<ComponentProps<typeof Primitive.Content>, 'title'> & {
  /** Its name, shown at the top and read by assistive technology. */
  title: ReactNode
  /** Keeps the title for assistive technology only, when the content shows one of its own. */
  titleHidden?: boolean
  /** One line of help for assistive technology. */
  description?: ReactNode
  /** The label of the close button. */
  closeLabel: string
  /** How wide it may grow on a wider screen. On a phone it is always the screen's width. */
  size?: keyof typeof widths
  /** A row that stays at the foot, outside the part that scrolls: a count, the task's buttons. */
  footer?: ReactNode
  /**
   * Where focus goes when it closes. By default the control that had focus as it opened; give one when
   * that control goes with what opened it, as a menu's item does.
   */
  returnFocus?: FocusTarget
}

const target = (to: FocusTarget | undefined) => (typeof to === 'function' ? to() : to?.current)

/** The look of the close button, for buttons beside it. */
const dialogButton = cn(
  'inline-flex size-10 flex-none items-center justify-center rounded-control text-muted',
  'transition-colors duration-quick ease-settle hover:bg-text/8 hover:text-text',
  'pointer-coarse:size-11',
)

function DialogContent({
  className,
  children,
  title,
  titleHidden,
  description,
  closeLabel,
  size = 'md',
  footer,
  returnFocus,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onInteractOutside,
  ...props
}: DialogContentProps) {
  const opener = useRef<Element | null>(null)
  return (
    <Primitive.Portal>
      <Primitive.Overlay
        data-slot="dialog-overlay"
        className={cn(
          'fixed inset-0 z-40 bg-scrim',
          'data-[state=closed]:animate-dialog-fade-out data-[state=open]:animate-fade-in',
        )}
      />
      <Primitive.Content
        data-slot="dialog"
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fixed inset-0 z-50 flex flex-col overflow-hidden bg-surface text-text',
          // A phone: the whole screen, risen from the bottom, clear of the notch and the home bar.
          'h-dvh w-full pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] [--dialog-from:0_100%]',
          // Wider: in the middle, with a margin of the page all round, as tall as it needs to be.
          'sm:m-auto sm:h-fit sm:max-h-[calc(100dvh-2rem)] sm:max-w-[calc(100vw-2rem)] sm:py-0',
          'sm:rounded-panel sm:border sm:border-line sm:shadow-panel sm:[--dialog-fade:0] sm:[--dialog-from:0_1.5rem]',
          widths[size],
          'motion-safe:data-[state=closed]:animate-dialog-out motion-safe:data-[state=open]:animate-dialog-in',
          'motion-reduce:data-[state=closed]:animate-dialog-fade-out motion-reduce:data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
        onOpenAutoFocus={(event) => {
          // Still the control that opened it: focus moves in only after this.
          opener.current = document.activeElement
          onOpenAutoFocus?.(event)
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event)
          if (event.defaultPrevented) return
          event.preventDefault()
          // A menu's item, or a notice, may be gone by now: then what survives it, or nothing.
          const back =
            target(returnFocus) ??
            (opener.current instanceof HTMLElement && opener.current.isConnected
              ? opener.current
              : null)
          back?.focus()
        }}
        onEscapeKeyDown={(event) => {
          // A question asked in place answers Escape itself, and the dialog stays.
          if (event.target instanceof Element && event.target.closest('[data-confirming]')) {
            event.preventDefault()
          }
          onEscapeKeyDown?.(event)
        }}
        onInteractOutside={(event) => {
          // A notice raised from inside it (its Undo, its Open) is part of what it did, not a press
          // away from it.
          if (event.target instanceof Element && event.target.closest('[data-notice]')) {
            event.preventDefault()
          }
          onInteractOutside?.(event)
        }}
      >
        <div className="flex flex-none items-start gap-3 py-3 pr-3 pl-5 sm:pt-4">
          <Primitive.Title
            className={cn(
              'min-w-0 flex-1 pt-1.5 title text-xl text-balance',
              titleHidden && 'sr-only',
            )}
          >
            {title}
          </Primitive.Title>
          {/* First in the dialog, where focus starts, and at the top, so nothing scrolls away. */}
          <Tip label={closeLabel}>
            <Primitive.Close aria-label={closeLabel} className={cn(dialogButton, 'ml-auto')}>
              <XIcon aria-hidden="true" className="size-4" />
            </Primitive.Close>
          </Tip>
        </div>
        {description ? (
          <Primitive.Description className="sr-only">{description}</Primitive.Description>
        ) : null}
        <div
          data-dialog-body=""
          className={cn(
            // A bar that sticks to its foot goes down over the 1.5rem (`-bottom-6 -mb-6`).
            'scrollbar-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1',
            footer ? 'pb-5' : 'pb-6',
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            data-dialog-footer=""
            className="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-line px-5 pt-3 pb-4"
          >
            {footer}
          </div>
        ) : null}
      </Primitive.Content>
    </Primitive.Portal>
  )
}

export { Dialog, DialogClose, DialogContent, DialogTrigger, dialogButton }
