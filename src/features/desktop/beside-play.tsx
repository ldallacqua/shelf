'use client'

import { type ReactNode, type RefObject, useSyncExternalStore } from 'react'

import { GAME_CENTERED } from '@/features/game-detail/hero'
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/popover'
import { Sheet, SheetContent } from '@/ui/sheet'

const onResize = (change: () => void) => {
  const query = window.matchMedia(GAME_CENTERED)
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}

/**
 * What opens from Play's menu on a game's page in the app: a sheet, as anything opened from a game is;
 * but where the game stands in the middle of a very wide window, a sheet would be a second frame at the
 * far edge of the screen, so it opens beside the button, over the game and not apart.
 */
export function BesidePlay({
  heading,
  closeLabel,
  open,
  onOpenChange,
  anchor,
  children,
}: {
  heading: string
  closeLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What it stands beside when it opens in place. */
  anchor: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const inPlace = useSyncExternalStore(
    onResize,
    () => window.matchMedia(GAME_CENTERED).matches,
    () => false,
  )
  if (inPlace) {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverAnchor virtualRef={anchor as RefObject<HTMLElement>} />
        <PopoverContent
          align="end"
          aria-label={heading}
          className="scrollbar-quiet grid max-h-[min(70dvh,44rem)] w-[36rem] max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto p-5"
          // The menu it was opened from hands focus back as it goes, which is no click away.
          onFocusOutside={(event) => event.preventDefault()}
        >
          <h2 className="title text-lg text-balance">{heading}</h2>
          {children}
        </PopoverContent>
      </Popover>
    )
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={heading} closeLabel={closeLabel}>
        {children}
      </SheetContent>
    </Sheet>
  )
}
