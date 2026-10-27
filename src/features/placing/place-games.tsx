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
import { useAccount, waitingChanged } from '@/features/owner/account'
import { SavedRating } from '@/features/owner/fields'
import { announceChange } from '@/features/owner/library-change'
import { FindIt } from '@/features/platforms/find-it'
import type { Found } from '@/features/platforms/sync-client'
import { useAdult } from '@/features/library/use-preference'
import { notify } from '@/features/shell/notices'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Checkbox } from '@/ui/checkbox'
import { ToggleChip } from '@/ui/chip'
import { Progress } from '@/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'

import { placeGame, placeGames, rateGame, readUnsorted, rematchGame } from './placing-client'

/**
 * Placing what a sync brought in (spec 4.5), after Minimap's "Rate my
 * games": one row per unsorted game, with its hours and last play on each
 * source, my rating and a status one tap each, saved at once. A game given
 * a status stays in the list, showing it, until the page is opened again:
 * a wrong status is one tap to change, and its pressed status taps it back
 * to unsorted. A game the sync took for the wrong one is searched for and
 * made the right one, its copy and hours kept. Many can be given one status
 * at once. Beside the list, how
 * many games stand in each status, moving as they are placed.
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
  /** The statuses given on this visit, by entry: a game not here still waits. */
  given: ReadonlyMap<string, Status>
}

