'use client'

import { BookmarkPlusIcon, PencilIcon, SlidersHorizontalIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { parseAsString, parseAsStringLiteral, useQueryState, useQueryStates } from 'nuqs'
import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import { groupings, type Grouping } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import type { SmartShelf } from '@/domain/library/shelves'
import { writeSort, type Sort } from '@/domain/library/sort'
import { libraryStats } from '@/domain/library/stats'
import type { Status } from '@/domain/library/values'
import {
  arrangeOnce,
  DEFAULT_GROUPING,
  DEFAULT_VIEW,
  firstScreenShelves,
  indexOnce,
  keepFirstScreen,
  keywordIndexOnce,
  parseLibraryQuery,
  selectOnce,
  views,
  type FirstScreen,
  type View,
} from '@/domain/library/view'
import { standingCopies } from '@/domain/query/evaluate'
import { facetCounts } from '@/domain/query/facets'
import {
  chipsOf,
  NO_CONDITION,
  removeChip,
  setListEverywhere,
  sharedInclude,
  textWith,
  withoutProblem,
} from '@/domain/query/panel'
import { parseQuery } from '@/domain/query/parse'
import { mentions, type QueryNode } from '@/domain/query/tree'
import { FilterChips } from '@/features/filters/filter-chips'
import { FilterPanel } from '@/features/filters/filter-panel'
import { NoResults } from '@/features/filters/no-results'
import { SaveShelf } from '@/features/filters/save-shelf'
import { SEARCH_ID, SearchField } from '@/features/filters/search-field'
import { ShelvesMenu, type ShelfActions } from '@/features/filters/shelf-controls'
import { shortcutsOn } from '@/features/filters/shortcuts'
import { ShortcutsDialog } from '@/features/filters/shortcuts-dialog'
import { SortControl } from '@/features/filters/sort-control'
import { StatusRow } from '@/features/filters/status-row'
import { useKeywords } from '@/features/filters/use-keywords'
import type { Anchor, FallbackReason, Shelf3DHandle } from '@/features/shelf-3d/shelf-3d'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Ledge } from '@/ui/ledge'

import { GamePreview } from './game-preview'
import { ListView } from './list-view'
import { markPageLive } from './live'
import type { Dimension } from './preferences'
import { anchorIn2d, ShelfStage } from './shelf-stage'
import { StatsLine } from './stats-line'
import { Toolbar } from './toolbar'
import { useFlip } from './use-flip'
import { useLibrary } from './use-library'
import {
  useDensity,
  useDimension,
  useReducedMotion,
  useTooSmallFor3d,
  useWallSize,
} from './use-preference'
import type { DrawnShelf, OpenBox } from './view-props'
import { WallView } from './wall-view'

// Each change of view or grouping is a step in the browser's history, so Back undoes it.
const viewParam = parseAsStringLiteral(views)
  .withDefault(DEFAULT_VIEW)
  .withOptions({ history: 'push' })

const never = () => () => {}

/** Whether this browser has no WebGL 2 at all, so 3D cannot even be tried. The server cannot tell: it says no. */
const useNoWebGL2 = () =>
  useSyncExternalStore(
    never,
    () => !('WebGL2RenderingContext' in window),
    () => false,
  )

/** Single-letter keys are off while typing, and inside the open game or a panel. */
const typing = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    Boolean(target.closest('[role="dialog"], [role="menu"]')))

/** How long the first boxes take to arrive on the shelf, with room to spare. */
const ARRIVAL_MS = 1400

/** A new seed for a shuffle: short, and safe in an address. */
const newSeed = (): string => Math.random().toString(36).slice(2, 8)

type LibraryViewProps = {
  /** The start of the library, sent with the page. */
  first: FirstScreen
  /** The line of totals beside the title, drawn on the server for the address it was built for. */
  stats: ReactNode
  /** The smart shelves, for the menu. */
  shelves: readonly SmartShelf[]
  /** The smart shelf this page is, when it is one: its filter, sort and grouping are the defaults. */
  shelf?: SmartShelf
  /** The owner's ways to save and remove shelves. Absent for a visitor. */
  actions?: ShelfActions
}

