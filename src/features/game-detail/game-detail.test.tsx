import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GameFacts } from '@/domain/library/game-page'
import type { ShelfItem } from '@/domain/library/group'
import type { LibraryGame, LibraryPlatform } from '@/domain/library/library'
import { ShelfProvider } from '@/features/library/shelf'
import type { ShelfInfo } from '@/features/library/shelf-address'
import { setDevice } from '@/test/device'
import { messages, renderWithIntl } from '@/test/render'

import { GameDetail } from './game-detail'
import { gameSlugIn, historyMoved, leaveGame, replaceGame, showGame } from './game-address'
import { GamePanel } from './game-panel'
import { GAME_CENTERED } from './hero'
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

/** The public shelf the panel's game is on, and where its files are. */
const SHELF: ShelfInfo = {
  handle: 'sample',
  name: 'Sample',
  public: true,
  files: { kind: 'public', key: 'k3y' },
}

describe('GameDetail', () => {
  it('writes IGDB’s text in its paragraphs, and keeps the rest of a long one behind Read more', () => {
    const long = Array.from(
      { length: 6 },
      (_, at) => `Paragraph ${at + 1}. ${'Words. '.repeat(20)}`,
    )
    renderWithIntl(
      <GameDetail
        handle="sample"
        layout="page"
        game={game()}
        tags={tags}
        platforms={platforms}
        facts={facts({ summary: 'First.\nSecond.', storyline: long.join('\n') })}
      />,
    )
    expect(screen.getByText('First.').tagName).toBe('P')
    expect(screen.getByText('Second.').tagName).toBe('P')
    const more = screen.getByText('Read more').closest('details')!
    expect(more).not.toHaveAttribute('open')
    expect(more).toHaveTextContent('Paragraph 6.')
    expect(more).not.toHaveTextContent('Paragraph 1.')
    // A short passage hides nothing.
    expect(screen.getAllByText('Read more')).toHaveLength(1)
  })

  it('lists the platforms a game came out on by date, one line a date', () => {
    const switchPlatform = { ...ps4, id: 130, key: 'switch', name: 'Nintendo Switch' }
    renderWithIntl(
      <GameDetail
        handle="sample"
        layout="page"
        game={game()}
        tags={tags}
        platforms={platforms}
        facts={facts({
          releases: [
            { platform: 48, day: '2015-03-24', year: 2015 },
            { platform: 130, day: '2015-03-24', year: 2015 },
            { platform: 6, year: 2016 },
          ],
          names: {
            ...facts().names,
            platform: [ps4, switchPlatform, { ...ps4, id: 6, key: 'pc', name: 'PC' }],
          },
        })}
      />,
    )
    const dates = screen.getByText('PlayStation 4', { selector: 'a' }).closest('ul')!
    const lines = within(dates).getAllByRole('listitem')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toHaveTextContent(/PlayStation 4.*Nintendo Switch/)
    expect(lines[1]).toHaveTextContent(/2016.*PC/)
  })

  it('keeps an adult game’s cover, art and screenshots for CSS to hide, and says so (spec 3.13)', () => {
    renderWithIntl(
      <GameDetail
        handle="sample"
        layout="page"
        game={game({ adult: true })}
        tags={tags}
        platforms={platforms}
        facts={facts()}
      />,
    )
    expect(document.querySelectorAll('[data-adult-media]').length).toBeGreaterThanOrEqual(2)
    const notice = document.querySelector<HTMLElement>('[data-adult-notice]')!
    expect(notice).toHaveTextContent('This device hides adult games')
    expect(within(notice).getByRole('button', { name: 'Show adult games' })).toBeInTheDocument()
  })

  it('has no notice, and hides nothing, for any other game', () => {
    renderWithIntl(
      <GameDetail
        handle="sample"
        layout="page"
        game={game()}
        tags={tags}
        platforms={platforms}
        facts={facts()}
      />,
    )
    expect(document.querySelector('[data-adult-notice]')).toBeNull()
    expect(document.querySelector('[data-adult-media]')).toBeNull()
  })

  it('shows the game, what is recorded about it, and what IGDB says', () => {
    renderWithIntl(
      <GameDetail
        handle="sample"
        layout="page"
        game={game()}
        tags={tags}
        platforms={platforms}
        facts={facts()}
      />,
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
      <GameDetail
        handle="sample"
        layout="page"
        game={game()}
        tags={tags}
        platforms={platforms}
        facts={facts()}
      />,
    )
    const link = (name: string) => screen.getByRole('link', { name }).getAttribute('href')
    // Into the library of the shelf the game is on (ADR 004).
    expect(link('Role-playing (RPG)')).toBe('/en/u/sample?q=genre%3Arpg')
    expect(link('FromSoftware')).toBe('/en/u/sample?q=developer%3Afromsoftware')
    expect(link('PlayStation 4')).toBe('/en/u/sample?q=platform%3Aps4')
    expect(link('replay someday')).toBe('/en/u/sample?q=tag%3Areplay-someday')
    expect(link('PlayStation 4, Physical')).toBe('/en/u/sample?q=owned%3Aps4+format%3Aphysical')
  })

  it('marks IGDB’s English as English on the Portuguese site', () => {
    renderWithIntl(
      <GameDetail
        handle="sample"
        layout="page"
        game={game()}
        tags={tags}
        platforms={platforms}
        facts={facts()}
      />,
      'pt-BR',
    )
    expect(screen.getByText('A Hunter wakes in Yharnam.').closest('[lang]')).toHaveAttribute(
      'lang',
      'en',
    )
    expect(screen.getByRole('heading', { name: 'Sobre' })).toBeInTheDocument()
  })

  it('waits with ghosts for what is on its way, and draws what it has at once', () => {
    renderWithIntl(
      <GameDetail handle="sample" layout="panel" game={game()} tags={tags} platforms={platforms} />,
    )
    expect(screen.getByRole('heading', { level: 2, name: 'Bloodborne' })).toBeInTheDocument()
    expect(screen.getByText('PlayStation 4, Physical')).toBeInTheDocument()
    expect(screen.queryByText('A Hunter wakes in Yharnam.')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.ghost').length).toBeGreaterThan(0)
  })

  it('leaves out what is not there: no notes for a visitor, no story, no screenshots', () => {
    renderWithIntl(
      <GameDetail
        handle="sample"
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
        handle="sample"
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
        <GameDetail
          handle="sample"
          layout="page"
          game={game()}
          tags={tags}
          platforms={platforms}
          facts={facts()}
        />
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

  it('puts the videos first, on the game’s own pictures, and plays one from YouTube only when pressed (spec 7.1)', async () => {
    renderWithIntl(
      <GameDetail
        handle="sample"
        layout="page"
        game={game()}
        tags={tags}
        platforms={platforms}
        facts={facts({
          videos: [{ id: '2UJxaWZoK6Y', name: 'Gameplay Trailer' }, { id: 'Ga98zSE9Q3Y' }],
        })}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Videos and screenshots' })).toBeInTheDocument()
    const strip = document.querySelector<HTMLElement>('.shot-strip')!
    const tiles = within(strip).getAllByRole('button')
    expect(tiles[0]).toHaveAccessibleName('Play Gameplay Trailer, 1 of 5, Bloodborne')
    expect(tiles[1]).toHaveAccessibleName('Play Video, 2 of 5, Bloodborne')
    expect(tiles[2]).toHaveAccessibleName(/^Screenshot 3 of 5 from Bloodborne/)
    // Nothing from YouTube until a video is pressed: its tile is the game's own screenshot.
    expect(document.querySelector('iframe')).toBeNull()
    expect(tiles[0]!.querySelector('img')).toHaveAttribute(
      'src',
      expect.stringContaining('images.igdb.com'),
    )

    await userEvent.click(tiles[0]!)
    const player = await screen.findByRole('dialog', { name: 'Gameplay Trailer: Bloodborne' })
    expect(within(player).getByTitle('Gameplay Trailer: Bloodborne')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/2UJxaWZoK6Y?autoplay=1&rel=0&playsinline=1',
    )
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the strip’s arrows out of reach while there is nothing more past them', () => {
    renderWithIntl(
      <GameDetail
        handle="sample"
        layout="page"
        game={game()}
        tags={tags}
        platforms={platforms}
        facts={facts()}
      />,
    )
    for (const name of ['Scroll back', 'Scroll on']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('tabindex', '-1')
    }
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
    handlers: { onPrevious?: () => void; onNext?: () => void; pulled?: boolean } = {},
  ) =>
    renderWithIntl(
      <ShelfProvider shelf={SHELF}>
        <GamePanel
          item={entry}
          version={7}
          platforms={platforms}
          tags={tags}
          onClose={vi.fn()}
          onReturnFocus={() => false}
          {...handlers}
        />
      </ShelfProvider>,
    )

  it("is named by the game, and fetches the rest of its page for the library's version", async () => {
    open(item({ slug: 'bloodborne' }))
    const panel = screen.getByRole('dialog', { name: 'Bloodborne' })
    expect(panel).toHaveTextContent('PlayStation 4, Physical')
    await waitFor(() => expect(panel).toHaveTextContent('A Hunter wakes in Yharnam.'))
    expect(answer).toHaveBeenCalledWith('/api/v1/libraries/k3y/games/7/bloodborne')
  })

  it('keeps what it has drawn while a new version of the library fetches it again', async () => {
    const entry = item({ slug: 'nioh' })
    const panel = (version: number) => (
      <NextIntlClientProvider locale="en" messages={messages.en} timeZone="UTC">
        <ShelfProvider shelf={SHELF}>
          <GamePanel
            item={entry}
            version={version}
            platforms={platforms}
            tags={tags}
            onClose={vi.fn()}
            onReturnFocus={() => false}
          />
        </ShelfProvider>
      </NextIntlClientProvider>
    )
    const { rerender } = render(panel(7))
    await screen.findByText('A Hunter wakes in Yharnam.')

    // A rating saved: the library moves to version 8, and the facts are fetched for it.
    let arrive = () => {}
    answer.mockImplementation(
      () =>
        new Promise((resolve) => {
          arrive = () => resolve(Response.json(facts({ summary: 'Fetched for version 8.' })))
        }),
    )
    rerender(panel(8))
    expect(answer).toHaveBeenCalledWith('/api/v1/libraries/k3y/games/8/nioh')
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('A Hunter wakes in Yharnam.')
    expect(dialog.querySelector('.ghost')).toBeNull()

    act(() => arrive())
    await screen.findByText('Fetched for version 8.')
  })

  it("links to the game's full page, keeping the library's filter and leaving the rest", () => {
    address.query = 'q=genre:rpg&view=wall&shelf=ignored'
    open(item({ slug: 'bloodborne' }))
    expect(screen.getByRole('link', { name: 'Open the full page' })).toHaveAttribute(
      'href',
      '/en/u/sample/game/bloodborne?q=genre%3Arpg&view=wall',
    )
    address.query = ''
  })

  it('says so when the rest does not arrive, and offers the game’s own page', async () => {
    answer.mockImplementation(async () => new Response(null, { status: 500 }))
    open(item({ slug: 'demons-souls' }))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('link', { name: 'Open its own page' })).toHaveAttribute(
      'href',
      '/en/u/sample/game/demons-souls',
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

  describe('on a very wide window (spec 7.2)', () => {
    it('stands centered by style alone, and asks for art and a cover the size it draws them', async () => {
      open(item({ slug: 'bloodborne' }))
      const panel = screen.getByRole('dialog')
      expect(panel).toHaveClass('game-centered:w-[80rem]')
      expect(panel.querySelector('[data-hero-cover] img')).toHaveAttribute(
        'sizes',
        `${GAME_CENTERED} 224px, 128px`,
      )
      await waitFor(() =>
        expect(panel.querySelector('.game-backdrop img')).toHaveAttribute(
          'sizes',
          `${GAME_CENTERED} 80rem, 320px`,
        ),
      )
    })

    it('stays at the side beside the 3D shelf, with art for that width', async () => {
      open(item({ slug: 'bloodborne' }), { pulled: true })
      const panel = screen.getByRole('dialog')
      expect(panel.className).not.toContain('game-centered:')
      await waitFor(() =>
        expect(panel.querySelector('.game-backdrop img')).toHaveAttribute('sizes', '320px'),
      )
    })

    it('has one query for the styles and the files they ask for', async () => {
      const { readFileSync } = await import('node:fs')
      const css = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
      expect(css('../../app/globals.css')).toContain(
        `@custom-variant game-centered (@media ${GAME_CENTERED});`,
      )
      expect(css('./game-detail.css')).toContain(`@media ${GAME_CENTERED} {`)
    })
  })

  describe('on a phone, at two heights (spec 3.4)', () => {
    beforeEach(() => setDevice({ phone: true }))

    const drag = (from: number, to: number, on = screen.getByRole('dialog')) => {
      fireEvent.pointerDown(on, { pointerId: 1, button: 0, clientX: 200, clientY: from })
      fireEvent.pointerMove(on, { pointerId: 1, clientX: 200, clientY: (from + to) / 2 })
      fireEvent.pointerMove(on, { pointerId: 1, clientX: 200, clientY: to })
      fireEvent.pointerUp(on, { pointerId: 1, clientX: 200, clientY: to })
    }

    it('opens short, and its grip shows all of it and then less', async () => {
      open(item({ slug: 'bloodborne' }))
      const panel = screen.getByRole('dialog')
      expect(panel).toHaveAttribute('data-height', 'short')
      // Focus starts on Close, not on the grip.
      expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus()

      await userEvent.click(screen.getByRole('button', { name: 'Show all of this game' }))
      expect(panel).toHaveAttribute('data-height', 'full')
      const grip = screen.getByRole('button', { name: 'Show less of this game' })
      expect(grip).toHaveAttribute('aria-expanded', 'true')
      await userEvent.click(grip)
      expect(panel).toHaveAttribute('data-height', 'short')
    })

    it('shows all of it when the short sheet is tapped, or dragged up', () => {
      open(item({ slug: 'bloodborne' }))
      const panel = screen.getByRole('dialog')
      const heading = screen.getByRole('heading', { level: 2, name: 'Bloodborne' })
      fireEvent.pointerDown(heading, { pointerId: 1, button: 0, clientX: 100, clientY: 300 })
      fireEvent.pointerUp(heading, { pointerId: 1, clientX: 101, clientY: 301 })
      expect(panel).toHaveAttribute('data-height', 'full')

      // Down a little from full is nothing; down from its grip is short again.
      drag(300, 320, screen.getByRole('button', { name: 'Show less of this game' }))
      expect(panel).toHaveAttribute('data-height', 'full')
      drag(300, 420, screen.getByRole('button', { name: 'Show less of this game' }))
      expect(panel).toHaveAttribute('data-height', 'short')
      drag(500, 380)
      expect(panel).toHaveAttribute('data-height', 'full')
    })

    it('closes when the short sheet is dragged down', () => {
      const onClose = vi.fn()
      renderWithIntl(
        <ShelfProvider shelf={SHELF}>
          <GamePanel
            item={item({ slug: 'bloodborne' })}
            version={7}
            platforms={platforms}
            tags={tags}
            onClose={onClose}
            onReturnFocus={() => false}
          />
        </ShelfProvider>,
      )
      drag(400, 520)
      expect(onClose).toHaveBeenCalledOnce()
    })

    it('shows all of it when focus moves to what the short sheet hides, and only then', () => {
      open(item({ slug: 'bloodborne' }))
      const panel = screen.getByRole('dialog')
      // Safari focuses the sheet itself on a tap, wherever its edge is.
      fireEvent.focus(panel)
      expect(panel).toHaveAttribute('data-height', 'short')

      const footer = panel.querySelector<HTMLElement>('[data-sheet-footer]')!
      vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue({ top: 600 } as DOMRect)
      const hidden = within(panel).getAllByRole('link').at(-1)!
      vi.spyOn(hidden, 'getBoundingClientRect').mockReturnValue({ bottom: 900 } as DOMRect)
      fireEvent.focus(hidden)
      expect(panel).toHaveAttribute('data-height', 'full')
    })

    it('leaves a sideways swipe to the step to the next game', () => {
      const onNext = vi.fn()
      open(item({ slug: 'bloodborne' }), { onNext })
      const panel = screen.getByRole('dialog')
      fireEvent.pointerDown(panel, { pointerId: 1, button: 0, clientX: 300, clientY: 400 })
      fireEvent.pointerMove(panel, { pointerId: 1, clientX: 120, clientY: 410 })
      fireEvent.pointerUp(panel, { pointerId: 1, clientX: 120, clientY: 410 })
      expect(panel).toHaveAttribute('data-height', 'short')
    })

    it('is one height where it is a panel down the side', async () => {
      setDevice({ phone: false })
      open(item({ slug: 'bloodborne' }))
      const panel = screen.getByRole('dialog')
      drag(500, 300)
      expect(panel).toHaveAttribute('data-height', 'short')
      // The grip is for a sheet from the bottom only: drawn there, and hidden by style on the side.
      expect(screen.getByRole('button', { name: 'Show all of this game' })).toHaveClass(
        'sheet-side:hidden',
      )
    })
  })
})

describe('the address of an open game', () => {
  afterEach(() => {
    act(() => historyMoved())
    window.history.replaceState(null, '', '/')
  })

  it('reads a game’s slug from its address, and nothing from any other', () => {
    expect(gameSlugIn('/en/u/sample/game/bloodborne')).toBe('bloodborne')
    expect(gameSlugIn('/pt-BR/u/ana/game/caf%C3%A9/')).toBe('café')
    expect(gameSlugIn('/en/u/sample')).toBeUndefined()
    expect(gameSlugIn('/en/game/bloodborne')).toBeUndefined()
    expect(gameSlugIn('/en/u/sample/game/a/b')).toBeUndefined()
    expect(gameSlugIn('/en/u/sample/game/%E0%A4%A')).toBeUndefined()
  })

  it('adds the game to history with the library’s query string, and steps back once to close', () => {
    window.history.replaceState(null, '', '/pt-BR/u/ana?view=wall&q=genre%3Arpg')
    const before = window.history.length
    showGame('bloodborne')
    expect(window.location.pathname + window.location.search).toBe(
      '/pt-BR/u/ana/game/bloodborne?view=wall&q=genre%3Arpg',
    )
    expect(window.history.length).toBe(before + 1)
    replaceGame('sekiro')
    expect(window.location.pathname).toBe('/pt-BR/u/ana/game/sekiro')
    expect(window.history.length).toBe(before + 1)

    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined)
    leaveGame()
    leaveGame()
    expect(back).toHaveBeenCalledOnce()
    // A game opened before that Back arrives waits for it, then opens after the library.
    showGame('hades')
    expect(window.location.pathname).toBe('/pt-BR/u/ana/game/sekiro')
    window.history.replaceState(null, '', '/pt-BR/u/ana')
    historyMoved()
    expect(window.location.pathname).toBe('/pt-BR/u/ana/game/hades')
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
