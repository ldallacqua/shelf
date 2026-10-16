import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GameFacts } from '@/domain/library/game-page'
import type { ShelfItem } from '@/domain/library/group'
import type { LibraryGame, LibraryPlatform } from '@/domain/library/library'
import { renderWithIntl } from '@/test/render'

import { GameDetail } from './game-detail'
import { gameSlugIn, historyMoved, leaveGame, replaceGame, showGame } from './game-address'
import { GamePanel } from './game-panel'
import { morph } from './morph'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

const address = vi.hoisted(() => ({ query: '' }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(address.query),
}))

/** A game's page (spec 7.1) and the game opened over the shelf (spec 7.2). */

const ps4: LibraryPlatform = {
  id: 48,
  key: 'ps4',
  name: 'PlayStation 4',
  short: 'PS4',
  family: 'playstation',
  generation: 8,
  shape: 'bluRay',
  plastic: 'blue',
}
const platforms = new Map([[ps4.id, ps4]])

const game = (extra: Partial<LibraryGame> = {}): LibraryGame => ({
  slug: 'bloodborne',
  title: 'Bloodborne',
  status: 'completed',
  rating: 85,
  addedOn: '2023-11-23',
  completedOn: '2024-02-01',
  minutes: 4020,
  igdbRating: 91,
  igdbRatingCount: 1894,
  kind: 'main',
  year: 2015,
  releasedOn: '2015-03-24',
  cover: 'cob99l',
  colors: ['#3a4a5a', '#8a7a6a', '#101418'],
  featured: false,
  hasNotes: true,
  copies: [{ platform: 48, format: 'physical' }],
  genres: [12],
  themes: [],
  modes: [],
  perspectives: [],
  platforms: [48],
  franchises: [],
  series: [],
  developers: [1],
  publishers: [],
  tags: [0],
  ...extra,
})

