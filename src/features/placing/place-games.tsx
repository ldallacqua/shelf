'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import type { PlatformLabel } from '@/domain/library/adding'
import {
  moveInTally,
  placements,
  placingSorts,
  sortUnsorted,
  UNDER_AN_HOUR,
  type PlacingSort,
  type Tally,
  type UnsortedGame,
} from '@/domain/library/placing'
import type { Status } from '@/domain/library/values'
import { Cover } from '@/features/library/cover'
import { gameHref, libraryHref } from '@/features/library/shelf-address'
import { StatusMark } from '@/features/library/status-mark'
import { useAccount } from '@/features/owner/account'
import { SavedRating } from '@/features/owner/fields'
import { announceChange } from '@/features/owner/library-change'
import { notify } from '@/features/shell/notices'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { Progress } from '@/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'

import { placeGame, placeGames, rateGame, readUnsorted } from './placing-client'

/**
 * Placing what a sync brought in (spec 4.5), after Minimap's "Rate my
 * games": one row per unsorted game, with its hours and last play on each
 * source, my rating and a status one tap each, saved at once. A game given
 * a status leaves the list, with Undo; a rating alone leaves it where it
 * is. Many can be given one status at once. Beside the list, how many games
 * stand in each status, moving as they are placed.
 *
 * The list is one stop for the keyboard: Tab reaches the checkbox of the
 * row last in focus, the arrows move from row to row (Space selects), and
 * Tab goes on into that row's controls. The other rows' controls wait out
 * of the Tab order.
 */

/** Rows drawn at first, and added each time more are asked for: a sync can bring hundreds. */
const STEP = 50

/** The game with this rating (null: none); undefined leaves it as it is. */
const withRating = (game: UnsortedGame, score: number | null | undefined): UnsortedGame => {
  if (score === undefined) return game
  const { rating: _, ...rest } = game
  return score === null ? rest : { ...rest, rating: score }
}

type Loaded = {
  games: UnsortedGame[]
  tally: Tally
  platforms: Map<number, PlatformLabel>
}

type RowProps = {
  game: UnsortedGame
  handle: string
  platforms: Map<number, PlatformLabel>
  /** The row the keyboard is on: its controls are in the Tab order. */
  current: boolean
  selected: boolean
  onSelect: (selected: boolean) => void
  onPlace: (status: Status) => void
  onRate: (score: number | null) => void
  onFocus: () => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  rowRef: (node: HTMLLIElement | null) => void
}

