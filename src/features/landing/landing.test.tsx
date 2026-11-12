import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { presetNames } from '@/domain/colorway/names'
import { DOWNLOAD_WINDOWS } from '@/domain/desktop/release'
import { setDevice } from '@/test/device'
import { renderWithIntl } from '@/test/render'

import { AskDemo } from './ask-demo'
import { matchesOf } from './ask-engine'
import { landingParts } from './coverage'
import { askMatches, demoGames } from './demo'
import { Landing } from './landing'
import { FIRST_LOOK } from './look-demo'
import { overviewParts } from './overview'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

/** Every observer the page makes, so a test can say what has come into view. */
const watchers: Watcher[] = []
class Watcher {
  readonly targets = new Set<Element>()
  readonly callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    watchers.push(this)
  }
  observe(target: Element) {
    this.targets.add(target)
  }
  unobserve(target: Element) {
    this.targets.delete(target)
  }
  disconnect() {
    this.targets.clear()
  }
}

const comeIntoView = () =>
  act(() => {
    for (const watcher of watchers) {
      const entries = [...watcher.targets].map(
        (target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry,
      )
      if (entries.length > 0) watcher.callback(entries, watcher as unknown as IntersectionObserver)
    }
  })

beforeEach(() => {
  watchers.length = 0
  vi.stubGlobal('IntersectionObserver', Watcher)
  vi.stubGlobal('CSS', { supports: () => true })
})

afterEach(() => {
  setDevice({ reducedMotion: false })
  vi.useRealTimers()
})

const total = demoGames().length
const matches = askMatches()
const counted = (count: number) => `${count} of ${total} games`

describe('the landing page', () => {
  it('has one main heading, its call to action to sign up, and a section for each part', () => {
    renderWithIntl(<Landing />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Every game you own, on one shelf.' }),
    ).toBeInTheDocument()
    const calls = screen.getAllByRole('link', { name: 'Create your shelf' })
    expect(calls).toHaveLength(2)
    for (const call of calls) expect(call).toHaveAttribute('href', '/en/sign-up')
    for (const name of [
      'Everything a big collection needs.',
      'Ask it anything.',
      'One game. Every copy.',
      'Add a game in seconds. Or a hundred.',
      'Shelf, wall, list or banners.',
      'Paint the room your way.',
      'Press Play on your shelf.',
      'See how far you got.',
      'Yours to show, or to keep.',
      'Ask your assistant what to play.',
      'Ready in a minute.',
      'Your shelf is waiting.',
      'Before you start',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
  })

  it('draws every part its map of the spec names, in that order (coverage.ts)', () => {
    const { container } = renderWithIntl(<Landing />)
    const drawn = landingParts.map((part) => container.querySelector(`#${part}`))
    expect(drawn.every(Boolean)).toBe(true)
    const order = [...container.querySelectorAll('[id]')]
      .map((element) => element.id)
      .filter((id) => (landingParts as readonly string[]).includes(id))
    expect(order).toEqual([...landingParts])
  })

  it('leads from the overview to a part of the page for each tile', () => {
    renderWithIntl(<Landing />)
    const overview = screen.getByRole('region', { name: 'Everything a big collection needs.' })
    const links = within(overview).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      overviewParts.map((part) => `#${part}`),
    )
    for (const part of overviewParts) expect(document.getElementById(part)).not.toBeNull()
  })

  it('offers Shelf for Windows, through the address that always names the newest installer', () => {
    renderWithIntl(<Landing />)
    const downloads = screen.getAllByRole('link', { name: 'Download for Windows' })
    // The first screen, the app's own part and the close.
    expect(downloads).toHaveLength(3)
    for (const link of downloads) expect(link).toHaveAttribute('href', DOWNLOAD_WINDOWS)
    expect(screen.getByRole('link', { name: 'Release notes' })).toHaveAttribute(
      'href',
      'https://github.com/ldallacqua/shelf/releases',
    )
  })

  it('paints the example shelf in any colorway, with no script: a chip and a room for each', () => {
    renderWithIntl(<Landing />)
    const chips = within(screen.getByRole('group', { name: 'Colorway' })).getAllByRole('radio')
    expect(chips.map((chip) => chip.getAttribute('value'))).toEqual([...presetNames])
    expect(screen.getByRole('radio', { name: 'Ocean' })).toBeChecked()
    expect(FIRST_LOOK).toBe('ocean')
    for (const name of presetNames) {
      const room = document.querySelector(`[data-stage='${name}']`)
      expect(room?.getAttribute('data-colors')).toBe(name)
      expect(room?.querySelector("[data-theme='dark']")).not.toBeNull()
      expect(room?.querySelector("[data-theme='light']")).not.toBeNull()
    }
    // landing.css shows the room of the chip that is checked (`coverage.test.ts` holds its rules).
  })

  it('names the example shelf, and every cover on it, for people who cannot see them', () => {
    renderWithIntl(<Landing />)
    expect(screen.getByRole('img', { name: /^An example shelf of 24 games/ })).toBeInTheDocument()
    for (const image of document.querySelectorAll('img')) {
      // A cover beside its title, in a list, is decoration; a cover alone says which game.
      expect(image.getAttribute('alt')).not.toBeNull()
    }
  })

  it('links to no shelf: its example shelf is drawn here alone, with none in production', () => {
    renderWithIntl(<Landing />)
    const shelves = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
      .filter((href) => href?.includes('/u/'))
    expect(shelves).toEqual([])
  })

  it('is fully translated', () => {
    renderWithIntl(<Landing />, 'pt-BR')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Todos os seus jogos, em uma estante.' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Crie sua estante' })).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: 'Baixar para Windows' })).toHaveLength(3)
    expect(screen.getByRole('region', { name: 'Pergunte o que quiser.' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Pinte o cômodo do seu jeito.' })).toBeInTheDocument()
  })
})

