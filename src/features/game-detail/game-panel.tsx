'use client'

import { ChevronLeftIcon, ChevronRightIcon, Maximize2Icon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type TouchEvent } from 'react'

import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform, LibraryTag } from '@/domain/library/library'
import { useShelf } from '@/features/library/shelf'
import { gameHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Sheet, SheetContent, SheetTitle, sheetButton } from '@/ui/sheet'

import { keptQuery } from './back-to-library'
import { GameDetail } from './game-detail'
import { useGameFacts } from './use-game-facts'

export { loadEditor } from './owner-mine'

/** How far a finger must travel sideways, more than up or down, to step to the next game. */
const SWIPE = 64

type GamePanelProps = {
  /** The game that is open, or nothing when the panel is closed. */
  item?: ShelfItem
  /** The library's version, which the game's facts are fetched for. */
  version: number
  platforms: ReadonlyMap<number, LibraryPlatform>
  /** The library's tags, which a game's tags are positions in. */
  tags: readonly LibraryTag[]
  /** The file the shelf shows for the open game's cover, drawn at once under the larger one. */
  placeholder?: string
  onClose: () => void
  /** Puts focus back on the shelf when the panel closes. Returns false if it could not. */
  onReturnFocus: () => boolean
  /** To the game before or after, in the library's current order. Absent at either end. */
  onPrevious?: () => void
  onNext?: () => void
  /** In 3D the box pulled from the wall is the cover, and the wall dims itself. */
  pulled?: boolean
}

/**
 * The game opened over the shelf (spec 7.2): its page, in a panel from the
 * right on a desktop or tablet and a sheet from the bottom on a phone. What
 * the library file knows is drawn at once; the summary, screenshots and the
 * rest follow as the game's facts arrive. The arrow keys, or a sideways
 * swipe on a phone, step through the library's current order.
 */
export function GamePanel({
  item,
  version,
  platforms,
  tags,
  placeholder,
  onClose,
  onReturnFocus,
  onPrevious,
  onNext,
  pulled,
}: GamePanelProps) {
  const t = useTranslations('Game')
  // The panel keeps showing the last game while it slides away.
  const [shown, setShown] = useState(item)
  if (item && item !== shown) setShown(item)
  const game = shown?.game
  const { handle, files } = useShelf()
  const facts = useGameFacts(files, version, game?.slug)
  const touch = useRef<{ x: number; y: number } | undefined>(undefined)
  const panel = useRef<HTMLDivElement>(null)
  const query = keptQuery(useSearchParams())

  // Stepping to another game starts at the top of its page.
  useEffect(() => {
    panel.current?.querySelector('[data-sheet-body]')?.scrollTo({ top: 0 })
  }, [game?.slug])

  const onTouchStart = (event: TouchEvent) => {
    const finger = event.touches[0]
    // The screenshots scroll sideways themselves.
    const inStrip = (event.target as Element).closest('.shot-strip')
    touch.current =
      finger && event.touches.length === 1 && !inStrip
        ? { x: finger.clientX, y: finger.clientY }
        : undefined
  }
  const onTouchEnd = (event: TouchEvent) => {
    const start = touch.current
    const finger = event.changedTouches[0]
    touch.current = undefined
    if (!start || !finger) return
    const dx = finger.clientX - start.x
    const dy = finger.clientY - start.y
    if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(dy) * 2) return
    if (dx < 0) onNext?.()
    else onPrevious?.()
  }

  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      {game ? (
        <SheetContent
          ref={panel}
          bleed
          description={t('panelHelp')}
          closeLabel={t('close')}
          scrim={!pulled}
          className="lg:w-[32rem]"
          data-game={game.slug}
          actions={
            // The game's own page, in place of the panel: Back from it is the library again.
            <Link
              href={gameHref(handle, game.slug, query)}
              replace
              aria-label={t('fullPage')}
              title={t('fullPage')}
              className={sheetButton(true)}
            >
              <Maximize2Icon aria-hidden="true" className="size-4" />
            </Link>
          }
          onCloseAutoFocus={(event) => {
            // Focus goes back to the box that was picked up, not to the top of the page.
            if (onReturnFocus()) event.preventDefault()
          }}
          onKeyDown={(event) => {
            // The arrows step through the library, as they do on the shelf.
            if (event.key === 'ArrowLeft' && onPrevious) onPrevious()
            else if (event.key === 'ArrowRight' && onNext) onNext()
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          footer={
            <>
              <Button variant="secondary" disabled={!onPrevious} onClick={onPrevious}>
                <ChevronLeftIcon aria-hidden="true" />
                {t('previous')}
              </Button>
              <Button variant="secondary" disabled={!onNext} onClick={onNext}>
                {t('next')}
                <ChevronRightIcon aria-hidden="true" />
              </Button>
            </>
          }
        >
          <GameDetail
            // A new game starts at its top.
            key={game.slug}
            handle={handle}
            game={game}
            tags={game.tags.flatMap((position) => tags[position] ?? [])}
            platforms={platforms}
            facts={facts.status === 'ready' ? facts.facts : undefined}
            failed={facts.status === 'failed'}
            layout="panel"
            cover={!pulled}
            placeholder={placeholder}
            heading={(heading) => <SheetTitle asChild>{heading}</SheetTitle>}
            editable
            // Removed, the game has no page to stay on: the panel closes, back to the shelf.
            onRemoved={onClose}
          />
        </SheetContent>
      ) : null}
    </Sheet>
  )
}
