'use client'

import { XIcon } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/ui/cn'

/**
 * A panel that slides in over the page: up from the bottom on a phone, in
 * from the right on anything wider. It holds focus while open, closes on
 * Escape or a click outside, and hands focus back to what opened it.
 */
const Sheet = Dialog.Root
const SheetTrigger = Dialog.Trigger
const SheetClose = Dialog.Close

type SheetContentProps = Omit<ComponentProps<typeof Dialog.Content>, 'title'> & {
  /** The sheet's name. Read by assistive technology, and shown unless `titleHidden`. */
  title: ReactNode
  /** Keeps the title for assistive technology only, when the content shows one of its own. */
  titleHidden?: boolean
  /** One line of help for assistive technology. */
  description?: ReactNode
  /** The label of the close button. */
  closeLabel: string
  /**
   * Whether the page behind is dimmed. Off where the page dims itself around
   * what the sheet is about, as the 3D shelf does around a pulled box. A
   * click outside still closes the sheet either way.
   */
  scrim?: boolean
}

function SheetContent({
  className,
  children,
  title,
  titleHidden,
  description,
  closeLabel,
  scrim = true,
  ...props
}: SheetContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay
        data-slot="sheet-overlay"
        className={cn(
          'fixed inset-0 z-40',
          scrim && 'bg-scrim',
          'data-[state=closed]:animate-sheet-fade-out data-[state=open]:animate-fade-in',
        )}
      />
      <Dialog.Content
        data-slot="sheet"
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden border-line bg-surface text-text shadow-panel',
          '[--sheet-from:0_100%] sm:[--sheet-from:100%_0]',
          // Phone: from the bottom, as tall as its content up to most of the screen.
          'inset-x-0 bottom-0 max-h-[86dvh] rounded-t-panel border-t pb-[env(safe-area-inset-bottom)]',
          // Wider: a column down the right edge.
          'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[26rem] sm:max-w-[90vw] sm:rounded-none sm:border-t-0 sm:border-l sm:pb-0',
          'motion-safe:data-[state=closed]:animate-sheet-out motion-safe:data-[state=open]:animate-sheet-in',
          'motion-reduce:data-[state=closed]:animate-sheet-fade-out motion-reduce:data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      >
        {/* A grip, on a phone, where a thumb expects one. */}
        <span
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-9 flex-none rounded-full bg-line-strong sm:hidden"
        />
        <div className="flex flex-none items-start justify-between gap-3 px-5 pt-3 sm:pt-5">
          <Dialog.Title className={cn('title text-xl text-balance', titleHidden && 'sr-only')}>
            {title}
          </Dialog.Title>
          <Dialog.Close
            aria-label={closeLabel}
            className={cn(
              '-mt-1 -mr-2 ml-auto inline-flex size-10 flex-none items-center justify-center rounded-control text-muted',
              'transition-colors duration-quick ease-settle hover:bg-text/8 hover:text-text',
              'pointer-coarse:size-11',
            )}
          >
            <XIcon aria-hidden="true" className="size-4" />
          </Dialog.Close>
        </div>
        {description ? (
          <Dialog.Description className="sr-only">{description}</Dialog.Description>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-6">
          {children}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  )
}

export { Sheet, SheetClose, SheetContent, SheetTrigger }
