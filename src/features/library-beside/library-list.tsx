'use client'

import { ChevronDownIcon, ListFilterIcon, XIcon } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import {
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { flushSync } from 'react-dom'

import { thumbnailOf, type LibraryPlatform } from '@/domain/library/library'
import { onlyReady } from '@/domain/library/ready'
import {
  arrangeOnce,
  indexOnce,
  keywordIndexOnce,
  parseLibraryQuery,
  selectOnce,
  withoutAdult,
} from '@/domain/library/view'
import { standingCopies } from '@/domain/query/evaluate'
import { chipsOf } from '@/domain/query/panel'
import { parseQuery } from '@/domain/query/parse'
import { join, mentions, type QueryNode } from '@/domain/query/tree'
import { conditionLabel } from '@/features/filters/labels'
import { SearchField } from '@/features/filters/search-field'
import { useKeywords } from '@/features/filters/use-keywords'
import { LibraryLink } from '@/features/game-detail/back-to-library'
import { drawPage, loadEditor, withList } from '@/features/game-detail/drawn-page'
import { arriveSoon, handOff } from '@/features/game-detail/hand-off'
import { morph } from '@/features/game-detail/morph'
import { readRememberedHere } from '@/features/library/arrangement'
import { Cover } from '@/features/library/cover'
import { shelfName } from '@/features/library/describe'
import { gameHref, type ShelfInfo } from '@/features/library/shelf-address'
import { useLibrary, type LibraryState } from '@/features/library/use-library'
import { useAdult, useReadyToPlay } from '@/features/library/use-preference'
import { useReadySlugs } from '@/features/library/use-ready'
import { useIsMine } from '@/features/owner/account'
import { useLibraryChange } from '@/features/owner/library-change'
import { navigationStarted } from '@/features/shell/navigation-progress'
import { Link, useRouter } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Tip } from '@/ui/tooltip'

import { BesideGhostRows } from './beside-ghost'
import { ListControls } from './list-controls'
import {
  GAME_REM,
  HEADING_REM,
  listRows,
  offsetsOf,
  orderOf,
  rowOf,
  windowOf,
  type ListRow,
} from './list-rows'
import { publishOrder, withdrawOrder, type HandedOver, type ListOrder } from './store'

/** Rows drawn beyond what can be seen, above and below: a quick scroll never finds a gap. */
const OVERSCAN = 8
/** Rows drawn before the list has measured itself: a tall window's worth. */
const FIRST_ROWS = 24

const NO_ROWS: readonly ListRow[] = []

/** How the list starts: as the library was, handed over; else as this device last arranged one. */
const startFrom = (handed: HandedOver | undefined) => {
  if (handed) {
    const { group, sort, seed, q, shelfName } = handed.arrangement
    return { from: handed.id, group, sort, seed, carried: q, shelfName }
  }
  const remembered = readRememberedHere()
  const { group, sort, seed } = parseLibraryQuery({
    group: remembered.group,
    sort: remembered.sort,
  })
  return { from: 0, group, sort, seed, carried: '', shelfName: undefined }
}

type LibraryListProps = {
  handle: string
  /** The game whose page is open. */
  slug: string | undefined
  shelf: ShelfInfo
  /** The library's version, as the library or the page last knew it. */
  version: number
  handed?: HandedOver
  /**
   * Whether the window is wide enough for the list. Narrower, it draws
   * nothing, and only keeps its order for the page's Previous and Next.
   */
  shown: boolean
}

/**
 * My library beside a game's page (ADR 009, phase 2), as Steam, Hydra and
 * GOG Galaxy keep theirs: the way back, a search, the grouping, and the
 * games as rows of a small cover and a title, the open one pulled forward.
 * It follows the library's arrangement, handed over as the game was
 * opened; its search and grouping are its own, and last from one game to
 * the next. Only the rows in view are drawn.
 */
export function LibraryList({ handle, slug, shelf, version, handed, shown }: LibraryListProps) {
  const mine = useIsMine(handle)
  const edit = useLibraryChange()
  const wanted = Math.max(version, mine ? (edit?.version ?? 0) : 0)
  const state = useLibrary(shelf.files, wanted)
  return (
    <LibraryListView
      handle={handle}
      slug={slug}
      shelf={shelf}
      version={wanted}
      handed={handed}
      shown={shown}
      state={state}
    />
  )
}

