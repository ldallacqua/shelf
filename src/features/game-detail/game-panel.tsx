'use client'

import { ChevronLeftIcon, ChevronRightIcon, Maximize2Icon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, type PointerEvent, type TouchEvent } from 'react'

import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform, LibraryTag } from '@/domain/library/library'
import { useShelf } from '@/features/library/shelf'
import { gameHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Sheet, SheetContent, SheetTitle, sheetButton } from '@/ui/sheet'
import { SHEET_FROM_BOTTOM } from '@/ui/sheet-from-bottom'
import { Tip } from '@/ui/tooltip'

import { keptQuery } from './back-to-library'
import { GameDetail } from './game-detail'
import { useGameFacts } from './use-game-facts'

export { loadEditor } from './owner-mine'

/** How far a finger must travel sideways, more than up or down, to step to the next game. */
const SWIPE = 64
/** How far a drag up or down must go to take the sheet to its other height, or away. */
const DRAG = 56
/** A press that moves less than this is a tap. */
const TAP = 8

/**
 * Rising from the bottom, on a phone or a tablet held upright, the sheet has
 * two heights (spec 3.4): short, with the cover, the title, the status and the
 * platforms; and the whole page.
 */
type Height = 'short' | 'full'

const fromBottom = () => window.matchMedia(SHEET_FROM_BOTTOM).matches

/**
 * In the middle of a very wide window, as wide as the game's page (spec 7.2).
 * CSS alone, so crossing the line while resizing moves the same elements and
 * loses nothing. Its height is fixed: stepping through games neither resizes
 * it nor moves Next.
 */
const CENTERED =
  'game-centered:inset-0 game-centered:m-auto game-centered:h-[min(94dvh,70rem)] game-centered:w-[80rem] game-centered:rounded-panel game-centered:border game-centered:[--sheet-fade:0] game-centered:[--sheet-from:0_1.5rem]'

/** Where a press on the sheet started, while it may yet become a drag. */
type Press = { id: number; x: number; y: number; from: Height; onGrip: boolean; moved: boolean }

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
  /**
   * In 3D the box pulled from the wall is the cover, and the wall dims itself.
   * The panel stays at the side there, on any screen: the camera keeps the box clear of it.
   */
  pulled?: boolean
}

/**
 * The game opened over the shelf (spec 7.2): its page, in a sheet from the
 * bottom on a phone or a tablet held upright, a panel from the right otherwise
 * (spec 12), and centered on a very wide window. What
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
  // The panel keeps showing the last game while it slides away, as of the version it
  // showed it in: a game just removed or archived is in no later one, so its facts are not.
  const [shown, setShown] = useState({ item, version })
  if (item && (item !== shown.item || version !== shown.version)) setShown({ item, version })
  const game = shown.item?.game
  const { handle, files } = useShelf()
  const facts = useGameFacts(files, shown.version, game?.slug)
  const touch = useRef<{ x: number; y: number } | undefined>(undefined)
  const press = useRef<Press | undefined>(undefined)
  const panel = useRef<HTMLDivElement>(null)
  const query = keptQuery(useSearchParams())

  // A game opened from the shelf starts short; stepping to the next keeps the height.
  const [height, setHeight] = useState<Height>('short')
  const [wasOpen, setWasOpen] = useState(false)
  if (Boolean(item) !== wasOpen) {
    setWasOpen(Boolean(item))
    if (item) setHeight('short')
  }

  // Stepping to another game, or going back to short, starts at the top of the page.
  const short = height === 'short'
  useEffect(() => {
    panel.current?.querySelector('[data-sheet-body]')?.scrollTo({ top: 0 })
  }, [game?.slug, short])

  /** The drag let go, or never begun: the sheet goes back to resting at its height. */
  const settle = () => {
    panel.current?.removeAttribute('data-dragging')
    panel.current?.style.removeProperty('--sheet-drag')
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!fromBottom() || event.button !== 0) return
    const target = event.target as Element
    const onGrip = Boolean(target.closest('[data-sheet-grip]'))
    // Short, the whole sheet is a handle; full, only its grip is, since the rest scrolls.
    if (!onGrip && height === 'full') return
    // A control does what it does; the screenshots scroll sideways themselves.
    if (!onGrip && target.closest('button, a, input, label, [role="radio"], .shot-strip')) return
    press.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      from: height,
      onGrip,
      moved: false,
    }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = press.current
    if (!start || start.id !== event.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.moved) {
      // Sideways is the swipe to the next game, not a drag.
      if (Math.abs(dy) < TAP || Math.abs(dy) < Math.abs(dx)) return
      start.moved = true
      event.currentTarget.setPointerCapture(event.pointerId)
      panel.current?.setAttribute('data-dragging', '')
    }
    // Full is as tall as it goes.
    const offset = start.from === 'full' ? Math.max(0, dy) : dy
    panel.current?.style.setProperty('--sheet-drag', `${offset}px`)
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const start = press.current
    press.current = undefined
    if (!start || start.id !== event.pointerId) return
    settle()
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!start.moved) {
      // A tap on the short sheet shows all of it; the grip's own click does the same.
      // A press that went sideways was the swipe to the next game.
      const tapped = Math.hypot(dx, dy) < TAP
      if (tapped && start.from === 'short' && !start.onGrip) setHeight('full')
      return
    }
    if (dy < -DRAG) setHeight('full')
    else if (dy > DRAG) {
      if (start.from === 'full') setHeight('short')
      else onClose()
    }
  }
  const onPointerCancel = () => {
    press.current = undefined
    settle()
  }

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
          className={cn(
            // Stacked because `lg:` alone loses: custom variants come after breakpoints in the CSS.
            'sheet-bottom:h-[92dvh] sheet-bottom:max-h-[92dvh] sheet-side:lg:w-[32rem]',
            !pulled && CENTERED,
          )}
          upright
          data-game={game.slug}
          data-height={height}
          grip={
            <button
              type="button"
              data-sheet-grip=""
              className="sheet-grip sheet-side:hidden"
              aria-expanded={height === 'full'}
              aria-label={height === 'full' ? t('showLess') : t('showAll')}
              onClick={() => setHeight(height === 'full' ? 'short' : 'full')}
            >
              <span aria-hidden="true" />
            </button>
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onFocus={(event) => {
            // Moving focus to what the short sheet hides, from a keyboard, shows all of it.
            // Only the page inside counts: Safari focuses the sheet itself on a tap.
            const body = panel.current?.querySelector('[data-sheet-body]')
            const footer = panel.current?.querySelector('[data-sheet-footer]')
            if (height !== 'short' || !body?.contains(event.target) || !footer) return
            if (event.target.getBoundingClientRect().bottom > footer.getBoundingClientRect().top) {
              setHeight('full')
            }
          }}
          actions={
            // The game's own page, in place of the panel: Back from it is the library again.
            <Tip label={t('fullPage')}>
              <Link
                href={gameHref(handle, game.slug, query)}
                replace
                aria-label={t('fullPage')}
                className={sheetButton(true)}
              >
                <Maximize2Icon aria-hidden="true" className="size-4" />
              </Link>
            </Tip>
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
