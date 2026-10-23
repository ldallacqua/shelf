'use client'

import { XIcon } from 'lucide-react'
import { Dialog } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/ui/cn'

/**
 * A panel that slides in over the page: up from the bottom on a phone (and,
 * `upright`, on a tablet held upright), in from the right on anything wider.
 * It holds focus while open, closes on
 * Escape or a click outside, and hands focus back to what opened it.
 */
const Sheet = Dialog.Root
const SheetTrigger = Dialog.Trigger
const SheetClose = Dialog.Close
/** The sheet's name, placed by the content itself when it draws its own heading. */
const SheetTitle = Dialog.Title

type SheetContentProps = Omit<ComponentProps<typeof Dialog.Content>, 'title'> & {
  /**
   * The sheet's name. Read by assistive technology, and shown unless
   * `titleHidden`. Leave it out only when the content holds a `SheetTitle`.
   */
  title?: ReactNode
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
  /** A row that stays at the foot, outside the part that scrolls, so it covers nothing. */
  footer?: ReactNode
  /**
   * The content runs to the sheet's edges, under a close button that floats
   * over it: for content that starts with a picture.
   */
  bleed?: boolean
  /**
   * More buttons for the sheet as a whole, drawn left of the close button and
   * reached after it. Give each the look of `sheetButton`.
   */
  actions?: ReactNode
  /**
   * In place of the grip drawn at the top on a phone: one that does
   * something, such as a button that changes the sheet's height. It comes
   * after the close button, so focus starts there; place it with its own style.
   */
  grip?: ReactNode
  /**
   * On a tablet held upright too, it rises from the bottom as on a phone
   * (`SHEET_FROM_BOTTOM`), for content the page behind should stay wide for.
   */
  upright?: boolean
}

/**
 * What a sheet draws once it stands down the right edge: from tablet width
 * up, or, `upright`, only where `sheet-side` says.
 */
const placing = {
  phone: {
    from: '[--sheet-from:0_100%] sm:[--sheet-from:100%_0]',
    side: 'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[26rem] sm:max-w-[90vw] sm:rounded-none sm:border-t-0 sm:border-l sm:pb-0',
    bottomOnly: 'sm:hidden',
    header: 'sm:pt-5',
  },
  upright: {
    from: '[--sheet-from:0_100%] sheet-side:[--sheet-from:100%_0]',
    side: 'sheet-side:inset-y-0 sheet-side:right-0 sheet-side:left-auto sheet-side:max-h-none sheet-side:w-[26rem] sheet-side:max-w-[90vw] sheet-side:rounded-none sheet-side:border-t-0 sheet-side:border-l sheet-side:pb-0',
    bottomOnly: 'sheet-side:hidden',
    header: 'sheet-side:pt-5',
  },
}

/** The look of the close button, for buttons and links beside it. */
const sheetButton = (bleed?: boolean) =>
  cn(
    'inline-flex size-10 flex-none items-center justify-center rounded-control text-muted',
    'transition-colors duration-quick ease-settle hover:bg-text/8 hover:text-text',
    'pointer-coarse:size-11',
    bleed && 'rounded-full bg-surface/80 text-text shadow-panel backdrop-blur-sm hover:bg-surface',
  )

function SheetContent({
  className,
  children,
  title,
  titleHidden,
  description,
  closeLabel,
  scrim = true,
  footer,
  bleed,
  actions,
  grip,
  upright,
  ...props
}: SheetContentProps) {
  const place = placing[upright ? 'upright' : 'phone']
  // The close button comes first, where focus starts; the rest stand to its left.
  const buttons = (
    <div
      className={cn(
        'flex flex-none flex-row-reverse gap-2',
        bleed ? 'absolute top-3 right-3 z-10' : '-mt-1 -mr-2 ml-auto',
      )}
    >
      <Dialog.Close aria-label={closeLabel} className={sheetButton(bleed)}>
        <XIcon aria-hidden="true" className="size-4" />
      </Dialog.Close>
      {actions}
    </div>
  )

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
          place.from,
          // Phone: from the bottom, as tall as its content up to most of the screen.
          'inset-x-0 bottom-0 max-h-[86dvh] rounded-t-panel border-t pb-[env(safe-area-inset-bottom)]',
          // Wider: a column down the right edge.
          place.side,
          'motion-safe:data-[state=closed]:animate-sheet-out motion-safe:data-[state=open]:animate-sheet-in',
          'motion-reduce:data-[state=closed]:animate-sheet-fade-out motion-reduce:data-[state=open]:animate-fade-in',
          className,
        )}
        {...props}
      >
        {/* A grip, on a phone, where a thumb expects one. */}
        {grip ? null : (
          <span
            aria-hidden="true"
            className={cn(
              'mx-auto mt-2 h-1 w-9 flex-none rounded-full bg-line-strong',
              place.bottomOnly,
              bleed && 'absolute inset-x-0 top-0 z-10 bg-text/40',
            )}
          />
        )}
        {bleed ? (
          <>
            {title === undefined ? null : <Dialog.Title className="sr-only">{title}</Dialog.Title>}
            {buttons}
          </>
        ) : (
          <div
            className={cn(
              'flex flex-none items-start justify-between gap-3 px-5 pt-3',
              place.header,
            )}
          >
            {title === undefined ? null : (
              <Dialog.Title className={cn('title text-xl text-balance', titleHidden && 'sr-only')}>
                {title}
              </Dialog.Title>
            )}
            {buttons}
          </div>
        )}
        {/* After the close button, where focus starts; placed at the top by its own style. */}
        {grip}
        {description ? (
          <Dialog.Description className="sr-only">{description}</Dialog.Description>
        ) : null}
        <div
          data-sheet-body=""
          className={cn(
            'min-h-0 flex-1 overflow-y-auto overscroll-contain',
            bleed ? '' : 'px-5 pt-2 pb-6',
          )}
        >
          {children}
        </div>
        {footer ? (
          <div
            data-sheet-footer=""
            className="flex flex-none items-center justify-between gap-3 border-t border-line bg-surface px-5 pt-3 pb-4"
          >
            {footer}
          </div>
        ) : null}
      </Dialog.Content>
    </Dialog.Portal>
  )
}

export { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger, sheetButton }