/** The list's states can be inspected without fetching a library. */
export function LibraryListView({
  handle,
  slug,
  shelf,
  version,
  handed,
  shown,
  state,
}: LibraryListProps & { state: LibraryState }) {
  const t = useTranslations('Beside')
  const library = useTranslations('Library')
  const filters = useTranslations('Filters')
  const format = useFormatter()
  const locale = useLocale()
  const router = useRouter()
  const mine = useIsMine(handle)
  const searchId = useId()

  // The arrangement, as the library handed it over; each new hand-over starts the list again.
  const [arranged, setArranged] = useState(() => startFrom(handed))
  const [search, setSearch] = useState('')
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set())
  if ((handed?.id ?? 0) !== arranged.from && handed) {
    setArranged(startFrom(handed))
    setSearch('')
    setFolded(new Set())
  }

  const wanted = version
  const whole = state.status === 'ready' ? state.library : handed?.library

  // As the library shows it: a device that hides adult games has none; Ready to play, only those.
  const hideAdult = useAdult()[0] === 'hidden'
  const [readyChoice, setReadyChoice] = useReadyToPlay()
  const ready = useReadySlugs(mine, wanted)
  const readyOnly = readyChoice === 'ready' && ready !== null
  const seen = whole && hideAdult ? withoutAdult(whole) : whole
  const shownLibrary = readyOnly ? (seen && ready ? onlyReady(seen, ready) : undefined) : seen

  const carried = parseQuery(arranged.carried).tree
  const drawnSearch = useDeferredValue(search)
  const tree = join(
    'and',
    [carried, parseQuery(drawnSearch).tree].filter((node): node is QueryNode => node !== undefined),
  )
  const keywords = useKeywords(shelf.files, wanted, mentions(tree, 'keyword'))
  const baseIndex = shownLibrary ? indexOnce(shownLibrary) : undefined
  const index = baseIndex && keywords ? keywordIndexOnce(baseIndex, keywords) : baseIndex
  const matching = index ? selectOnce(index, tree) : undefined
  const shelves =
    shownLibrary && index && matching
      ? arrangeOnce(
          matching,
          shownLibrary.names,
          { group: arranged.group, sort: arranged.sort, seed: arranged.seed },
          locale,
          standingCopies(index, tree),
        )
      : undefined

  const platforms = new Map<number, LibraryPlatform>(
    whole?.names.platform.map((each) => [each.id, each]),
  )
  const rows = shelves ? listRows(shelves, folded) : NO_ROWS
  const order = shelves ? orderOf(shelves) : undefined

  /**
   * A game's page, drawn at once from the library, as the shelf opens one (`hand-off.tsx`); by
   * the page it is opened from, should the router wait for the server.
   */
  const open = (target: string, options: { replace?: boolean; from?: HTMLElement } = {}) => {
    const game = whole?.games.find((each) => each.slug === target)
    if (!game || !whole || target === slug) return
    const page = drawPage({
      shelf,
      game,
      tags: game.tags.flatMap((position) => whole.names.tag[position] ?? []),
      platforms,
      placeholder: options.from?.querySelector('img')?.currentSrc || undefined,
    })
    // While a shelf draws a game the router is still fetching, the list stands beside it there.
    const handed = { handle, slug: target, page, withList: withList(page) }
    handOff(handed)
    const href = gameHref(handle, target)
    morph(options.from, () => {
      navigationStarted()
      arriveSoon(handed)
      if (options.replace) router.replace(href)
      else router.push(href)
    })
  }
  const opener = useRef(open)
  useEffect(() => {
    opener.current = open
  })

  // The page's Previous and Next follow this order, and open a game as a row does.
  useEffect(() => {
    if (!order) return
    const published: ListOrder = {
      handle,
      games: order,
      open: (target, options) => opener.current(target, options),
    }
    publishOrder(published)
    return () => withdrawOrder(published)
  }, [handle, order])

  // On one's own shelf, a game opens with its editor: its code is fetched now, ahead of a click.
  useEffect(() => {
    if (mine) void loadEditor()
  }, [mine])

  // Which rows can be seen. Their heights are known, so only those are drawn.
  const scroller = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ top: 0, height: 0, rem: 16 })
  const measure = (element: HTMLElement) => {
    const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const next = { top: element.scrollTop, height: element.clientHeight, rem }
    setView((current) =>
      current.top === next.top && current.height === next.height && current.rem === next.rem
        ? current
        : next,
    )
  }
  useEffect(() => {
    const element = scroller.current
    if (!shown || !element) return
    let frame = 0
    const schedule = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0
          measure(element)
        })
    }
    measure(element)
    element.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      element.removeEventListener('scroll', schedule)
      observer.disconnect()
    }
  }, [shown])

  const headingHeight = HEADING_REM * view.rem
  const gameHeight = GAME_REM * view.rem
  const offsets = offsetsOf(rows, headingHeight, gameHeight)
  const { start, end } =
    view.height > 0
      ? windowOf(offsets, view.top, view.top + view.height, OVERSCAN)
      : { start: 0, end: Math.min(rows.length, FIRST_ROWS) }

  // The open game is in view: when the list first shows it, and when another game opens.
  // A scroll of my own is left alone until then.
  const revealed = useRef<string | undefined>(undefined)
  useLayoutEffect(() => {
    const element = scroller.current
    if (!shown || !element || !slug || rows.length === 0) return
    const mark = `${arranged.from}:${slug}`
    if (revealed.current === mark) return
    const at = rowOf(rows, slug)
    if (at < 0) return
    revealed.current = mark
    const top = offsets[at]!
    const bottom = offsets[at + 1]!
    if (top < element.scrollTop || bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = top - (element.clientHeight - (bottom - top)) / 2
      measure(element)
    }
  }, [shown, slug, rows, offsets, arranged.from])

  // One row at a time takes Tab: the one last focused, else the open game's, else the first in view.
  const [active, setActive] = useState<string>()
  const drawn = rows.slice(start, end)
  const preferred = active ?? (slug ? rows[rowOf(rows, slug)]?.key : undefined)
  const tabKey = drawn.some((row) => row.key === preferred) ? preferred : drawn[0]?.key

  /** Up and down step through the rows, Home and End go to either end; the row is drawn first. */
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const from = (event.target as HTMLElement).closest<HTMLElement>('[data-row]')
    if (!from) return
    const at = Number(from.dataset.row)
    const to =
      event.key === 'ArrowDown'
        ? at + 1
        : event.key === 'ArrowUp'
          ? at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? rows.length - 1
              : undefined
    if (to === undefined) return
    event.preventDefault()
    const row = rows[Math.min(rows.length - 1, Math.max(0, to))]
    const element = scroller.current
    if (!row || !element) return
    const index = rows.indexOf(row)
    const top = offsets[index]!
    const bottom = offsets[index + 1]!
    if (top < element.scrollTop) element.scrollTop = top
    else if (bottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = bottom - element.clientHeight
    }
    flushSync(() => {
      setActive(row.key)
      measure(element)
    })
    element.querySelector<HTMLElement>(`[data-row="${index}"]`)?.focus({ preventScroll: true })
  }

  if (!shown) return null

  const words = { t: filters, library, format }
  const carriedLabel =
    arranged.shelfName ??
    (carried
      ? chipsOf(carried)
          .map((chips) =>
            format.list(
              chips.map((chip) => conditionLabel(chip.node, index, words)),
              { type: 'conjunction' },
            ),
          )
          .join(` ${filters('chips.or')} `)
      : undefined)

  const toggle = (key: string) =>
    setFolded((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const plainClick = (event: MouseEvent) =>
    event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

  const drawRow = (row: ListRow, index: number) => {
    const tabIndex = row.key === tabKey ? 0 : -1
    if (row.kind === 'heading') {
      const name = shelfName(row.shelf, library)
      return (
        <button
          key={row.key}
          type="button"
          data-row={index}
          tabIndex={tabIndex}
          className="beside-heading"
          aria-expanded={!row.folded}
          aria-label={t('group', { name, count: row.count })}
          onFocus={() => setActive(row.key)}
          onKeyDown={onKeyDown}
          onClick={() => toggle(row.key)}
        >
          <ChevronDownIcon
            aria-hidden="true"
            className={cn('size-3.5 flex-none', row.folded && '-rotate-90')}
          />
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="tabular-nums">{t('count', { count: row.count })}</span>
        </button>
      )
    }
    const { game, copy } = row.item
    const current = game.slug === slug
    return (
      <Link
        key={row.key}
        href={gameHref(handle, game.slug)}
        // Each game's page is built on its first visit: a list of them in view must not build them all.
        prefetch={false}
        data-row={index}
        tabIndex={tabIndex}
        aria-current={current ? 'page' : undefined}
        className="beside-game"
        onFocus={() => setActive(row.key)}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          if (!plainClick(event)) return
          event.preventDefault()
          open(game.slug, {
            from: event.currentTarget.querySelector<HTMLElement>('.beside-thumb') ?? undefined,
          })
        }}
      >
        <span className="beside-thumb" aria-hidden="true">
          <Cover
            cover={copy?.cover ?? thumbnailOf(game)}
            colors={game.colors}
            hash={game.hash}
            title=""
            sizes="24px"
            small
          />
        </span>
        <span className="min-w-0 truncate">{game.title}</span>
      </Link>
    )
  }

  const empty = matching?.length === 0

  return (
    <>
      <div className="beside-head">
        <LibraryLink handle={handle} />
      </div>

      <div className="grid flex-none gap-2 px-3 pb-3">
        <SearchField
          id={searchId}
          value={search}
          onChange={(text) => setSearch(text)}
          label={t('search.label')}
          placeholder={t('search.placeholder')}
        />
        <ListControls
          group={arranged.group}
          onGroup={(group) => setArranged((current) => ({ ...current, group }))}
          ready={ready !== null ? readyChoice === 'ready' : undefined}
          onReady={() => setReadyChoice(readyChoice === 'ready' ? 'all' : 'ready')}
        />
        {carriedLabel ? (
          <span className="beside-carried" data-slot="carried-filter">
            <ListFilterIcon aria-hidden="true" className="size-3.5 flex-none text-muted" />
            <span className="min-w-0 flex-1 truncate">{carriedLabel}</span>
            <Tip label={t('carried.clear', { filter: carriedLabel })}>
              <button
                type="button"
                aria-label={t('carried.clear', { filter: carriedLabel })}
                className="beside-carried-clear"
                onClick={() =>
                  setArranged((current) => ({ ...current, carried: '', shelfName: undefined }))
                }
              >
                <XIcon aria-hidden="true" className="size-3.5" />
              </button>
            </Tip>
          </span>
        ) : null}
        {/* What a search leaves, once it settles; the library says it the same way. */}
        {drawnSearch && matching ? (
          <p role="status" className="sr-only">
            {t('found', { count: matching.length })}
          </p>
        ) : null}
      </div>

      <div ref={scroller} className="beside-rows scrollbar-quiet" data-beside-rows="">
        {state.status === 'failed' && !whole ? (
          <div role="alert" className="grid justify-items-start gap-2 px-3 py-2 text-sm">
            <p>{t('failed')}</p>
            <Button size="sm" onClick={state.retry}>
              {library('error.retry')}
            </Button>
          </div>
        ) : empty ? (
          <div className="grid justify-items-start gap-2 px-3 py-2 text-sm text-muted">
            <p>{t('empty')}</p>
            {search ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() => setSearch('')}
              >
                {filters('search.clear')}
              </Button>
            ) : null}
          </div>
        ) : !shelves ? (
          <BesideGhostRows />
        ) : (
          <div
            style={
              {
                paddingTop: offsets[start],
                paddingBottom: offsets.at(-1)! - offsets[end]!,
              } as CSSProperties
            }
          >
            {drawn.map((row, at) => drawRow(row, start + at))}
          </div>
        )}
      </div>
    </>
  )
}