describe('Ask it anything', () => {
  it('narrows the example shelf as its filters switch on, in any mix', async () => {
    setDevice({ reducedMotion: true })
    const user = userEvent.setup()
    renderWithIntl(<AskDemo games={demoGames()} matches={matches} />)
    const results = screen.getByRole('list', { name: 'Games the filter finds' })
    expect(screen.getByText(`All ${total} games`)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Under 10 hours' }))
    expect(screen.getByText(counted(matches.short.length))).toBeInTheDocument()
    expect(within(results).getAllByRole('listitem')).toHaveLength(matches.short.length)

    await user.click(screen.getByRole('button', { name: 'On Switch' }))
    const both = matches.short.filter((slug) => matches.switch.includes(slug))
    expect(screen.getByText(counted(both.length))).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toHaveValue('length:<10 owned:switch')

    await user.click(screen.getByRole('button', { name: 'Under 10 hours' }))
    expect(screen.getByText(counted(matches.switch.length))).toBeInTheDocument()
  })

  it('answers a filter typed in the filter language', async () => {
    setDevice({ reducedMotion: true })
    const user = userEvent.setup()
    renderWithIntl(<AskDemo games={demoGames()} matches={matches} />)

    await user.type(screen.getByRole('searchbox'), 'rating:>=9')
    expect(
      await screen.findByText(counted(matchesOf('rating:>=9').slugs.length)),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear the filter' }))
    expect(screen.getByText(`All ${total} games`)).toBeInTheDocument()
  })

  it('switches its filters on in turn once it is in view, until the visitor takes over', () => {
    vi.useFakeTimers()
    renderWithIntl(<AskDemo games={demoGames()} matches={matches} />)
    act(() => vi.advanceTimersByTime(10_000))
    // Not in view yet: nothing plays.
    expect(screen.getByText(`All ${total} games`)).toBeInTheDocument()

    comeIntoView()
    act(() => vi.advanceTimersByTime(10_000))
    for (const name of ['Not started', 'Under 10 hours', 'On Switch']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    }
    const all = matches.unplayed.filter(
      (slug) => matches.short.includes(slug) && matches.switch.includes(slug),
    )
    expect(screen.getByText(counted(all.length))).toBeInTheDocument()
  })

  it('plays nothing by itself under reduced motion', () => {
    vi.useFakeTimers()
    setDevice({ reducedMotion: true })
    renderWithIntl(<AskDemo games={demoGames()} matches={matches} />)
    comeIntoView()
    act(() => vi.advanceTimersByTime(10_000))
    expect(screen.getByText(`All ${total} games`)).toBeInTheDocument()
  })
})
