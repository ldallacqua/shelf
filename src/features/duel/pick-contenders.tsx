'use client'

import { CheckIcon, ShuffleIcon, SwordsIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { DRAW_SIZES, MAX_CONTENDERS, MIN_CONTENDERS, shuffled } from '@/domain/duel/bracket'
import { duelStatuses } from '@/domain/duel/memory'
import { coverFit, ratioOfCover } from '@/domain/library/cover-fit'
import { thumbnailOf, type LibraryGame } from '@/domain/library/library'
import type { Status } from '@/domain/library/values'
import { Cover } from '@/features/library/cover'
import { StatusMark } from '@/features/library/status-mark'
import { Button } from '@/ui/button'
import { ToggleChip } from '@/ui/chip'
import { Input } from '@/ui/field'

/** Games drawn at first, and added each time more are asked for: a backlog can hold hundreds. */
export const POOL_STEP = 48

/** How wide a cover in the list is drawn, for the browser to choose a file by. */
const SIZES = '(min-width: 40rem) 150px, 30vw'

/** Titles compared as a person reads them: no case, no accents. */
const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** A game's length, short on screen and in words for a screen reader. */
function Length({ minutes }: { minutes: number }) {
  const t = useTranslations('Duel.fight.value')
  const hours = Math.max(1, Math.round(minutes / 60))
  return (
    <>
      <span aria-hidden="true">{t('length', { hours })}</span>
      <span className="sr-only">{t('lengthLong', { hours })}</span>
    </>
  )
}

type PoolGameProps = {
  game: LibraryGame
  chosen: boolean
  /** The duel is full, and this game isn't in it. */
  full: boolean
  /** The list holds more than one status: each game says its own. */
  showStatus: boolean
  onToggle: () => void
}

/** A game to choose: its cover, title and length, pressed while it is in the duel. */
function PoolGame({ game, chosen, full, showStatus, onToggle }: PoolGameProps) {
  const statuses = useTranslations('Library.status')
  return (
    <li>
      <button
        type="button"
        className="duel-pick"
        aria-pressed={chosen}
        aria-disabled={full && !chosen ? true : undefined}
        onClick={onToggle}
      >
        {/* The title beside it names the game: the cover is for the eye. */}
        <span aria-hidden="true" className="duel-pick-cover">
          <Cover
            cover={game.cover}
            colors={game.colors}
            hash={game.hash}
            title={game.title}
            sizes={SIZES}
            small
            fit={coverFit(ratioOfCover(game.cover, game.coverRatio))}
          />
          <span aria-hidden="true" className="duel-pick-tick">
            <CheckIcon strokeWidth={3} className="size-3.5" />
          </span>
        </span>
        <span className="line-clamp-2 text-xs font-medium sm:text-sm">{game.title}</span>
        {game.length || showStatus ? (
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            {showStatus ? (
              <StatusMark status={game.status} label={statuses(game.status)} iconOnly />
            ) : null}
            {game.length ? <Length minutes={game.length} /> : null}
          </span>
        ) : null}
      </button>
    </li>
  )
}

/** How long a word about the choice (a full duel) stays beside it before it goes. */
const WARNING_MS = 4000

/** How long typing must pause before a screen reader is told how many games match. */
const SEARCH_SAYS_MS = 600

type Chosen = {
  chosen: LibraryGame[]
  /** Said beside the count for a moment, such as a full duel: in full, and short for the bar. */
  warning: { full: string; short: string } | undefined
  onStart: () => void
}

/** How many games are in, and the duels they make: "6 games · 5 duels". */
function useSummary() {
  const t = useTranslations('Duel.pick')
  return (count: number) =>
    count === 0
      ? t('nothing')
      : t('summary', {
          games: t('count', { count }),
          duels: t('duels', { count: Math.max(0, count - 1) }),
        })
}

function StartButton({
  ready,
  onStart,
  className,
}: {
  ready: boolean
  onStart: () => void
  className?: string
}) {
  const t = useTranslations('Duel.pick')
  return (
    <Button variant="primary" disabled={!ready} onClick={onStart} className={className}>
      <SwordsIcon aria-hidden="true" />
      {t('start')}
    </Button>
  )
}

/**
 * What is in the duel, beside the list on a wide screen: each game with a way to take it out, the
 * count and the duels it makes, Start and Clear. It comes before the list in the Tab order, as it
 * stands at the top beside the choices, so Start is a few Tabs away, not past every cover.
 */
function TrayPanel({
  chosen,
  warning,
  onStart,
  onRemove,
  onClear,
}: Chosen & { onRemove: (slug: string) => void; onClear: () => void }) {
  const t = useTranslations('Duel.pick')
  const id = useId()
  const summary = useSummary()
  const ready = chosen.length >= MIN_CONTENDERS
  return (
    <aside
      aria-labelledby={id}
      className="sticky top-20 scrollbar-quiet hidden max-h-[calc(100dvh-6rem)] gap-4 self-start overflow-y-auto rounded-panel border border-line bg-surface p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:grid"
    >
      <div className="grid gap-1">
        <h3 id={id} className="readout text-[0.6875rem] text-muted">
          {t('inDuel')}
        </h3>
        <p className="text-lg font-semibold">{summary(chosen.length)}</p>
        {warning ? <p className="text-sm font-medium text-pretty">{warning.full}</p> : null}
      </div>
      {chosen.length === 0 ? (
        <p className="text-sm text-pretty text-muted">{t('needMore')}</p>
      ) : (
        <ol className="grid gap-1">
          {chosen.map((game) => (
            <li key={game.slug} className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="block h-8 w-6 flex-none overflow-hidden rounded-[2px]"
              >
                <Cover
                  cover={thumbnailOf(game)}
                  colors={game.colors}
                  hash={game.hash}
                  title={game.title}
                  sizes="24px"
                  small
                />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{game.title}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted hover:text-text pointer-coarse:size-10"
                aria-label={t('remove', { title: game.title })}
                onClick={() => onRemove(game.slug)}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
      )}
      {chosen.length > 0 && !ready ? (
        <p className="text-sm text-pretty text-muted">{t('needMore')}</p>
      ) : null}
      <div className="grid gap-1">
        <StartButton ready={ready} onStart={onStart} />
        {chosen.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={onClear}>
            {t('clear')}
          </Button>
        ) : null}
      </div>
    </aside>
  )
}

/**
 * Below a wide screen, a bar at the bottom of the screen with the count, Clear and Start, as the
 * library's phone toolbar stands, so Start is never a scroll away. A word about the choice takes the
 * count's place for a moment. On the narrowest phones it stands in two rows, Start under the rest.
 */
function TrayBar({ chosen, warning, onStart, onClear }: Chosen & { onClear: () => void }) {
  const t = useTranslations('Duel.pick')
  const summary = useSummary()
  return (
    <div className="duel-bar fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md lg:hidden">
      <div className="duel-bar-row mx-auto w-full max-w-(--page-width) px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        {/* What is in, and Clear beside it: away from Start, which nothing takes back. */}
        <div className="duel-bar-what">
          <p className="min-w-0 text-sm font-semibold text-balance">
            {warning?.short ?? summary(chosen.length)}
          </p>
          {chosen.length > 0 ? (
            <Button variant="ghost" size="sm" className="flex-none" onClick={onClear}>
              {t('clear')}
            </Button>
          ) : null}
        </div>
        <StartButton
          ready={chosen.length >= MIN_CONTENDERS}
          onStart={onStart}
          className="duel-bar-start"
        />
      </div>
    </div>
  )
}

type PickContendersProps = {
  /** The games with the chosen statuses, by title. */
  pool: LibraryGame[]
  /** Every game of the library, by address: a chosen game may be outside the pool. */
  games: ReadonlyMap<string, LibraryGame>
  counts: Partial<Record<Status, number>>
  from: readonly Status[]
  chosen: readonly string[]
  /** Something to say first: a duel that ended because a game left the shelf. */
  notice?: string
  onFrom: (from: Status[]) => void
  onChosen: (chosen: string[]) => void
  onStart: () => void
  /** The page just came back to choosing by itself: focus goes to the heading. */
  focusOnArrival?: boolean
}

/**
 * Choosing what goes into the duel (spec 3.14): the games of the chosen statuses, as covers, each
 * pressed to put it in or take it out, up to sixteen; a search by title; a draw up to 4, 8 or 16
 * at random, which keeps what is chosen and fills the rest; and what is in so far, with Start. A
 * full duel says so in words beside the count, where the eye is. A screen reader hears how many
 * games a search finds, what a draw made, and a full duel, from one status region always there.
 */
export function PickContenders({
  pool,
  games,
  counts,
  from,
  chosen,
  notice,
  onFrom,
  onChosen,
  onStart,
  focusOnArrival = false,
}: PickContendersProps) {
  const t = useTranslations('Duel.pick')
  const statuses = useTranslations('Library.status')
  const summary = useSummary()
  const headingId = useId()
  const drawId = useId()
  const [query, setQuery] = useState('')
  const [chosenOnly, setChosenOnly] = useState(false)
  const [limit, setLimit] = useState(POOL_STEP)
  const [announced, setAnnounced] = useState('')
  const [warning, setWarning] = useState<Chosen['warning']>()
  const heading = useRef<HTMLHeadingElement>(null)
  const warned = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (focusOnArrival) heading.current?.focus()
  }, [focusOnArrival])

  useEffect(() => () => clearTimeout(warned.current), [])

  const picked = useMemo(() => new Set(chosen), [chosen])
  const chosenGames = useMemo(
    () =>
      chosen
        .map((slug) => games.get(slug))
        .filter((game): game is LibraryGame => game !== undefined),
    [chosen, games],
  )
  const full = chosen.length >= MAX_CONTENDERS

  const shown = useMemo(() => {
    const source = chosenOnly ? chosenGames : pool
    const words = plain(query.trim())
    return words ? source.filter((game) => plain(game.title).includes(words)) : source
  }, [chosenOnly, chosenGames, pool, query])

  /**
   * Tells a screen reader, through the one status region: emptied first and filled on the next
   * frame, so the same words said twice (a second full press) are heard twice.
   */
  const say = useCallback((words: string) => {
    setAnnounced('')
    requestAnimationFrame(() => setAnnounced(words))
  }, [])

  // Once typing pauses, a screen reader hears how many games the search found.
  const words = query.trim()
  const matches = shown.length
  useEffect(() => {
    if (!words) return
    const timer = setTimeout(() => say(t('matches', { count: matches })), SEARCH_SAYS_MS)
    return () => clearTimeout(timer)
  }, [words, matches, t, say])

  const warn = () => {
    clearTimeout(warned.current)
    setWarning({ full: t('full'), short: t('fullShort') })
    say(t('full'))
    warned.current = setTimeout(() => setWarning(undefined), WARNING_MS)
  }

  const change = (next: string[]) => {
    onChosen(next)
    clearTimeout(warned.current)
    setWarning(undefined)
  }

  const toggle = (slug: string) => {
    if (picked.has(slug)) change(chosen.filter((each) => each !== slug))
    else if (full) warn()
    else change([...chosen, slug])
  }

  // A draw keeps the games chosen by hand and fills the rest from the list, at random.
  const unchosen = pool.filter(({ slug }) => !picked.has(slug)).map(({ slug }) => slug)
  const draw = (size: number) => {
    const next = [...chosen, ...shuffled(unchosen)].slice(0, size)
    change(next)
    setChosenOnly(false)
    say(summary(next.length))
  }

  // A status with no game to give is left out: choosing it would change nothing.
  const offered = duelStatuses.filter((status) => (counts[status] ?? 0) > 0)
  // Each game says its status only where the list holds more than one.
  const mixed = new Set(shown.map(({ status }) => status)).size > 1
  const more = Math.min(POOL_STEP, shown.length - limit)

  return (
    <section aria-labelledby={headingId} className="mt-8 grid gap-5 sm:mt-10">
      <h2
        id={headingId}
        ref={heading}
        tabIndex={-1}
        className="title text-xl outline-none sm:text-2xl"
      >
        {t('title')}
      </h2>
      {notice ? <p className="max-w-2xl text-sm text-pretty">{notice}</p> : null}

      <div className="grid items-start gap-x-6 gap-y-5 lg:grid-cols-[minmax(0,1fr)_18rem] xl:gap-x-10">
        <div className="grid min-w-0 gap-5 lg:col-start-1 lg:row-start-1">
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">{t('from')}</legend>
            <div className="flex flex-wrap gap-2">
              {offered.map((status) => {
                const on = from.includes(status)
                return (
                  <ToggleChip
                    key={status}
                    pressed={on}
                    onClick={() => {
                      onFrom(
                        on
                          ? from.filter((each) => each !== status)
                          : duelStatuses.filter((each) => each === status || from.includes(each)),
                      )
                      setLimit(POOL_STEP)
                    }}
                  >
                    <StatusMark status={status} label={statuses(status)} />
                    <span className="readout text-[0.625rem] text-muted">
                      {counts[status] ?? 0}
                    </span>
                  </ToggleChip>
                )
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-end gap-x-4 gap-y-4">
            <label className="grid min-w-0 flex-[1_1_14rem] gap-1.5">
              <span className="text-sm font-medium">{t('search')}</span>
              <Input
                type="search"
                value={query}
                placeholder={t('searchPlaceholder')}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setLimit(POOL_STEP)
                }}
              />
            </label>
            <div
              role="group"
              aria-labelledby={drawId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:grid sm:gap-1.5"
            >
              <span id={drawId} className="flex items-center gap-1.5 text-sm font-medium">
                <ShuffleIcon aria-hidden="true" className="size-4" />
                {t('draw')}
              </span>
              <div className="flex gap-1">
                {DRAW_SIZES.map((size) => (
                  <Button
                    key={size}
                    variant="secondary"
                    className="min-w-12 px-3 tabular-nums"
                    // Nothing to add once as many are chosen, or when the list can't fill it.
                    disabled={chosen.length >= size || chosen.length + unchosen.length < size}
                    aria-label={t('drawSize', { count: size })}
                    onClick={() => draw(size)}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
            <ToggleChip
              pressed={chosenOnly}
              disabled={chosen.length === 0 && !chosenOnly}
              onClick={() => setChosenOnly(!chosenOnly)}
            >
              {t('chosenOnly')}
              <span className="readout text-[0.625rem] text-muted">{chosen.length}</span>
            </ToggleChip>
          </div>
        </div>

        <TrayPanel
          chosen={chosenGames}
          warning={warning}
          onStart={onStart}
          onRemove={(slug) => toggle(slug)}
          onClear={() => change([])}
        />

        <div className="grid min-w-0 gap-5 lg:col-start-1 lg:row-start-2">
          {shown.length === 0 ? (
            <p className="py-6 text-pretty text-muted">
              {words ? t('noMatch', { q: words }) : t('none')}
            </p>
          ) : (
            <ul aria-label={t('listLabel')} className="duel-pool">
              {shown.slice(0, limit).map((game) => (
                <PoolGame
                  key={game.slug}
                  game={game}
                  chosen={picked.has(game.slug)}
                  full={full}
                  showStatus={mixed}
                  onToggle={() => toggle(game.slug)}
                />
              ))}
            </ul>
          )}
          {more > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => setLimit(limit + POOL_STEP)}>
                {t('more', { count: more })}
              </Button>
              <span className="text-sm text-muted">
                {t('shown', { shown: limit, total: shown.length })}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <p role="status" className="sr-only">
        {announced}
      </p>
      <TrayBar
        chosen={chosenGames}
        warning={warning}
        onStart={onStart}
        onClear={() => change([])}
      />
      {/* Room for the bar of what is chosen, below a wide screen. */}
      <div aria-hidden="true" className="h-16 lg:hidden" />
    </section>
  )
}
