'use client'

import { BookmarkPlusIcon, PencilIcon, SlidersHorizontalIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
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
import { onlyReady } from '@/domain/library/ready'
import type { SmartShelf } from '@/domain/library/shelves'
import { writeSort, type Sort } from '@/domain/library/sort'
import { libraryStats } from '@/domain/library/stats'
import { occasionalStatuses, type Status } from '@/domain/library/values'
import {
  arrangeOnce,
  DEFAULT_GROUPING,
  DEFAULT_VIEW,
  firstScreenShelves,
  indexOnce,
  keepFirstScreen,
  withoutAdult,
  keywordIndexOnce,
  parseLibraryQuery,
  selectOnce,
  statusOnShelf,
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
import { FILTERS_BESIDE, useFiltersBeside } from '@/features/filters/beside'
import { FilterChips } from '@/features/filters/filter-chips'
import { FILTERS_ID, FilterPanel } from '@/features/filters/filter-panel'
import { NoResults } from '@/features/filters/no-results'
import { ResultStatus } from '@/features/filters/result-status'
import { SaveShelf } from '@/features/filters/save-shelf'
import { SEARCH_ID, SearchField } from '@/features/filters/search-field'
import { ShelvesMenu, type ShelfActions } from '@/features/filters/shelf-controls'
import { shortcutsOn } from '@/features/filters/shortcuts'
import { ShortcutsDialog } from '@/features/filters/shortcuts-dialog'
import { SortControl } from '@/features/filters/sort-control'
import { StatusRow } from '@/features/filters/status-row'
import { useKeywords } from '@/features/filters/use-keywords'
import {
  gameSlugIn,
  historyMoved,
  leaveGame,
  replaceGame,
  showGame,
} from '@/features/game-detail/game-address'
import type { GamePanel as GamePanelType } from '@/features/game-detail/game-panel'
import { HERO_COVER } from '@/features/game-detail/hero'
import { morph } from '@/features/game-detail/morph'
import { signedInAccount, useIsMine, waitingChanged } from '@/features/owner/account'
import { useLibraryChange } from '@/features/owner/library-change'
import { notify } from '@/features/shell/notices'
import type { Anchor, FallbackReason, Shelf3DHandle } from '@/features/shelf-3d/shelf-3d'
import { useRouter } from '@/i18n/navigation'
import { Button } from '@/ui/button'

import { GhostShelves } from './ghosts'
import { GhostList, ListView } from './list-view'
import { markPageLive } from './live'
import { NothingReady } from './nothing-ready'
import type { Dimension } from './preferences'
import { anchorIn2d, ShelfStage } from './shelf-stage'
import { StatsLine } from './stats-line'
import { Toolbar } from './toolbar'
import { useShelf } from './shelf'
import { libraryHref, smartShelfHref } from './shelf-address'
import { useFlip } from './use-flip'
import { useLibrary } from './use-library'
import { useReadySlugs } from './use-ready'
import { revealRow } from './use-row-window'
import {
  tooSmallFor3dNow,
  useAdult,
  useReadyToPlay,
  useDensity,
  useDimension,
  useExperimental,
  useReducedMotion,
  useTooSmallFor3d,
  useWallSize,
} from './use-preference'
import { followOpen, neighborsOf, openGameAt, type OpenGame } from './open-game'
import type { DrawnShelf, OpenBox } from './view-props'
import { GhostWall, WallView } from './wall-view'

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

/** A box's key on the page: the game, and the copy when it stands for one. */
const keyOf = (item: { game: { slug: string }; copy?: { platform: number } }) =>
  item.copy ? `${item.game.slug}:${item.copy.platform}` : item.game.slug

/**
 * What of a box grows into the open game: a box's case or spine, a wall's
 * cover, a list row's thumbnail.
 */
const coverOf = (root: HTMLElement | null, key: string): HTMLElement | undefined => {
  const target = root?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(key)}"]`)
  if (!target) return undefined
  const thumb = target.closest('tr')?.querySelector<HTMLElement>('.game-thumb')
  return thumb ?? (target.firstElementChild as HTMLElement | null) ?? undefined
}

const heroCover = () => document.querySelector<HTMLElement>(`[${HERO_COVER}]`)
const gamePanel = () => document.querySelector<HTMLElement>('[data-slot="sheet"][data-game]')

type GamePanelComponent = typeof GamePanelType

let panelCode: Promise<{ GamePanel: GamePanelComponent; loadEditor: () => unknown }> | undefined

/**
 * The open game's code: fetched the first time a game is reached for (a
 * pointer or a finger on one, or focus), and in any case before one opens.
 * Not every visit opens a game, so not every visit pays for it. On one's
 * own shelf, the editor's code is fetched then too, so it is there by the
 * click.
 */
const loadPanel = (handle: string): Promise<GamePanelComponent> =>
  (panelCode ??= import('@/features/game-detail/game-panel')).then((module) => {
    if (signedInAccount()?.handle === handle) void module.loadEditor()
    return module.GamePanel
  })

/** Whether an event happened on a game: a box, a wall cover, a row's title, or a 3D shelf's button. */
const onAGame = (target: EventTarget) =>
  target instanceof Element && target.closest('[data-flip], [data-box]') !== null

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
  /** The owner's ways to save and remove shelves. Offered once the browser knows the owner is here. */
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
  actions: ownerActions,
}: LibraryViewProps) {
  const { handle, files, name: ownerName } = useShelf()
  // Nobody is offered a control on a shelf not their own: they appear once
  // the browser knows the shelf is the signed-in account's.
  const actions = useIsMine(handle) ? ownerActions : undefined
  const t = useTranslations('Library')
  const added = useTranslations('Add')
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
  const [adult, setAdult] = useAdult()
  const hideAdult = adult === 'hidden'
  const [readyChoice, setReadyChoice] = useReadyToPlay()
  const [wallSize, setWallSize] = useWallSize()
  const [dimension, setDimension] = useDimension()
  // 3D and compact are unfinished (issue 63): neither is offered until this device turns them on.
  const experimental = useExperimental()[0] === 'on'
  /** Set when 3D gave way to 2D on this page, and why. */
  const [fallback, setFallback] = useState<FallbackReason>()
  /** The game a switch into 3D starts at. */
  const [anchor, setAnchor] = useState<Anchor>()
  const shelf3d = useRef<Shelf3DHandle | undefined>(undefined)
  const noWebGL2 = useNoWebGL2()
  const noThreeD = noWebGL2 || fallback === 'unsupported'
  // On a phone the shelf is 2D, and 3D is not offered.
  const tooSmall = useTooSmallFor3d(dimension)
  const calm = useReducedMotion()
  // With no WebGL 2 at all, 3D is not even tried: the 3D button says why (spec 3.6).
  const asked: Dimension = noWebGL2 || tooSmall ? '2d' : dimension
  const shown: Dimension = asked === '3d' && !fallback ? '3d' : '2d'
  const [open, setOpen] = useState<OpenGame>()
  /** The cover file the box showed, for the open game's cover to start from. */
  const [placeholder, setPlaceholder] = useState<string>()
  /** The open game's panel, once its code has arrived. */
  const [GamePanel, setGamePanel] = useState<GamePanelComponent>()
  const [panelOpen, setPanelOpen] = useState(false)
  // Wide enough for the filters to stand beside the library: the sheet is not needed, and a
  // sheet open as the window widens is closed, not left to open again as it narrows.
  const beside = useFiltersBeside()
  if (beside && panelOpen) setPanelOpen(false)
  const [groupMenu, setGroupMenu] = useState(false)
  const [sortMenu, setSortMenu] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [keywordsAsked, setKeywordsAsked] = useState(false)

  // When the library file arrives, its shelves are arranged in a turn of
  // their own, ahead of drawing them.
  // A game the owner just added or changed here: its library's version, and the game.
  const edit = useLibraryChange()
  const version = Math.max(first.version, edit?.version ?? 0)
  // Ready to play (spec 7.7): in the app, on my own shelf, only what this computer can start.
  const ready = useReadySlugs(actions !== undefined, version)
  const readyOnly = readyChoice === 'ready' && ready !== null
  const state = useLibrary(files, version, (whole) => {
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

  const whole = state.status === 'ready' ? keepFirstScreen(state.library, first) : undefined
  // A device that hides adult games has none in its library at all (spec 3.13): no box, no
  // count, no filter value of one.
  const seen = whole && hideAdult ? withoutAdult(whole) : whole
  // Only the games ready here, once that is known: until then nothing is drawn, rather than
  // every game first.
  const library = readyOnly ? (seen && ready ? onlyReady(seen, ready) : undefined) : seen
  const adultOnShelf = whole ? whole.games.some((game) => game.adult) : first.hidden !== undefined
  const counted = hideAdult && first.hidden ? first.hidden : first

  // The filter as typed this moment, for the field, the chips and the panel; and the one
  // the shelves are drawn from, which may lag a frame behind fast typing so typing stays quick.
  const parsed = parseQuery(query.q)
  const drawnQ = useDeferredValue(query.q)
  const drawn = parseQuery(drawnQ)
  const keywords = useKeywords(
    files,
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
  } else if (asBuilt && !readyOnly) {
    shelves = firstScreenShelves(first)
    if (hideAdult) {
      shelves = shelves.map((each) => ({
        ...each,
        items: each.items.filter((item) => !item.game.adult),
      }))
    }
  }

  const platforms = new Map<number, LibraryPlatform>(
    (library?.names.platform ?? first.platforms).map((platform) => [platform.id, platform]),
  )
  const tags = library?.names.tag ?? first.tags

  const capture = useFlip(scope, `${view}:${group}:${density}:${sortText}:${seed}`)

  /** 2D or 3D, as asked for by the buttons or the D key. Nothing else about the library changes. */
  const switchTo = (next: Dimension) => {
    if (next === '3d') {
      if (!experimental || noThreeD || tooSmallFor3dNow()) return
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

  // Afterwards (spec 4.1): once the new file is here, the view moves to the
  // game just added and it takes focus. If the filters hide it, the notice
  // says so and offers to show it.
  const handledEdit = useRef(0)
  const landing = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (
      edit?.slug &&
      handledEdit.current !== edit.id &&
      library &&
      library.version >= edit.version &&
      matching
    ) {
      handledEdit.current = edit.id
      const slug = edit.slug
      const shown = shelves.some((each) => each.items.some((item) => item.game.slug === slug))
      if (shown) landing.current = slug
      else {
        notify({
          message: added('addedHidden', { title: edit.title ?? slug }),
          actions: [
            {
              label: added('show'),
              run: () => {
                landing.current = slug
                clearFilters()
              },
            },
            ...(edit.undo ? [{ label: added('undo'), run: edit.undo }] : []),
          ],
        })
      }
    }
    const target = landing.current
    if (!target) return
    const name = CSS.escape(target)
    let tries = 0
    let frame = 0
    const land = () => {
      const box = scope.current?.querySelector<HTMLElement>(
        `[data-flip="${name}"], [data-flip^="${name}:"], [data-box="${name}"], [data-box^="${name}:"]`,
      )
      if (box) {
        landing.current = undefined
        box.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
        box.focus({ preventScroll: true })
        return
      }
      // A box far from the screen is not in the page until its row comes near.
      const shelf = shelves.find((each) => each.items.some((item) => item.game.slug === target))
      const index = shelf?.items.findIndex((item) => item.game.slug === target) ?? -1
      const grid = shelf
        ? scope.current?.querySelector<HTMLElement>(`[data-grid-of="${CSS.escape(shelf.key)}"]`)
        : undefined
      if (grid && index >= 0) revealRow(grid, index)
      if ((tries += 1) < 10) frame = requestAnimationFrame(land)
      else landing.current = undefined
    }
    frame = requestAnimationFrame(land)
    return () => cancelAnimationFrame(frame)
    // `shelves` is new on every drawing; what matters is that they were redrawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit, library, matching, shelves.length, drawnQ])

  const nextView = () => change(setView, views[(views.indexOf(view) + 1) % views.length]!)

  const keys = useRef({
    view,
    shown,
    experimental,
    switchTo,
    nextView,
    shuffle,
    adultOnShelf,
    hideAdult,
    setAdult,
  })
  useEffect(() => {
    keys.current = {
      view,
      shown,
      experimental,
      switchTo,
      nextView,
      shuffle,
      adultOnShelf,
      hideAdult,
      setAdult,
    }
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
          // Beside the library the filters are already open: F takes focus to their first.
          if (window.matchMedia(FILTERS_BESIDE).matches) {
            document.getElementById(FILTERS_ID)?.querySelector<HTMLElement>('summary')?.focus()
          } else setPanelOpen(true)
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
          if (!now.experimental || now.view !== 'shelf' || tooSmallFor3dNow()) return
          now.switchTo(now.shown === '3d' ? '2d' : '3d')
          break
        case 'h':
          if (!now.adultOnShelf) return
          now.setAdult(now.hideAdult ? 'shown' : 'hidden')
          break
        default:
          return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The game whose details are open, followed by which game it is, and its neighbors in the
  // current order: changing its status where the filter is on status leaves it open.
  const followed = open ? followOpen(shelves, open, whole?.games) : undefined
  const openItem = followed?.item
  const { previous, next } = open ? neighborsOf(shelves, open, followed?.box) : {}

  const itemAt = (box: OpenBox) => shelves.find((each) => each.key === box.key)?.items[box.index]
  const pulled = view === 'shelf' && shown === '3d'

  /** Opens a game over the shelf, its cover growing out of its box (spec 7.2). */
  const openBox = (box: OpenBox) => {
    const item = itemAt(box)
    if (!item) return
    const { slug } = item.game
    if (open) replaceGame(slug)
    else showGame(slug)
    void loadPanel(handle).then((panel) => {
      // Back before the code arrived: the game is no longer wanted.
      if (gameSlugIn(window.location.pathname) !== slug) return
      // In 3D the box pulled from the wall is the cover: there is nothing to grow.
      const source = pulled ? undefined : coverOf(scope.current, keyOf(item))
      const shows = source?.querySelector('img')?.currentSrc || undefined
      morph({ from: () => source, to: heroCover, panel: gamePanel }, () => {
        setGamePanel(() => panel)
        setPlaceholder(shows)
        setOpen(openGameAt(box, item))
      })
    })
  }

  /**
   * The close button, Escape or a click outside: a step back out of history,
   * which closes the game as Back does (below). The panel slides away on its
   * own; the cover does not fly home, because WebKit's page crashed under
   * that flight (architecture, section 25).
   */
  const closeGame = () => {
    if (gameSlugIn(window.location.pathname)) leaveGame()
    else setOpen(undefined)
  }

  /** Another game in the same panel: the arrows, a swipe, or the buttons. */
  const stepTo = (box: OpenBox) => {
    const item = itemAt(box)
    if (!item) return
    setPlaceholder(
      coverOf(scope.current, keyOf(item))?.querySelector('img')?.currentSrc || undefined,
    )
    setOpen(openGameAt(box, item))
    replaceGame(item.game.slug)
  }

  // Back closes the game and Forward opens it again; a link out of the open
  // game to the filtered library closes it too.
  const latest = useRef({ shelves })
  useEffect(() => {
    latest.current = { shelves }
  })
  useEffect(() => {
    const onMove = () => {
      historyMoved()
      const slug = gameSlugIn(window.location.pathname)
      if (!slug) {
        setOpen(undefined)
        return
      }
      for (const shelf of latest.current.shelves) {
        const index = shelf.items.findIndex((item) => item.game.slug === slug)
        const item = shelf.items[index]
        if (item) {
          void loadPanel(handle).then((panel) => {
            setGamePanel(() => panel)
            setOpen(openGameAt({ key: shelf.key, index }, item))
          })
          return
        }
      }
      // A game this page cannot show yet: its own page can.
      window.location.reload()
    }
    window.addEventListener('popstate', onMove)
    return () => window.removeEventListener('popstate', onMove)
  }, [handle])
  const pathname = usePathname()
  const onGame = gameSlugIn(pathname) !== undefined
  const [wasOnGame, setWasOnGame] = useState(onGame)
  if (onGame !== wasOnGame) {
    setWasOnGame(onGame)
    if (!onGame) setOpen(undefined)
  }

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
  // Until the library file arrives, the counts sent with the page, while they still apply.
  const statusCounts = index
    ? Object.fromEntries(
        facetCounts(index, parsed.tree, 'status').map((value) => [value.word, value.count]),
      )
    : query.q === builtFor.q && !readyOnly
      ? counted.statusCounts
      : undefined
  // On my own shelf, the header's count of the games waiting for a status follows the library
  // as it changes here (spec 4.5): all of it, whatever this device hides.
  const waiting = actions && whole ? statusOnShelf(whole, first, 'unsorted') : undefined
  useEffect(() => {
    if (waiting !== undefined) waitingChanged(waiting)
  }, [waiting])
  // Unsorted, Someday and Retired stay in the row while a game has one (spec 3.12), whatever
  // the filter matches. Until the library arrives, the counts sent with the page are the best
  // word on it.
  const onShelf = occasionalStatuses.filter((status) => {
    const count = statusOnShelf(library, first, status)
    return count === undefined ? (counted.statusCounts[status] ?? 0) > 0 : count > 0
  })
  const conditions = chipsOf(parsed.tree).reduce((total, chips) => total + chips.length, 0)

  // The totals follow the filter. The server drew them for the address the page came
  // with; from the first change they are worked out here.
  const liveStats =
    matching &&
    (readyOnly || drawnQ !== builtFor.q || library?.version !== first.version || counted !== first)
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
    onOpen: openBox,
    enter: arriving,
    firstBoxes: first.boxes,
  }

  // A smart shelf by its name; the whole library by whose it is, when that may be said.
  const heading = shelf?.name ?? (ownerName ? t('shelfTitle', { name: ownerName }) : t('title'))

  return (
    <div
      ref={scope}
      className="library"
      data-view={view}
      // Reaching for a game fetches what opening one needs.
      onPointerOver={(event) => onAGame(event.target) && void loadPanel(handle)}
      onFocus={(event) => onAGame(event.target) && void loadPanel(handle)}
    >
      {/*
       * The title, then the filters' column, then the library; on a wide window the title heads
       * the library's column, beside the filters (shelf.css). Narrower, none of the frames is a box.
       */}
      <div className="library-body">
        <div className="library-head flex flex-none flex-wrap items-end justify-between gap-x-6 gap-y-2 pt-4 pb-3 sm:pt-10 sm:pb-5 filters-beside:pt-0">
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
          {liveStats ? (
            <StatsLine stats={liveStats} settle={false} />
          ) : counted !== first && drawnQ === builtFor.q ? (
            <StatsLine stats={counted.stats} settle={false} />
          ) : (
            stats
          )}
        </div>

        <FilterPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          beside={beside}
          tree={parsed.tree}
          index={index}
          matching={matching?.length}
          onChange={writeTree}
          onClear={clearFilters}
          onWantKeywords={() => setKeywordsAsked(true)}
        />

        {/* The toolbar is laid out by .library on a phone, which moves it to the bottom of the screen. */}
        <div className="library-main">
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
              onShelf={onShelf}
              onChange={(status) =>
                writeTree(
                  setListEverywhere(
                    parsed.tree,
                    'status',
                    status === 'all'
                      ? NO_CONDITION
                      : { include: [status], all: false, exclude: [] },
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
            experimental={experimental}
            noThreeD={noThreeD}
            adult={
              adultOnShelf
                ? { hidden: hideAdult, onChange: (hidden) => setAdult(hidden ? 'hidden' : 'shown') }
                : undefined
            }
            ready={
              ready !== null
                ? {
                    on: readyChoice === 'ready',
                    onChange: (on) => setReadyChoice(on ? 'ready' : 'all'),
                  }
                : undefined
            }
            filters={
              <Button
                variant="secondary"
                // Where the filters stand beside the library, there is nothing to open.
                className="flex-none max-sm:px-3 filters-beside:hidden"
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

          <ResultStatus q={drawnQ} sort={sort} count={matching?.length} />
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

          {readyOnly && library?.games.length === 0 ? (
            <NothingReady onShowAll={() => setReadyChoice('all')} />
          ) : matching?.length === 0 ? (
            <NoResults onClear={clearFilters} />
          ) : shelves.length === 0 ? (
            // Asked for another arrangement before the library file arrived: ghosts until it does.
            <div aria-busy="true" className="contents">
              <p className="sr-only" role="status">
                {t('loading')}
              </p>
              {view === 'shelf' ? <GhostShelves /> : null}
              {view === 'wall' ? <GhostWall size={wallSize} /> : null}
              {view === 'list' ? <GhostList /> : null}
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
              {view === 'list' ? (
                <ListView {...viewProps} sort={sort} onSort={writeSortTo} />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {GamePanel ? (
        <GamePanel
          item={openItem}
          version={library?.version ?? first.version}
          platforms={platforms}
          tags={tags}
          placeholder={placeholder}
          onClose={() => closeGame()}
          onReturnFocus={returnFocus}
          pulled={pulled}
          onPrevious={previous ? () => stepTo(previous) : undefined}
          onNext={next ? () => stepTo(next) : undefined}
        />
      ) : null}

      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} experimental={experimental} />

      {actions ? (
        <SaveShelf
          open={saveOpen}
          onOpenChange={setSaveOpen}
          shelf={shelf}
          view={{ query: query.q, sort: sortText, group }}
          actions={actions}
          onDone={(slug) => {
            if (slug) router.push(smartShelfHref(handle, slug))
            else router.push(libraryHref(handle))
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