/** Its hours and last play on each source, or the hours I typed when no source reported any. */
function Played({ game }: { game: UnsortedGame }) {
  const t = useTranslations('Placing')
  const sync = useTranslations('Sync')
  const format = useFormatter()
  const day = (moment: number) =>
    format.dateTime(new Date(moment), { year: 'numeric', month: 'short', day: 'numeric' })
  const hours = (minutes: number) => Math.round(minutes / 6) / 10

  if (game.played.length === 0) {
    return game.minutes > 0 ? (
      <p className="text-sm">{t('hours', { hours: hours(game.minutes) })}</p>
    ) : null
  }
  return (
    <ul className="grid gap-0.5 text-sm">
      {game.played.map((each) => {
        const source = sync(`source.${each.source}`)
        return (
          <li key={each.source}>
            {each.minutes > 0
              ? sync('hours', { hours: hours(each.minutes), source })
              : sync('unplayed', { source })}
            {each.lastPlayedAt ? (
              <span className="text-muted">
                {' · '}
                {t('lastPlayed', { day: day(each.lastPlayedAt) })}
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function Row({
  game,
  handle,
  platforms,
  current,
  selected,
  onSelect,
  onPlace,
  onRate,
  onFocus,
  onKeyDown,
  rowRef,
}: RowProps) {
  const t = useTranslations('Placing')
  const library = useTranslations('Library')
  const titleId = useId()
  // Out of the Tab order unless the keyboard is on this row.
  const tab = current ? undefined : -1
  const shorts = game.platforms.flatMap((id) => platforms.get(id)?.short ?? [])

  return (
    <li
      ref={rowRef}
      aria-labelledby={titleId}
      onFocus={onFocus}
      data-selected={selected ? '' : undefined}
      className="grid grid-cols-[auto_3.5rem_minmax(0,1fr)] items-start gap-x-4 rounded-panel border border-line bg-surface p-4 has-[:focus-visible]:border-line-strong data-[selected]:border-accent sm:grid-cols-[auto_4.5rem_minmax(0,1fr)]"
    >
      {/* The row's stop in the list: the arrows go from here to the next row's. */}
      <Checkbox
        checked={selected}
        onChange={(event) => onSelect(event.target.checked)}
        onKeyDown={onKeyDown}
        aria-label={t('select', { title: game.title })}
        tabIndex={current ? 0 : -1}
        className="mt-0.5"
      />
      <span className="block aspect-[3/4] w-14 overflow-hidden rounded-[4px] sm:w-18">
        <Cover
          cover={game.cover}
          colors={game.colors}
          hash={game.hash}
          title={game.title}
          sizes="72px"
          small
        />
      </span>
      <div className="grid min-w-0 content-start gap-1">
        <h3 id={titleId} className="text-base font-semibold text-pretty">
          <Link
            href={gameHref(handle, game.slug)}
            tabIndex={tab}
            className="rounded-[2px] underline decoration-transparent decoration-1 underline-offset-4 hover:decoration-current"
          >
            {game.title}
          </Link>
          {game.year ? (
            <span className="ml-2 readout text-[0.6875rem] font-normal text-muted">
              {game.year}
            </span>
          ) : null}
        </h3>
        {shorts.length > 0 ? <p className="text-sm text-muted">{shorts.join(' · ')}</p> : null}
        <Played game={game} />
      </div>
      {/* Under the title beside the cover; on a phone, the row's whole width. */}
      <div className="col-span-3 mt-4 grid gap-x-8 gap-y-3 sm:col-span-1 sm:col-start-3 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:items-start">
        <SavedRating score={game.rating} onSave={onRate} tabIndex={tab} />
        <div
          role="group"
          aria-label={t('statusOf', { title: game.title })}
          className="flex flex-wrap gap-2 lg:pt-1"
        >
          {placements.map((status) => (
            <Button key={status} size="sm" tabIndex={tab} onClick={() => onPlace(status)}>
              <StatusMark status={status} label={library(`status.${status}`)} />
            </Button>
          ))}
        </div>
      </div>
    </li>
  )
}

/** How many games stand in each status, and how many still wait. */
function TallyView({ tally }: { tally: Tally }) {
  const t = useTranslations('Placing')
  const library = useTranslations('Library')
  const format = useFormatter()
  const id = useId()
  const total = Object.values(tally).reduce((sum, count) => sum + count, 0)
  return (
    <aside
      aria-labelledby={id}
      className="grid gap-3 rounded-panel border border-line bg-surface p-4 lg:gap-4 lg:p-5"
    >
      <h2 id={id} className="readout text-[0.6875rem] text-muted">
        {t('tally')}
      </h2>
      <p className="title text-lg text-pretty lg:text-xl">{t('left', { count: tally.unsorted })}</p>
      <Progress value={total - tally.unsorted} max={total} aria-label={t('placedShare')} />
      {/* A line that wraps above the list on a phone; a column beside it on a desktop. */}
      <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-x-4 lg:gap-y-2">
        {placements.map((status) => (
          <div key={status} className="flex items-center gap-2 lg:contents">
            <dt>
              <StatusMark status={status} label={library(`status.${status}`)} />
            </dt>
            <dd className="tabular-nums lg:text-right">{format.number(tally[status])}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

/** The list, once the account is known: fetched, then changed here as games are placed. */
function PlacingList({ handle }: { handle: string }) {
  const t = useTranslations('Placing')
  const library = useTranslations('Library')
  const errors = useTranslations('Add')
  const locale = useLocale()
  const sortId = useId()

  const [loaded, setLoaded] = useState<Loaded>()
  const [trouble, setTrouble] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [sort, setSort] = useState<PlacingSort>('played')
  const [limit, setLimit] = useState(STEP)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [active, setActive] = useState<string>()
  const rows = useRef(new Map<string, HTMLLIElement>())
  // The row to move focus to once it is drawn: after an arrow, or when the row in focus leaves.
  const focusNext = useRef<string>(undefined)
  // Ratings given on this page, by entry: null for one taken away.
  const rated = useRef(new Map<string, number | null>())

  useEffect(() => {
    const abort = new AbortController()
    void readUnsorted(abort.signal).then((answer) => {
      if (abort.signal.aborted) return
      if (!answer.ok) {
        setTrouble(true)
        return
      }
      setTrouble(false)
      setLoaded({
        games: answer.value.games,
        tally: answer.value.tally,
        platforms: new Map(answer.value.platforms.map((platform) => [platform.id, platform])),
      })
    })
    return () => abort.abort()
  }, [attempt])

  useEffect(() => {
    const id = focusNext.current
    if (!id) return
    focusNext.current = undefined
    rows.current.get(id)?.querySelector<HTMLElement>('input[type="checkbox"]')?.focus()
  })

  const sorted = useMemo(
    () => (loaded ? sortUnsorted(loaded.games, sort, locale) : []),
    [loaded, sort, locale],
  )

  if (trouble) {
    return (
      <div className="mt-6 grid max-w-xl justify-items-start gap-4">
        <p role="alert">{t('failed')}</p>
        <Button onClick={() => setAttempt((count) => count + 1)}>{t('retry')}</Button>
      </div>
    )
  }
  if (!loaded) return <p className="mt-6 text-muted">{t('loading')}</p>

  const shown = sorted.slice(0, limit)
  const current =
    active && shown.some((game) => game.entryId === active) ? active : shown[0]?.entryId
  const briefly = sorted.filter((game) => game.minutes < UNDER_AN_HOUR)
  const label = (status: Status) => library(`status.${status}`)

  /** Games out of the list and into a status, in the tally too. */
  const take = (games: readonly UnsortedGame[], status: Status) => {
    const leaving = new Set(games.map((game) => game.entryId))
    setLoaded((now) => {
      if (!now) return now
      const stays = now.games.filter((game) => !leaving.has(game.entryId))
      return {
        ...now,
        games: stays,
        tally: moveInTally(now.tally, 'unsorted', status, now.games.length - stays.length),
      }
    })
    setSelected((now) => new Set([...now].filter((id) => !leaving.has(id))))
  }

  /** Games back in the list, from the status they were given, with any rating since. */
  const giveBack = (games: readonly UnsortedGame[], status: Status) =>
    setLoaded((now) => {
      if (!now) return now
      const there = new Set(now.games.map((game) => game.entryId))
      const back = games
        .filter((game) => !there.has(game.entryId))
        .map((game) => withRating(game, rated.current.get(game.entryId)))
      return {
        ...now,
        games: [...now.games, ...back],
        tally: moveInTally(now.tally, status, 'unsorted', back.length),
      }
    })

  /** When the row in focus leaves, focus goes to the one that takes its place. */
  const keepFocus = (leaving: ReadonlySet<string>) => {
    const inFocus = [...leaving].some((id) =>
      rows.current.get(id)?.contains(document.activeElement),
    )
    const at = shown.findIndex((game) => leaving.has(game.entryId))
    const stays = shown.filter((game) => !leaving.has(game.entryId))
    const next = stays[Math.min(at, stays.length - 1)]
    if (!next) return
    if (current && leaving.has(current)) setActive(next.entryId)
    if (inFocus) focusNext.current = next.entryId
  }

  const placeOne = async (game: UnsortedGame, status: Status) => {
    keepFocus(new Set([game.entryId]))
    take([game], status)
    const answer = await placeGame(game.entryId, status)
    if (!answer.ok) {
      giveBack([game], status)
      notify({ message: t('notPlaced', { title: game.title }) })
      return
    }
    announceChange({ version: answer.value.version })
    notify({
      message: t('placed', { title: game.title, status: label(status) }),
      actions: [
        {
          label: errors('undo'),
          run: async () => {
            giveBack([game], status)
            const back = await placeGame(game.entryId, 'unsorted')
            if (!back.ok) {
              take([game], status)
              notify({ message: errors(`errors.${back.reason}`) })
              return
            }
            announceChange({ version: back.value.version })
            notify({ message: t('putBack', { title: game.title }) })
          },
        },
      ],
    })
  }

  const placeSelected = async (status: Status) => {
    const games = sorted.filter((game) => selected.has(game.entryId))
    const ids = games.map((game) => game.entryId)
    if (ids.length === 0) return
    keepFocus(new Set(ids))
    take(games, status)
    const answer = await placeGames(ids, status)
    if (!answer.ok) {
      giveBack(games, status)
      setSelected(new Set(ids))
      notify({ message: errors(`errors.${answer.reason}`) })
      return
    }
    announceChange({ version: answer.value.version })
    notify({
      message: t('placedMany', { count: ids.length, status: label(status) }),
      actions: [
        {
          label: errors('undo'),
          run: async () => {
            giveBack(games, status)
            const back = await placeGames(ids, 'unsorted')
            if (!back.ok) {
              take(games, status)
              notify({ message: errors(`errors.${back.reason}`) })
              return
            }
            announceChange({ version: back.value.version })
            notify({ message: t('putBackMany', { count: ids.length }) })
          },
        },
      ],
    })
  }

  const setRating = (entryId: string, score: number | null) => {
    // Kept apart too: a rating still saving as its game is placed is the one Undo brings back.
    rated.current.set(entryId, score)
    setLoaded((now) =>
      now
        ? {
            ...now,
            games: now.games.map((game) =>
              game.entryId === entryId ? withRating(game, score) : game,
            ),
          }
        : now,
    )
  }

  const rate = async (game: UnsortedGame, score: number | null) => {
    setRating(game.entryId, score)
    const answer = await rateGame(game.entryId, score)
    if (!answer.ok) {
      setRating(game.entryId, game.rating ?? null)
      notify({ message: t('notRated', { title: game.title }) })
      return
    }
    announceChange({ version: answer.value.version })
  }

  /** The arrows, Home and End, from a row's checkbox: in its other controls, they are theirs. */
  const moveFrom = (event: KeyboardEvent<HTMLInputElement>, at: number) => {
    const to =
      event.key === 'ArrowDown'
        ? at + 1
        : event.key === 'ArrowUp'
          ? at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? shown.length - 1
              : undefined
    if (to === undefined) return
    event.preventDefault()
    // Down from the last row drawn draws more.
    if (to >= shown.length && to < sorted.length) setLimit((now) => now + STEP)
    const next = sorted[Math.max(0, Math.min(to, sorted.length - 1))]
    if (!next) return
    setActive(next.entryId)
    focusNext.current = next.entryId
  }

  if (sorted.length === 0) {
    return (
      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid max-w-xl justify-items-start gap-4">
          <p className="text-pretty">{t('empty')}</p>
          <Button variant="primary" asChild>
            <Link href={libraryHref(handle)}>{t('toShelf')}</Link>
          </Button>
        </div>
        <TallyView tally={loaded.tally} />
      </div>
    )
  }

  const remaining = sorted.length - shown.length

  return (
    <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="grid min-w-0 gap-4 max-lg:order-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1.5">
            <label htmlFor={sortId} className="text-sm font-medium">
              {t('sort')}
            </label>
            <Select
              value={sort}
              onValueChange={(value) => {
                setSort(value as PlacingSort)
                setLimit(STEP)
              }}
            >
              <SelectTrigger id={sortId} className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {placingSorts.map((each) => (
                  <SelectItem key={each} value={each}>
                    {t(`sorts.${each}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            {briefly.length > 0 ? (
              <Button
                variant="ghost"
                onClick={() => setSelected(new Set(briefly.map((game) => game.entryId)))}
              >
                {t('underAnHour', { count: briefly.length })}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => setSelected(new Set(sorted.map((game) => game.entryId)))}
            >
              {t('selectAll', { count: sorted.length })}
            </Button>
          </div>
        </div>

        {selected.size > 0 ? (
          // Stays in sight under the page's header while the list scrolls past.
          <div
            role="group"
            aria-label={t('selected', { count: selected.size })}
            className="sticky top-14 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-panel border border-accent bg-surface-raised p-3 shadow-panel"
          >
            <p className="text-sm font-semibold">{t('selected', { count: selected.size })}</p>
            <span className="text-sm text-muted">{t('putThem')}</span>
            <div className="flex flex-wrap gap-2">
              {placements.map((status) => (
                <Button key={status} size="sm" onClick={() => void placeSelected(status)}>
                  <StatusMark status={status} label={label(status)} />
                </Button>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              {t('clear')}
            </Button>
          </div>
        ) : null}

        <ul aria-label={t('list')} className="grid gap-3">
          {shown.map((game, at) => (
            <Row
              key={game.entryId}
              game={game}
              handle={handle}
              platforms={loaded.platforms}
              current={game.entryId === current}
              selected={selected.has(game.entryId)}
              onSelect={(on) =>
                setSelected((now) => {
                  const next = new Set(now)
                  if (on) next.add(game.entryId)
                  else next.delete(game.entryId)
                  return next
                })
              }
              onPlace={(status) => void placeOne(game, status)}
              onRate={(score) => void rate(game, score)}
              onFocus={() => setActive(game.entryId)}
              onKeyDown={(event) => moveFrom(event, at)}
              rowRef={(node) => {
                if (node) rows.current.set(game.entryId, node)
                else rows.current.delete(game.entryId)
              }}
            />
          ))}
        </ul>
        {remaining > 0 ? (
          <Button className="justify-self-start" onClick={() => setLimit((now) => now + STEP)}>
            {t('more', { count: Math.min(STEP, remaining) })}
          </Button>
        ) : null}
      </div>
      <div className="max-lg:order-1 lg:sticky lg:top-20">
        <TallyView tally={loaded.tally} />
      </div>
    </div>
  )
}

/**
 * The page's body: built ahead as a frame, filled in the browser for the
 * account signed in, as the account page is.
 */
export function PlaceGames() {
  const t = useTranslations('Placing')
  const account = useTranslations('AccountPage')
  const locale = useLocale()
  const who = useAccount()

  if (who.status === 'checking') return <p className="mt-6 text-muted">{account('checking')}</p>
  if (who.status !== 'signed-in') {
    return (
      <div className="mt-6 max-w-xl">
        <p className="text-pretty">{t('signInFirst')}</p>
        <div className="mt-6">
          <Button variant="primary" asChild>
            <Link href={{ pathname: '/sign-in', query: { from: `/${locale}/account/unsorted` } }}>
              {account('signIn')}
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <p className="mt-4 max-w-2xl text-pretty text-muted">{t('intro')}</p>
      <PlacingList handle={who.handle} />
    </>
  )
}
