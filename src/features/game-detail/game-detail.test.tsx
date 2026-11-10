import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameFacts } from '@/domain/library/game-page'
import type { LibraryGame, LibraryPlatform } from '@/domain/library/library'
import { renderWithIntl } from '@/test/render'

import { LibraryLink } from './back-to-library'
import { GameDetail } from './game-detail'
import { FromLibrary, handOff, PageDrawn } from './hand-off'
import { morph } from './morph'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

const address = vi.hoisted(() => ({ query: '', params: {} as Record<string, string> }))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(address.query),
  useParams: () => address.params,
}))

/** A game's page (spec 7.1), and opening it from the library (spec 7.2). */

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
  it('writes IGDB’s text in its paragraphs, and keeps the rest of a long one behind Read more', () => {
    const long = Array.from(
      { length: 6 },
      (_, at) => `Paragraph ${at + 1}. ${'Words. '.repeat(20)}`,
    )
    renderWithIntl(
      <GameDetail
        handle="sample"
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
    expect(details).not.toHaveTextContent('1.9K ratings')
    const scores = screen.getByRole('heading', { name: 'Scores' }).parentElement!
    expect(scores).toHaveTextContent('91')
    expect(scores).toHaveTextContent('1.9K ratings')
  })

  it('makes every value under Details a link to the library filtered by it', () => {
    renderWithIntl(
      <GameDetail
        handle="sample"
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
    renderWithIntl(<GameDetail handle="sample" game={game()} tags={tags} platforms={platforms} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Bloodborne' })).toBeInTheDocument()
    expect(screen.getByText('PlayStation 4, Physical')).toBeInTheDocument()
    expect(screen.queryByText('A Hunter wakes in Yharnam.')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.ghost').length).toBeGreaterThan(0)
  })

  it('leaves out what is not there: no notes for a visitor, no story, no screenshots', () => {
    renderWithIntl(
      <GameDetail
        handle="sample"
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

describe('a game opened from the library', () => {
  afterEach(() => {
    address.params = {}
    Reflect.deleteProperty(window, 'navigation')
  })

  it('is drawn at once from what the library handed off, and only for that game', () => {
    const page = <h1>Handed off</h1>
    handOff({ handle: 'sample', slug: 'bloodborne', page, withList: page })
    address.params = { handle: 'sample', slug: 'bloodborne' }
    const { unmount } = renderWithIntl(
      <FromLibrary>
        <p>Ghosts</p>
      </FromLibrary>,
    )
    expect(screen.getByRole('heading', { name: 'Handed off' })).toBeInTheDocument()
    unmount()

    address.params = { handle: 'sample', slug: 'sekiro' }
    renderWithIntl(
      <FromLibrary>
        <p>Ghosts</p>
      </FromLibrary>,
    )
    expect(screen.getByText('Ghosts')).toBeInTheDocument()
  })

  it('goes back to the library when the library is the page before, and leads to it otherwise', async () => {
    const back = vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
    const entries = [{ url: `${window.location.origin}/en/u/sample?view=wall` }, { url: null }]
    Object.defineProperty(window, 'navigation', {
      configurable: true,
      value: { currentEntry: { index: 1 }, entries: () => entries },
    })
    renderWithIntl(<LibraryLink handle="sample" />)
    const link = screen.getByRole('link', { name: 'Library' })
    expect(link).toHaveAttribute('href', '/en/u/sample')
    await userEvent.click(link)
    expect(back).toHaveBeenCalledOnce()
    expect(back).toHaveBeenCalledWith(-1)

    entries.splice(
      1,
      0,
      { url: `${window.location.origin}/en/u/sample/game/ember` },
      { url: `${window.location.origin}/en/u/sample/game/tide` },
    )
    Object.defineProperty(window, 'navigation', {
      configurable: true,
      value: { currentEntry: { index: 3 }, entries: () => entries },
    })
    fireEvent.click(link)
    expect(back).toHaveBeenLastCalledWith(-3)

    // Arrived from elsewhere, or from another shelf: the link leads to the library.
    entries[0] = { url: `${window.location.origin}/en/u/other` }
    fireEvent.click(link)
    expect(back).toHaveBeenCalledTimes(2)
    back.mockRestore()
  })
})

describe('morph', () => {
  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition')
    vi.useRealTimers()
  })

  /** A browser that runs a transition's update at once, and finishes it when asked. */
  const transitions = () => {
    const seen: string[] = []
    let finish = () => {}
    let updated: Promise<void> = Promise.resolve()
    const skipped = vi.fn()
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => Promise<void>) => {
        updated = update()
        return {
          finished: new Promise<void>((resolve) => (finish = resolve)),
          ready: Promise.resolve(),
          updateCallbackDone: updated,
          skipTransition: skipped,
        }
      },
    })
    return { seen, skipped, finish: () => finish(), updated: () => updated }
  }

  it('simply goes to the page where the browser cannot carry the cover', () => {
    const go = vi.fn()
    const from = document.createElement('span')
    morph(from, go)
    expect(go).toHaveBeenCalledOnce()
    expect(from.style.viewTransitionName).toBe('')
  })

  it('names the cover at each end for the one transition only, landing once the page is drawn', async () => {
    const browser = transitions()
    const from = document.createElement('span')
    document.body.append(from)
    let seenAtGo = ''
    morph(from, () => {
      seenAtGo = from.style.viewTransitionName
      renderWithIntl(
        <span data-hero-cover="">
          <PageDrawn />
        </span>,
      )
    })
    expect(seenAtGo).toBe('')
    await browser.updated()
    const hero = document.querySelector<HTMLElement>('[data-hero-cover]')!
    expect(hero.style.viewTransitionName).toBe('game-cover')
    expect(browser.skipped).not.toHaveBeenCalled()
    browser.finish()
    await waitFor(() => expect(hero.style.viewTransitionName).toBe(''))
    expect(from.style.viewTransitionName).toBe('')
    from.remove()
  })

  it('does not fly toward a page that is late: the page simply comes when it comes', async () => {
    vi.useFakeTimers()
    const browser = transitions()
    const from = document.createElement('span')
    const go = vi.fn()
    morph(from, go)
    expect(go).toHaveBeenCalledOnce()
    let done = false
    void browser.updated().then(() => (done = true))
    await vi.advanceTimersByTimeAsync(299)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
    expect(browser.skipped).toHaveBeenCalledOnce()
    browser.finish()
  })
})