/**
 * The library: one set of shelves, shown as a shelf, a wall or a list,
 * filtered, sorted and grouped as the address says.
 *
 * The page arrives with the first screen of boxes in it. The whole library
 * follows as one cached file, and from then on every filter, sort and
 * regroup happens here, on the device, with no request: the result shows on
 * the next frame (spec 5.6).
 */
export function LibraryView({
  first,
  stats,
  shelves: smartShelves,
  shelf,
  actions,
}: LibraryViewProps) {
  const t = useTranslations('Library')
  const filters = useTranslations('Filters')
  const shelfWords = useTranslations('Shelves')
  const locale = useLocale()
  const router = useRouter()

  // On a smart shelf, what it was saved with is the default: its own address is clean.
  const defaults = {
    q: shelf?.query ?? '',
    sort: shelf?.sort ?? 'title',
    group: shelf?.group ?? DEFAULT_GROUPING,
  }
  const [view, setView] = useQueryState('view', viewParam)
  const [rawGroup, setGroup] = useQueryState(
    'group',
    parseAsStringLiteral(groupings).withDefault(defaults.group).withOptions({ history: 'push' }),
  )
  const [address, setAddress] = useQueryStates(
    {
      q: parseAsString.withDefault(defaults.q),
      sort: parseAsString.withDefault(defaults.sort),
      seed: parseAsString.withDefault(''),
    },
    { history: 'push' },
  )
  const query = parseLibraryQuery({ view, group: rawGroup, ...address })
  const { group, sort, seed } = query
  const sortText = writeSort(sort)

  const [density, setDensity] = useDensity()
  const [wallSize, setWallSize] = useWallSize()
  const [dimension, setDimension] = useDimension()
  /** Set when 3D gave way to 2D on this page, and why. */
  const [fallback, setFallback] = useState<FallbackReason>()
  /** The game a switch into 3D starts at. */
  const [anchor, setAnchor] = useState<Anchor>()
  const shelf3d = useRef<Shelf3DHandle | undefined>(undefined)
  const noWebGL2 = useNoWebGL2()
  const noThreeD = noWebGL2 || fallback === 'unsupported'
  // On a phone the shelf is 2D, and 3D is not offered.
  const tooSmall = useTooSmallFor3d()
  const calm = useReducedMotion()
  // With no WebGL 2 at all, 3D is not even tried: the 3D button says why (spec 3.6).
  const asked: Dimension = noWebGL2 || tooSmall ? '2d' : dimension
  const shown: Dimension = asked === '3d' && !fallback ? '3d' : '2d'
  const [open, setOpen] = useState<OpenBox>()
  const [panelOpen, setPanelOpen] = useState(false)
  const [groupMenu, setGroupMenu] = useState(false)
  const [sortMenu, setSortMenu] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [keywordsAsked, setKeywordsAsked] = useState(false)

  // When the library file arrives, its shelves are arranged in a turn of
  // their own, ahead of drawing them.
  const state = useLibrary(first.version, (whole) => {
    const library = keepFirstScreen(whole, first)
    const index = indexOnce(library)
    const { tree } = parseQuery(query.q)
    arrangeOnce(selectOnce(index, tree), library.names, query, locale, standingCopies(index, tree))
  })
  const scope = useRef<HTMLDivElement>(null)

  // Boxes arrive in a stagger once, when the page is first drawn.
  const [arriving, setArriving] = useState(true)
  useEffect(() => {
    // From here on, whatever joins the page was added on this device.
    markPageLive()
    const timer = setTimeout(() => setArriving(false), ARRIVAL_MS)
    return () => clearTimeout(timer)
  }, [])

  const library = state.status === 'ready' ? keepFirstScreen(state.library, first) : undefined

  // The filter as typed this moment, for the field, the chips and the panel; and the one
  // the shelves are drawn from, which may lag a frame behind fast typing so typing stays quick.
  const parsed = parseQuery(query.q)
  const drawnQ = useDeferredValue(query.q)
  const drawn = parseQuery(drawnQ)
  const keywords = useKeywords(
    first.version,
    keywordsAsked || mentions(parsed.tree, 'keyword') || mentions(drawn.tree, 'keyword'),
  )
  const baseIndex = library ? indexOnce(library) : undefined
  const index = baseIndex && keywords ? keywordIndexOnce(baseIndex, keywords) : baseIndex
  const matching = index ? selectOnce(index, drawn.tree) : undefined

  // Until the library file arrives there are only the boxes that came with
  // the page, and only for the address they were chosen for.
  const builtFor = first.query
  const asBuilt =
    group === builtFor.group &&
    drawnQ === builtFor.q &&
    sortText === builtFor.sort &&
    seed === builtFor.seed
  let shelves: DrawnShelf[] = []
  if (library && index && matching) {
    shelves = arrangeOnce(
      matching,
      library.names,
      query,
      locale,
      standingCopies(index, drawn.tree),
    ).map((each) => ({ ...each, total: each.items.length }))
  } else if (asBuilt) {
    shelves = firstScreenShelves(first, locale)
  }

  const platforms = new Map<number, LibraryPlatform>(
    (library?.names.platform ?? first.platforms).map((platform) => [platform.id, platform]),
  )
  const tags = library?.names.tag ?? first.tags

  const capture = useFlip(scope, `${view}:${group}:${density}:${sortText}:${seed}`)

  /** 2D or 3D, as asked for by the buttons or the D key. Nothing else about the library changes. */
  const switchTo = (next: Dimension) => {
    if (next === '3d') {
      if (noThreeD || tooSmall) return
      setAnchor(anchorIn2d(scope.current))
      // 3D gave way earlier on this page: asking again tries again.
      setFallback(undefined)
    }
    setDimension(next)
  }

  const change = <Value,>(set: (value: Value) => unknown, value: Value) => {
    capture()
    setOpen(undefined)
    void set(value)
  }

  /** A new filter. Typing replaces the history entry it started; anything else adds one. */
  const writeQ = (text: string, typed = false) => {
    setOpen(undefined)
    void setAddress({ q: text }, { history: typed ? 'replace' : 'push' })
  }
  const writeTree = (tree: QueryNode | undefined) => writeQ(textWith(tree, parsed.problems))
  const writeSortTo = (next: Sort) => {
    capture()
    setOpen(undefined)
    void setAddress({ sort: writeSort(next), seed: null })
  }
  const shuffle = () => {
    capture()
    setOpen(undefined)
    void setAddress({ sort: 'random', seed: newSeed() })
  }
  const clearFilters = () => writeQ('')

  const nextView = () => change(setView, views[(views.indexOf(view) + 1) % views.length]!)

  const keys = useRef({ view, shown, tooSmall, switchTo, nextView, shuffle })
  useEffect(() => {
    keys.current = { view, shown, tooSmall, switchTo, nextView, shuffle }
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return
      const now = keys.current
      // `/` and `?` always work: `?` is where single letters are turned back on.
      if (event.key === '/') {
        event.preventDefault()
        document.getElementById(SEARCH_ID)?.focus()
        return
      }
      if (event.key === '?') {
        event.preventDefault()
        setHelpOpen(true)
        return
      }
      if (!shortcutsOn()) return
      switch (event.key.toLowerCase()) {
        case 'f':
          setPanelOpen(true)
          break
        case 'g':
          setGroupMenu(true)
          break
        case 's':
          setSortMenu(true)
          break
        case 'v':
          now.nextView()
          break
        case 'r':
          now.shuffle()
          break
        case 'd':
          if (now.view !== 'shelf' || now.tooSmall) return
          now.switchTo(now.shown === '3d' ? '2d' : '3d')
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The game whose details are open, and its neighbors in the current order.
  const openShelf = open ? shelves.findIndex((each) => each.key === open.key) : -1
  const openItem = open ? shelves[openShelf]?.items[open.index] : undefined
  const step = (direction: -1 | 1): OpenBox | undefined => {
    if (!open || openShelf < 0) return undefined
    const at = open.index + direction
    const current = shelves[openShelf]
    if (current?.items[at]) return { key: current.key, index: at }
    // Off the end of a shelf: on to the next shelf's first box, or back to the last of the one before.
    for (
      let other = openShelf + direction;
      other >= 0 && other < shelves.length;
      other += direction
    ) {
      const next = shelves[other]
      if (next && next.items.length > 0) {
        return { key: next.key, index: direction === 1 ? 0 : next.items.length - 1 }
      }
    }
    return undefined
  }
  const previous = step(-1)
  const next = step(1)

  // When the sheet closes, focus returns to the box of the game last shown
  // in it: stepping through games moves your place on the shelf with you.
  const lastOpen = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (openItem) {
      const { game, copy } = openItem
      lastOpen.current = copy ? `${game.slug}:${copy.platform}` : game.slug
    }
  })
  const returnFocus = (): boolean => {
    const key = lastOpen.current
    if (!key) return false
    const name = CSS.escape(key)
    // A 2D box, or its button beside the 3D scene.
    const box = scope.current?.querySelector<HTMLElement>(
      `[data-flip="${name}"], [data-box="${name}"]`,
    )
    box?.focus()
    return Boolean(box)
  }

  // The status row: the one status every group agrees on, All when the filter
  // says nothing about status, and nothing pressed when it says something else.
  const statusIn = sharedInclude(parsed.tree, 'status')
  const statusValue: Status | 'all' | undefined =
    statusIn?.length === 1
      ? (statusIn[0] as Status)
      : mentions(parsed.tree, 'status')
        ? undefined
        : 'all'
  const statusCounts = index
    ? Object.fromEntries(
        facetCounts(index, parsed.tree, 'status').map((value) => [value.word, value.count]),
      )
    : undefined
  const conditions = chipsOf(parsed.tree).reduce((total, chips) => total + chips.length, 0)

  // The totals follow the filter. The server drew them for the address the page came
  // with; from the first change they are worked out here.
  const liveStats =
    matching && (drawnQ !== builtFor.q || library?.version !== first.version)
      ? libraryStats(matching)
      : undefined

  // A smart shelf that is not as it was saved says so, and offers to save it or go back.
  const changed =
    shelf !== undefined &&
    (query.q !== shelf.query || sortText !== shelf.sort || group !== shelf.group)

  const viewProps = {
    shelves,
    platforms,
    open,
    onOpen: setOpen,
    enter: arriving,
    firstBoxes: first.boxes,
  }

  const heading = shelf?.name ?? t('title')

  return (
    <div ref={scope} className="library" data-view={view}>
      <div className="flex flex-none flex-wrap items-end justify-between gap-x-6 gap-y-2 pt-4 pb-3 sm:pt-10 sm:pb-5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="title text-2xl sm:text-5xl">{heading}</h1>
          {changed ? (
            <p className="flex items-baseline gap-3 text-sm">
              <span className="readout text-[0.625rem] text-muted uppercase">
                {shelfWords('changed')}
              </span>
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() => {
                  capture()
                  void setAddress({ q: null, sort: null, seed: null })
                  void setGroup(null)
                }}
              >
                {shelfWords('reset')}
              </Button>
            </p>
          ) : null}
        </div>
        {liveStats ? <StatsLine stats={liveStats} settle={false} /> : stats}
      </div>

      {/* The toolbar stays a child of .library: on a phone it moves to the bottom of the screen. */}
      <div className="grid flex-none gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <SearchField
            value={query.q}
            onChange={(text, typed) => writeQ(text, typed)}
            className="flex-1 sm:max-w-xl"
          />
          <ShelvesMenu shelves={smartShelves} current={shelf?.slug} />
          {/* On a phone the owner's buttons are icons, so the search keeps its width. */}
          {actions && (!shelf || changed) ? (
            <Button
              variant="primary"
              className="flex-none max-sm:px-3"
              onClick={() => setSaveOpen(true)}
            >
              <BookmarkPlusIcon aria-hidden="true" />
              <span className="max-sm:sr-only">
                {shelf ? shelfWords('saveChanges') : shelfWords('saveShelf')}
              </span>
            </Button>
          ) : null}
          {actions && shelf && !changed ? (
            <Button
              variant="ghost"
              className="flex-none max-sm:px-3"
              onClick={() => setSaveOpen(true)}
            >
              <PencilIcon aria-hidden="true" />
              <span className="max-sm:sr-only">{shelfWords('edit')}</span>
            </Button>
          ) : null}
        </div>

        <StatusRow
          value={statusValue}
          counts={statusCounts}
          onChange={(status) =>
            writeTree(
              setListEverywhere(
                parsed.tree,
                'status',
                status === 'all' ? NO_CONDITION : { include: [status], all: false, exclude: [] },
              ),
            )
          }
        />
      </div>

      <Toolbar
        view={view}
        onView={(value: View) => change(setView, value)}
        group={group}
        onGroup={(value: Grouping) => change(setGroup, value)}
        groupOpen={groupMenu}
        onGroupOpen={setGroupMenu}
        density={density}
        onDensity={(value) => change(setDensity, value)}
        wallSize={wallSize}
        onWallSize={setWallSize}
        dimension={shown}
        onDimension={switchTo}
        noThreeD={noThreeD}
        filters={
          <Button
            variant="secondary"
            className="flex-none max-sm:px-3"
            aria-label={filters('open', { count: conditions })}
            onClick={() => setPanelOpen(true)}
          >
            <SlidersHorizontalIcon aria-hidden="true" />
            <span aria-hidden="true">{filters('openShort')}</span>
            {conditions > 0 ? (
              <span
                aria-hidden="true"
                className="-mr-1 rounded-full bg-accent px-1.5 readout text-[0.625rem] text-on-accent"
              >
                {conditions}
              </span>
            ) : null}
          </Button>
        }
        sort={
          <SortControl
            sort={sort}
            onSort={writeSortTo}
            onShuffle={shuffle}
            open={sortMenu}
            onOpenChange={setSortMenu}
          />
        }
      />

      <FilterChips
        tree={parsed.tree}
        problems={parsed.problems}
        index={index}
        onRemove={(chip) => writeTree(removeChip(parsed.tree, chip))}
        onRemoveProblem={(problem) => writeQ(withoutProblem(query.q, problem))}
        onClear={clearFilters}
        className="mt-3 flex-none"
      />

      {view === 'shelf' && fallback ? (
        <p role="status" className="mt-3 text-sm text-muted">
          {t(`shelf3d.fallback.${fallback}`)}
        </p>
      ) : null}

      {state.status === 'failed' ? (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-4 py-3 text-sm"
        >
          <p>{t('error.title')}</p>
          <Button size="sm" onClick={state.retry}>
            {t('error.retry')}
          </Button>
        </div>
      ) : null}

      {matching?.length === 0 ? (
        <NoResults onClear={clearFilters} />
      ) : shelves.length === 0 ? (
        // The wall and the boards first; the boxes follow.
        <div className="shelves pt-6" aria-busy="true">
          <p className="sr-only" role="status">
            {t('loading')}
          </p>
          <Ledge itemsClassName="h-40 sm:h-52" />
          <Ledge className="mt-10" itemsClassName="h-40 sm:h-52" />
        </div>
      ) : (
        <div
          // A change of view or grouping crossfades under reduced motion; so does a new
          // order, in place of the boxes sliding to it (spec 6).
          key={calm ? `${view}:${group}:${sortText}:${seed}` : `${view}:${group}`}
          className="motion-reduce:[&>*]:library-swap contents"
        >
          {view === 'shelf' ? (
            <ShelfStage
              {...viewProps}
              density={density}
              dimension={asked}
              fallback={fallback}
              onFallback={setFallback}
              anchor={anchor}
              handleRef={shelf3d}
            />
          ) : null}
          {view === 'wall' ? <WallView {...viewProps} size={wallSize} /> : null}
          {view === 'list' ? <ListView {...viewProps} sort={sort} onSort={writeSortTo} /> : null}
        </div>
      )}

      <GamePreview
        item={openItem}
        platforms={platforms}
        tags={tags}
        onClose={() => setOpen(undefined)}
        onReturnFocus={returnFocus}
        scrim={!(view === 'shelf' && shown === '3d')}
        onPrevious={previous ? () => setOpen(previous) : undefined}
        onNext={next ? () => setOpen(next) : undefined}
      />

      <FilterPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        tree={parsed.tree}
        index={index}
        matching={matching?.length}
        onChange={writeTree}
        onClear={clearFilters}
        onWantKeywords={() => setKeywordsAsked(true)}
      />

      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />

      {actions ? (
        <SaveShelf
          open={saveOpen}
          onOpenChange={setSaveOpen}
          shelf={shelf}
          view={{ query: query.q, sort: sortText, group }}
          actions={actions}
          onDone={(slug) => {
            if (slug) router.push({ pathname: '/shelves/[slug]', params: { slug } })
            else router.push('/library')
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
