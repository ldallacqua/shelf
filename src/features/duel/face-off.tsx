'use client'

import { Undo2Icon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useId, useRef, useState, type CSSProperties } from 'react'

import type { Standing } from '@/domain/duel/bracket'
import { factsOf } from '@/domain/duel/facts'
import { ledFrom } from '@/domain/color/palette'
import { coverFit, ratioOfCover } from '@/domain/library/cover-fit'
import type { LibraryGame, LibraryNames } from '@/domain/library/library'
import type { Day } from '@/domain/library/values'
import { Cover } from '@/features/library/cover'
import { gameHref } from '@/features/library/shelf-address'
import { StatusMark } from '@/features/library/status-mark'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Confirm } from '@/ui/confirm'
import { Progress } from '@/ui/progress'

import { FactTable } from './fact-table'

type Side = 'a' | 'b'

/** How long a choice shows before the next two step in: the game going on lit, the other dimmed. */
export const CHOICE_SHOWS_MS = 280

/** How wide a fighter's cover is drawn, for the browser to choose a file by. */
const SIZES = '(min-width: 80rem) 272px, (min-width: 40rem) 240px, 40vw'

/** Keys pressed in a field are not choices. */
const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

/** A menu, list or dialog open over the page (the header's, a question): its arrows are its own. */
const OVER_THE_PAGE = '[role="menu"], [role="listbox"], [role="dialog"], [role="alertdialog"]'

type FighterProps = {
  side: Side
  game: LibraryGame
  handle: string
  /** This duel's choice is being shown: whether this game went on. */
  outcome?: 'won' | 'lost'
  /** The two stepped in after a choice, rather than being the first duel. */
  arrived: boolean
  onChoose: () => void
}

/** One game in the duel: its cover under its own light, what it is, and the way to choose it. */
export function Fighter({ side, game, handle, outcome, arrived, onChoose }: FighterProps) {
  const t = useTranslations('Duel.fight')
  const statuses = useTranslations('Library.status')
  const id = useId()
  const led = game.colors ? ledFrom(game.colors[0]) : undefined
  return (
    <article
      aria-labelledby={id}
      className="duel-fighter"
      data-side={side}
      data-outcome={outcome}
      data-arrived={arrived ? '' : undefined}
      style={{ '--case-led': led } as CSSProperties}
    >
      {/* Keyed by the game, so each new one steps into its place; its title below names it. */}
      <span key={game.slug} aria-hidden="true" className="duel-niche">
        <span className="duel-cover">
          <Cover
            cover={game.cover}
            colors={game.colors}
            hash={game.hash}
            title={game.title}
            sizes={SIZES}
            eager
            fit={coverFit(ratioOfCover(game.cover, game.coverRatio))}
          />
        </span>
        <span aria-hidden="true" className="duel-plinth" />
      </span>
      <div className="grid w-full max-w-60 content-start justify-items-center gap-1">
        <h3 id={id} className="line-clamp-3 text-base font-semibold text-balance sm:text-lg">
          {game.title}
        </h3>
        <p className="flex flex-wrap justify-center gap-x-2 text-xs text-muted">
          {game.year === undefined ? null : <span>{game.year}</span>}
          <StatusMark status={game.status} label={statuses(game.status)} />
        </p>
      </div>
      <Button
        variant="primary"
        className="w-full max-w-60"
        aria-label={t('chooseName', { title: game.title })}
        aria-disabled={outcome === undefined ? undefined : true}
        onClick={onChoose}
      >
        {t('choose')}
      </Button>
      <Link
        href={gameHref(handle, game.slug)}
        aria-label={t('openName', { title: game.title })}
        className="inline-flex min-h-6 items-center rounded-control text-sm text-muted underline decoration-1 underline-offset-4 hover:text-text"
      >
        {t('open')}
      </Link>
    </article>
  )
}

/** VS between the two: for the eye; the round's heading and the buttons say it in words. */
function Versus() {
  const t = useTranslations('Duel.fight')
  return (
    <span className="duel-vs" aria-hidden="true">
      {t('vs')}
    </span>
  )
}

type FaceOffProps = {
  handle: string
  standing: Standing & { current: NonNullable<Standing['current']> }
  games: ReadonlyMap<string, LibraryGame>
  names: LibraryNames
  today: Day
  /** What the last choice did, for a screen reader. */
  said: string
  /** The page just moved here by itself (Start, Duel again): focus goes to the round's heading. */
  focusOnArrival?: boolean
  onPick: (slug: string) => void
  onUndo: () => void
  onLeave: () => void
}