const facts = (extra: Partial<GameFacts> = {}): GameFacts => ({
  slug: 'bloodborne',
  summary: 'A Hunter wakes in Yharnam.',
  storyline: 'The night of the Hunt.',
  backdrop: { id: 'ar1', width: 1920, height: 1080 },
  screenshots: [
    { id: 'sc1', width: 1920, height: 1080 },
    { id: 'sc2', width: 1920, height: 1080 },
    { id: 'sc3', width: 1920, height: 1080 },
  ],
  releases: [{ platform: 48, day: '2015-03-24', year: 2015 }],
  length: { hastily: 1440, normally: 2200, completely: 3300 },
  notes: 'Borrowed this years ago.',
  names: {
    genre: [{ id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' }],
    theme: [],
    mode: [],
    perspective: [],
    franchise: [],
    series: [],
    company: [{ id: 1, name: 'FromSoftware', slug: 'fromsoftware' }],
    platform: [ps4],
  },
  ...extra,
})

const tags = [{ name: 'replay someday', slug: 'replay-someday' }]

describe('GameDetail', () => {
  it('shows the game, what is recorded about it, and what IGDB says', () => {
    renderWithIntl(
      <GameDetail layout="page" game={game()} tags={tags} platforms={platforms} facts={facts()} />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Bloodborne' })).toBeInTheDocument()
    const mine = screen.getByRole('heading', { name: 'Mine' }).closest('section')!
    for (const text of [
      'Completed',
      '8.5',
      'PlayStation 4, Physical',
      '67 hours',
      'November 23, 2023',
      'February 1, 2024',
      'replay someday',
      'Borrowed this years ago.',
    ]) {
      expect(mine).toHaveTextContent(text)
    }
    expect(screen.getByText('A Hunter wakes in Yharnam.')).toBeInTheDocument()
    expect(screen.getByText('The night of the Hunt.')).toBeInTheDocument()
    const details = screen.getByRole('heading', { name: 'Details' }).closest('section')!
    expect(details).toHaveTextContent('March 24, 2015')
    expect(details).toHaveTextContent('Main story24 hours')
    expect(details).toHaveTextContent('91 of 100, from 1,894 ratings')
  })

  it('makes every value under Details a link to the library filtered by it', () => {
    renderWithIntl(
      <GameDetail layout="page" game={game()} tags={tags} platforms={platforms} facts={facts()} />,
    )
    const link = (name: string) => screen.getByRole('link', { name }).getAttribute('href')
    expect(link('Role-playing (RPG)')).toBe('/en/library?q=genre%3Arpg')
    expect(link('FromSoftware')).toBe('/en/library?q=developer%3Afromsoftware')
    expect(link('PlayStation 4')).toBe('/en/library?q=platform%3Aps4')
    expect(link('replay someday')).toBe('/en/library?q=tag%3Areplay-someday')
    expect(link('PlayStation 4, Physical')).toBe('/en/library?q=owned%3Aps4+format%3Aphysical')
  })

  it('marks IGDB’s English as English on the Portuguese site', () => {
    renderWithIntl(
      <GameDetail layout="page" game={game()} tags={tags} platforms={platforms} facts={facts()} />,
      'pt-BR',
    )
    expect(screen.getByText('A Hunter wakes in Yharnam.').closest('[lang]')).toHaveAttribute(
      'lang',
      'en',
    )
    expect(screen.getByRole('heading', { name: 'Sobre' })).toBeInTheDocument()
  })

  it('waits with ghosts for what is on its way, and draws what it has at once', () => {
    renderWithIntl(<GameDetail layout="panel" game={game()} tags={tags} platforms={platforms} />)
    expect(screen.getByRole('heading', { level: 2, name: 'Bloodborne' })).toBeInTheDocument()
    expect(screen.getByText('PlayStation 4, Physical')).toBeInTheDocument()
    expect(screen.queryByText('A Hunter wakes in Yharnam.')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.ghost').length).toBeGreaterThan(0)
  })

  it('leaves out what is not there: no notes for a visitor, no story, no screenshots', () => {
    renderWithIntl(
      <GameDetail
        layout="page"
        game={game({ hasNotes: false, rating: undefined, completedOn: undefined })}
        tags={[]}
        platforms={platforms}
        facts={facts({ notes: undefined, storyline: undefined, screenshots: [] })}
      />,
    )
    expect(screen.queryByRole('heading', { name: 'Notes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Story' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Screenshots' })).not.toBeInTheDocument()
    expect(screen.queryByText('My rating')).not.toBeInTheDocument()
  })

  it('in 3D leaves the cover to the box pulled from the wall', () => {
    renderWithIntl(
      <GameDetail
        layout="panel"
        game={game()}
        tags={tags}
        platforms={platforms}
        facts={facts()}
        cover={false}
      />,
    )
    expect(document.querySelector('[data-hero-cover]')).toBeNull()
  })
})

describe('Screenshots', () => {
  it('opens the viewer at the screenshot chosen, and its arrows stay its own', async () => {
    const onNext = vi.fn()
    renderWithIntl(
      // Inside the panel, whose arrows step through games.
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- stands in for the panel
      <div onKeyDown={onNext}>
        <GameDetail layout="page" game={game()} tags={tags} platforms={platforms} facts={facts()} />
      </div>,
    )
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Screenshot 2 of 3 from Bloodborne: open it full screen',
      }),
    )
    const viewer = screen.getByRole('dialog', { name: 'Screenshots from Bloodborne' })
    expect(viewer).toHaveTextContent('2 of 3')
    expect(within(viewer).getAllByRole('img')).toHaveLength(3)
    await userEvent.keyboard('{ArrowRight}')
    expect(onNext).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('GamePanel', () => {
  const item = (extra: Partial<LibraryGame> = {}): ShelfItem => {
    const entry = game(extra)
    return { game: entry, copy: entry.copies[0] }
  }

  const answer = vi.fn<(address: string) => Promise<Response>>()
  beforeEach(() => {
    answer.mockImplementation(async () => Response.json(facts()))
    vi.spyOn(globalThis, 'fetch').mockImplementation((address) => answer(String(address)))
  })
  afterEach(() => vi.restoreAllMocks())

  const open = (
    entry: ShelfItem,
    handlers: { onPrevious?: () => void; onNext?: () => void } = {},
  ) =>
    renderWithIntl(
      <GamePanel
        item={entry}
        version={7}
        platforms={platforms}
        tags={tags}
        onClose={vi.fn()}
        onReturnFocus={() => false}
        {...handlers}
      />,
    )

  it("is named by the game, and fetches the rest of its page for the library's version", async () => {
    open(item({ slug: 'bloodborne' }))
    const panel = screen.getByRole('dialog', { name: 'Bloodborne' })
    expect(panel).toHaveTextContent('PlayStation 4, Physical')
    await waitFor(() => expect(panel).toHaveTextContent('A Hunter wakes in Yharnam.'))
    expect(answer).toHaveBeenCalledWith('/api/v1/library/games/7/bloodborne')
  })

  it("links to the game's full page, keeping the library's filter and leaving the rest", () => {
    address.query = 'q=genre:rpg&view=wall&shelf=ignored'
    open(item({ slug: 'bloodborne' }))
    expect(screen.getByRole('link', { name: 'Open the full page' })).toHaveAttribute(
      'href',
      '/en/game/bloodborne?q=genre%3Arpg&view=wall',
    )
    address.query = ''
  })

  it('says so when the rest does not arrive, and offers the game’s own page', async () => {
    answer.mockImplementation(async () => new Response(null, { status: 500 }))
    open(item({ slug: 'demons-souls' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('link', { name: 'Open its own page' })).toHaveAttribute(
      'href',
      '/en/game/demons-souls',
    )
  })

  it('steps to the game before and after, by button, arrow key or a sideways swipe', async () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    open(item({ slug: 'dark-souls' }), { onPrevious, onNext })
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    await userEvent.keyboard('{ArrowLeft}')
    expect(onNext).toHaveBeenCalledOnce()
    expect(onPrevious).toHaveBeenCalledOnce()

    const panel = screen.getByRole('dialog')
    const swipe = (from: [number, number], to: [number, number]) => {
      const start = [{ clientX: from[0], clientY: from[1] }]
      const end = [{ clientX: to[0], clientY: to[1] }]
      fireEvent.touchStart(panel, { touches: start, changedTouches: start })
      fireEvent.touchEnd(panel, { touches: [], changedTouches: end })
    }
    swipe([300, 400], [120, 410])
    expect(onNext).toHaveBeenCalledTimes(2)
    // Mostly up or down is scrolling, not a step.
    swipe([120, 400], [200, 200])
    expect(onPrevious).toHaveBeenCalledOnce()
  })

  it('disables a step that leads nowhere', () => {
    open(item({ slug: 'sekiro' }))
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})

describe('the address of an open game', () => {
  afterEach(() => {
    act(() => historyMoved())
    window.history.replaceState(null, '', '/')
  })

  it('reads a game’s slug from its address, and nothing from any other', () => {
    expect(gameSlugIn('/en/game/bloodborne')).toBe('bloodborne')
    expect(gameSlugIn('/pt-BR/game/caf%C3%A9/')).toBe('café')
    expect(gameSlugIn('/en/library')).toBeUndefined()
    expect(gameSlugIn('/en/game/a/b')).toBeUndefined()
    expect(gameSlugIn('/en/game/%E0%A4%A')).toBeUndefined()
  })

  it('adds the game to history with the library’s query string, and steps back once to close', () => {
    window.history.replaceState(null, '', '/pt-BR/library?view=wall&q=genre%3Arpg')
    const before = window.history.length
    showGame('bloodborne')
    expect(window.location.pathname + window.location.search).toBe(
      '/pt-BR/game/bloodborne?view=wall&q=genre%3Arpg',
    )
    expect(window.history.length).toBe(before + 1)
    replaceGame('sekiro')
    expect(window.location.pathname).toBe('/pt-BR/game/sekiro')
    expect(window.history.length).toBe(before + 1)

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    leaveGame()
    leaveGame()
    expect(back).toHaveBeenCalledOnce()
    // A game opened before that Back arrives waits for it, then opens after the library.
    showGame('hades')
    expect(window.location.pathname).toBe('/pt-BR/game/sekiro')
    window.history.replaceState(null, '', '/pt-BR/library')
    historyMoved()
    expect(window.location.pathname).toBe('/pt-BR/game/hades')
    back.mockRestore()
  })
})

describe('morph', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition')
  })

  it('simply makes the change where the browser cannot carry the cover', () => {
    const change = vi.fn()
    const from = document.createElement('span')
    morph({ from: () => from, to: () => null, panel: () => null }, change)
    expect(change).toHaveBeenCalledOnce()
    expect(from.style.viewTransitionName).toBe('')
  })

  it('names the cover at each end for the one transition only, and leaves no copy behind', async () => {
    const from = document.createElement('span')
    const to = document.createElement('span')
    const seen: string[] = []
    let finish = () => {}
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void) => {
        seen.push(`before: ${from.style.viewTransitionName}`)
        update()
        seen.push(`after: ${from.style.viewTransitionName}|${to.style.viewTransitionName}`)
        return {
          finished: new Promise<void>((resolve) => (finish = resolve)),
          ready: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition: () => {},
        }
      },
    })
    const change = vi.fn()
    morph({ from: () => from, to: () => to, panel: () => null }, change)
    expect(change).toHaveBeenCalledOnce()
    expect(seen).toEqual(['before: game-cover', 'after: |game-cover'])
    expect(from.style.visibility).toBe('hidden')
    expect(document.documentElement).toHaveAttribute('data-morph')
    finish()
    await waitFor(() => expect(to.style.viewTransitionName).toBe(''))
    expect(from.style.visibility).toBe('')
    expect(document.documentElement).not.toHaveAttribute('data-morph')
  })

  it('leaves the sheet it brought in where it landed, so its own entrance does not run again', async () => {
    let finish = () => {}
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => void) => {
        update()
        return {
          finished: new Promise<void>((resolve) => (finish = resolve)),
          ready: Promise.resolve(),
          updateCallbackDone: Promise.resolve(),
          skipTransition: () => {},
        }
      },
    })
    const sheet = document.createElement('div')
    sheet.dataset.slot = 'sheet'
    const overlay = document.createElement('div')
    overlay.dataset.slot = 'sheet-overlay'
    const leaving = document.createElement('div')
    leaving.dataset.slot = 'sheet'
    leaving.dataset.state = 'closed'
    document.body.append(sheet, overlay, leaving)
    morph(
      { from: () => document.createElement('span'), to: () => null, panel: () => sheet },
      () => {
        sheet.dataset.state = 'open'
        overlay.dataset.state = 'open'
      },
    )
    expect(sheet).not.toHaveAttribute('data-settled')
    finish()
    await waitFor(() => expect(sheet).toHaveAttribute('data-settled'))
    expect(overlay).toHaveAttribute('data-settled')
    expect(leaving).not.toHaveAttribute('data-settled')
    for (const element of [sheet, overlay, leaving]) element.remove()
  })
})
