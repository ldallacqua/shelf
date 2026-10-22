import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setDevice } from '@/test/device'
import { renderWithIntl } from '@/test/render'

import { AskDemo } from './ask-demo'
import { matchesOf } from './ask-engine'
import { askMatches, demoGames } from './demo'
import { Landing } from './landing'

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
      'Ask it anything.',
      'One game. Every copy.',
      'Add a game in seconds. Or a hundred.',
      'Shelf, wall or list.',
      'See how far you got.',
      'Yours to show, or to keep.',
      'Ask your assistant what to play.',
      'Your shelf is waiting.',
      'Before you start',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument()
    }
  })

  it('names the example shelf, and every cover on it, for people who cannot see them', () => {
    renderWithIntl(<Landing />)
    expect(screen.getByRole('img', { name: /^An example shelf of 24 games/ })).toBeInTheDocument()
    for (const image of document.querySelectorAll('img')) {
      // A cover beside its title, in a list, is decoration; a cover alone says which game.
      expect(image.getAttribute('alt')).not.toBeNull()
    }
  })

  it('is fully translated', () => {
    renderWithIntl(<Landing />, 'pt-BR')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Todos os seus jogos, em uma estante.' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Crie a sua estante' })).toHaveLength(2)
    expect(screen.getByRole('region', { name: 'Pergunte o que quiser.' })).toBeInTheDocument()
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