type RowProps = {
  game: UnsortedGame
  /** The status given to it on this visit, if any. */
  given: Status | undefined
  handle: string
  platforms: Map<number, PlatformLabel>
  /** The row the keyboard is on: its controls are in the Tab order. */
  current: boolean
  /** Its search for the game it really is is open. */
  finding: boolean
  /** Saying which game it is, a moment. */
  busy: boolean
  onFind: () => void
  onPick: (found: Found) => void
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
  given,
  handle,
  platforms,
  current,
  finding,
  busy,
  onFind,
  onPick,
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
        {/* A game the sync took for the wrong one, while it still waits: given a status, it is placed. */}
        {given ? null : (
          <Button
            variant="link"
            size="sm"
            className="h-auto min-h-6 justify-self-start px-0"
            tabIndex={tab}
            aria-expanded={finding}
            onClick={onFind}
          >
            {t('notThis')}
          </Button>
        )}
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
            <ToggleChip
              key={status}
              pressed={given === status}
              tabIndex={tab}
              onClick={() => onPlace(status)}
            >
              <StatusMark status={status} label={library(`status.${status}`)} />
            </ToggleChip>
          ))}
        </div>
      </div>
      {finding ? (
        <div className="col-span-3 mt-4 sm:col-span-2 sm:col-start-2">
          <FindIt
            title={game.title}
            onPick={onPick}
            busy={busy}
            pickLabel={(found) =>
              found.year
                ? t('isThis', { title: found.title, year: found.year })
                : t('isThisUndated', { title: found.title })
            }
          />
        </div>
      ) : null}
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
  // The row whose search for the game it really is is open, and whether its answer is on its way.
  const [finding, setFinding] = useState<string>()
  const [rematching, setRematching] = useState(false)
  const rows = useRef(new Map<string, HTMLLIElement>())
  // The row to move focus to once it is drawn, after an arrow.
  const focusNext = useRef<string>(undefined)

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
        given: new Map(),
      })
    })
    return () => abort.abort()
  }, [attempt])

  // The header counts what is left, so it falls as games are placed here.
  const left = loaded?.tally.unsorted
  useEffect(() => {
    if (left !== undefined) waitingChanged(left)
  }, [left])

  useEffect(() => {
    const id = focusNext.current
    if (!id) return
    focusNext.current = undefined
    rows.current.get(id)?.querySelector<HTMLElement>('input[type="checkbox"]')?.focus()
  })

  // On a device that hides adult games, they are not in the list at all (spec 3.13).
  const [adult] = useAdult()
  const sorted = useMemo(
    () =>
      loaded
        ? sortUnsorted(
            adult === 'hidden' ? loaded.games.filter((game) => !game.adult) : loaded.games,
            sort,
            locale,
          )
        : [],
    [loaded, sort, locale, adult],
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
  // What "select" offers is the games still waiting: one given a status here is chosen by hand.
  const waiting = sorted.filter((game) => !loaded.given.has(game.entryId))
  const briefly = waiting.filter((game) => game.minutes < UNDER_AN_HOUR)
  const label = (status: Status) => library(`status.${status}`)
  const statusOf = (entryId: string): Status => loaded.given.get(entryId) ?? 'unsorted'

  /** Games given these statuses here (unsorted: waiting again), and the tally with them. */
  const give = (changes: ReadonlyMap<string, Status>) =>
    setLoaded((now) => {
      if (!now) return now
      const given = new Map(now.given)
      let tally = now.tally
      for (const [entryId, to] of changes) {
        tally = moveInTally(tally, given.get(entryId) ?? 'unsorted', to)
        if (to === 'unsorted') given.delete(entryId)
        else given.set(entryId, to)
      }
      return { ...now, given, tally }
    })

  const placeOne = async (game: UnsortedGame, status: Status) => {
    const before = statusOf(game.entryId)
    // Its pressed status, tapped again, takes it back: the game waits, as it came.
    const to = before === status ? 'unsorted' : status
    give(new Map([[game.entryId, to]]))
    const answer = await placeGame(game.entryId, to)
    if (!answer.ok) {
      give(new Map([[game.entryId, before]]))
      notify({ message: t('notPlaced', { title: game.title }) })
      return
    }
    announceChange({ version: answer.value.version })
  }

  const placeSelected = async (status: Status) => {
    const ids = sorted.filter((game) => selected.has(game.entryId)).map((game) => game.entryId)
    if (ids.length === 0) return
    const before = new Map(ids.map((id) => [id, statusOf(id)]))
    give(new Map(ids.map((id) => [id, status])))
    setSelected(new Set())
    const answer = await placeGames(ids, status)
    if (!answer.ok) {
      give(before)
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
            give(before)
            // Each back to what it was: one write for each status they had.
            const groups = new Map<Status, string[]>()
            for (const [id, was] of before) groups.set(was, [...(groups.get(was) ?? []), id])
            for (const [was, group] of groups) {
              const back = await placeGames(group, was)
              if (!back.ok) {
                give(new Map(ids.map((id) => [id, status])))
                notify({ message: errors(`errors.${back.reason}`) })
                return
              }
              announceChange({ version: back.value.version })
            }
            notify({ message: t('undoneMany', { count: ids.length }) })
          },
        },
      ],
    })
  }

  /**
   * A game made the one I picked: the list read again, keeping the games
   * given a status on this visit, which it no longer has. One that folded
   * into a game on my shelf goes; what that game is now, the answer says.
   */
  const rematch = async (game: UnsortedGame, found: Found) => {
    setRematching(true)
    const answer = await rematchGame(game.entryId, found.igdbId)
    if (!answer.ok) {
      setRematching(false)
      notify({ message: errors(`errors.${answer.reason}`) })
      return
    }
    announceChange({ version: answer.value.version })
    const fresh = await readUnsorted()
    setRematching(false)
    setFinding(undefined)
    if (fresh.ok) {
      setLoaded((now) => {
        if (!now) return now
        const there = new Set(fresh.value.games.map((each) => each.entryId))
        const kept = now.games.filter(
          (each) =>
            now.given.has(each.entryId) &&
            !there.has(each.entryId) &&
            each.entryId !== game.entryId,
        )
        const given = new Map([...now.given].filter(([id]) => id !== game.entryId))
        return {
          games: [...fresh.value.games, ...kept],
          tally: fresh.value.tally,
          platforms: new Map([
            ...now.platforms,
            ...fresh.value.platforms.map((platform) => [platform.id, platform] as const),
          ]),
          given,
        }
      })
    }
    notify({
      message: answer.value.merged
        ? t('rematchedInto', { title: answer.value.title })
        : t('rematched', { title: answer.value.title }),
    })
  }

  const setRating = (entryId: string, score: number | null) => {
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
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid max-w-xl content-start justify-items-start gap-4">
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
            {waiting.length > 0 ? (
              <Button
                variant="ghost"
                onClick={() => setSelected(new Set(waiting.map((game) => game.entryId)))}
              >
                {t('selectAll', { count: waiting.length })}
              </Button>
            ) : null}
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
              given={loaded.given.get(game.entryId)}
              handle={handle}
              platforms={loaded.platforms}
              current={game.entryId === current}
              finding={finding === game.entryId}
              busy={rematching}
              onFind={() => setFinding((now) => (now === game.entryId ? undefined : game.entryId))}
              onPick={(found) => void rematch(game, found)}
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