/**
 * Two games face to face (spec 3.14): the round and how far the duel has come, the two games under
 * their lights with their facts between them, and Undo. A choice shows for a moment (the game going
 * on lit, the other dimmed), then the next two step in. ← and → choose too, outside a field. Focus
 * stays on the button pressed, which the next duel's game takes over, and a screen reader hears
 * who went on and who meets next.
 */
export function FaceOff({
  handle,
  standing,
  games,
  names,
  today,
  said,
  focusOnArrival = false,
  onPick,
  onUndo,
  onLeave,
}: FaceOffProps) {
  const t = useTranslations('Duel.fight')
  const headingId = useId()
  const heading = useRef<HTMLHeadingElement>(null)
  const { current, played, total } = standing
  const a = games.get(current.a)
  const b = games.get(current.b)
  const [shown, setShown] = useState<{ slug: string; at: number } | undefined>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const choosing = shown !== undefined && shown.at === played

  const choose = (slug: string) => {
    if (choosing) return
    setShown({ slug, at: played })
    timer.current = setTimeout(() => onPick(slug), CHOICE_SHOWS_MS)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    if (focusOnArrival) heading.current?.focus()
  }, [focusOnArrival])

  // ← and → choose the game on that side, while nothing is being typed and no question is open.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.shiftKey || typing(event.target) || document.querySelector(OVER_THE_PAGE)) return
    if (event.key === 'ArrowLeft') choose(current.a)
    else if (event.key === 'ArrowRight') choose(current.b)
    else return
    event.preventDefault()
  })
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  if (!a || !b) return null
  const outcomeOf = (slug: string) =>
    choosing ? (shown.slug === slug ? ('won' as const) : ('lost' as const)) : undefined
  const facts = factsOf([a, b], names, today)

  return (
    <section aria-labelledby={headingId} className="grid gap-6 sm:gap-8">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <h2
            id={headingId}
            ref={heading}
            tabIndex={-1}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 outline-none"
          >
            <span className="title text-2xl sm:text-3xl">
              {t(`round.${standing.rounds[current.round]?.name ?? 'final'}`)}
            </span>
            {current.ofRound > 1 ? (
              <span className="readout text-[0.6875rem] text-muted">
                {t('position', { at: current.inRound, of: current.ofRound })}
              </span>
            ) : null}
          </h2>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('undoName')}
              aria-disabled={played === 0 || choosing ? true : undefined}
              onClick={() => {
                if (played > 0 && !choosing) onUndo()
              }}
              className="aria-disabled:opacity-50"
            >
              <Undo2Icon aria-hidden="true" />
              {t('undo')}
            </Button>
            {played > 0 ? (
              <Confirm
                title={t('leaveTitle')}
                description={t('leaveBody')}
                confirm={t('leave')}
                cancel={t('keep')}
                onConfirm={onLeave}
              >
                <Button variant="ghost" size="sm">
                  {t('leave')}
                </Button>
              </Confirm>
            ) : (
              <Button variant="ghost" size="sm" onClick={onLeave}>
                {t('leave')}
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <Progress
            value={played}
            max={total}
            aria-label={t('progressLabel')}
            className="min-w-48 flex-[1_1_12rem]"
          />
          <p className="text-xs text-muted">{t('progress', { played, total })}</p>
        </div>
      </div>

      <p className="-mb-2 text-center text-base text-pretty sm:text-lg lg:hidden">
        {t('question')}
      </p>

      <div className="duel-arena">
        <Fighter
          side="a"
          game={a}
          handle={handle}
          outcome={outcomeOf(a.slug)}
          arrived={played > 0}
          onChoose={() => choose(a.slug)}
        />
        <div className="duel-versus lg:hidden">
          <Versus />
        </div>
        <div className="duel-facts grid justify-items-center gap-4">
          <p className="hidden text-center text-lg text-pretty lg:block">{t('question')}</p>
          <div className="hidden lg:block">
            <Versus />
          </div>
          <FactTable key={`${a.slug}:${b.slug}`} facts={facts} titles={[a.title, b.title]} />
          <p className="hidden readout text-[0.625rem] text-muted pointer-fine:block">
            {t('keys')}
          </p>
        </div>
        <Fighter
          side="b"
          game={b}
          handle={handle}
          outcome={outcomeOf(b.slug)}
          arrived={played > 0}
          onChoose={() => choose(b.slug)}
        />
      </div>

      <p role="status" className="sr-only">
        {said}
      </p>
    </section>
  )
}
