import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_CONTENDERS } from '@/domain/duel/bracket'
import { testGame } from '@/domain/library/testing'
import type { Library } from '@/domain/library/library'
import type { AccountState } from '@/features/owner/account'
import { renderWithIntl } from '@/test/render'

import { DuelPage, SignedInDuel } from './duel-page'
import { sampleLibrary } from './duel-samples'
import { CHOICE_SHOWS_MS } from './face-off'

vi.mock('@/i18n/navigation', () => import('@/test/navigation'))

let who: AccountState = { status: 'checking' }
vi.mock('@/features/owner/account', () => ({ useAccount: () => who }))

const announced = vi.hoisted(() => vi.fn())
vi.mock('@/features/owner/library-change', () => ({ announceChange: announced }))

/**
 * The duel (spec 3.14): choosing the games, a duel face to face with its facts, a choice by
 * button and by key, Undo, the game left set to Playing, the device's memory of a duel, a game
 * that left the shelf, and the page for nobody signed in.
 */

let handle = 0
const nextHandle = () => `tester-${(handle += 1)}`

const play = vi.fn(async () => ({ ok: true as const, value: { version: 9 } }))

function open(library: Library = sampleLibrary, as = nextHandle()) {
  const read = vi.fn(async () => library)
  const view = renderWithIntl(<SignedInDuel handle={as} read={read} play={play} />)
  return { ...view, read, as }
}

/** Presses a game in the list to put it in, or take it out of, the duel. */
const toggle = (title: string) =>
  userEvent.click(
    within(screen.getByRole('list', { name: 'Games to choose from' })).getByRole('button', {
      name: new RegExp(`^${title}`),
    }),
  )

const start = () => userEvent.click(screen.getAllByRole('button', { name: 'Start the duel' })[0]!)

/** Waits for the choice to show and the next two to step in. */
const settle = () => act(() => new Promise((done) => setTimeout(done, CHOICE_SHOWS_MS + 20)))

beforeEach(() => {
  window.localStorage.clear()
  play.mockClear()
  announced.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('choosing the games', () => {
  it('lists what is waiting, by title, and counts the duels the chosen make', async () => {
    open()
    const list = await screen.findByRole('list', { name: 'Games to choose from' })
    const titles = within(list)
      .getAllByRole('button')
      .map((button) => button.textContent)
    expect(titles[0]).toMatch(/^Celeste/)
    expect(titles.some((title) => title?.startsWith('Silksong'))).toBe(false)
    // Start waits for two.
    for (const button of screen.getAllByRole('button', { name: 'Start the duel' })) {
      expect(button).toBeDisabled()
    }
    await toggle('Celeste')
    await toggle('Hades')
    await toggle('Inside')
    expect(screen.getAllByText('3 games · 2 duels').length).toBeGreaterThan(0)
    expect(within(list).getByRole('button', { name: /^Celeste/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    for (const button of screen.getAllByRole('button', { name: 'Start the duel' })) {
      expect(button).toBeEnabled()
    }
  })

  it('draws games at random, and offers a draw only as large as the list', async () => {
    open()
    await screen.findByRole('list', { name: 'Games to choose from' })
    await userEvent.click(screen.getByRole('button', { name: 'Draw up to 4 games at random' }))
    expect(screen.getAllByText('4 games · 3 duels').length).toBeGreaterThan(0)
    // A screen reader hears what the draw made.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('4 games · 3 duels'))
    // Four are in: a draw of four has nothing to add. Eight in the backlog: sixteen can't be drawn.
    expect(screen.getByRole('button', { name: 'Draw up to 4 games at random' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Draw up to 16 games at random' })).toBeDisabled()
  })

  it('keeps the games chosen by hand when it draws the rest', async () => {
    open()
    await screen.findByRole('list', { name: 'Games to choose from' })
    await toggle('Inside')
    await toggle('Tunic')
    await userEvent.click(screen.getByRole('button', { name: 'Draw up to 8 games at random' }))
    const list = screen.getByRole('list', { name: 'Games to choose from' })
    for (const title of ['Inside', 'Tunic']) {
      expect(within(list).getByRole('button', { name: new RegExp(`^${title}`) })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    }
    expect(screen.getAllByText('8 games · 7 duels').length).toBeGreaterThan(0)
  })

  it('opens on the statuses that have games, when the ones kept have none', async () => {
    open({
      ...sampleLibrary,
      games: sampleLibrary.games.filter((game) => game.status !== 'backlog'),
    })
    const list = await screen.findByRole('list', { name: 'Games to choose from' })
    expect(within(list).getByRole('button', { name: /^Silksong/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Wishlist/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('keeps a status pressed off, even the last one', async () => {
    open()
    await screen.findByRole('list', { name: 'Games to choose from' })
    await userEvent.click(screen.getByRole('button', { name: /^Backlog/ }))
    expect(screen.getByRole('button', { name: /^Backlog/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByRole('button', { name: /^Wishlist/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(
      screen.getByText('No games with these statuses. Choose another above.'),
    ).toBeInTheDocument()
  })

  it('clears what is chosen from the bar below a wide screen too', async () => {
    const { container } = open()
    await screen.findByRole('list', { name: 'Games to choose from' })
    await toggle('Celeste')
    const bar = container.querySelector('.duel-bar') as HTMLElement
    await userEvent.click(within(bar).getByRole('button', { name: 'Clear' }))
    expect(within(bar).getByText('Nothing chosen yet')).toBeInTheDocument()
  })

  it('tells a screen reader how many games a search finds, once typing pauses', async () => {
    open()
    await screen.findByRole('list', { name: 'Games to choose from' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a game' }), 'in')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^\d+ games? match/))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a game' }), 'zzz')
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No games match'))
    expect(screen.getByText('No game here called “inzzz”.')).toBeInTheDocument()
  })

  it('takes games from other statuses too, each then saying its own', async () => {
    open()
    await screen.findByRole('list', { name: 'Games to choose from' })
    await userEvent.click(screen.getByRole('button', { name: /Wishlist/ }))
    const list = screen.getByRole('list', { name: 'Games to choose from' })
    expect(within(list).getByRole('button', { name: /^Silksong/ })).toHaveTextContent('Wishlist')
  })

  it('says so, in words, when a seventeenth game is pressed', async () => {
    const many = Array.from({ length: 18 }, (_, index) =>
      testGame(`Game ${String(index).padStart(2, '0')}`),
    )
    open({ ...sampleLibrary, games: many })
    await screen.findByRole('list', { name: 'Games to choose from' })
    for (let index = 0; index < MAX_CONTENDERS; index += 1)
      await toggle(`Game ${String(index).padStart(2, '0')}`)
    await toggle('Game 16')
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('A duel holds 16 games at most'),
    )
    // Beside the count too, where the eye is: the panel and the bar below a wide screen.
    expect(
      within(screen.getByRole('complementary', { name: 'In the duel' })).getByText(
        /A duel holds 16 games at most/,
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'Games to choose from' })).getByRole('button', {
        name: /^Game 16/,
      }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('finds a game by its title, without its accents', async () => {
    open({ ...sampleLibrary, games: [...sampleLibrary.games, testGame('Ōkami')] })
    await screen.findByRole('list', { name: 'Games to choose from' })
    await userEvent.type(screen.getByRole('searchbox', { name: 'Find a game' }), 'okami')
    const list = screen.getByRole('list', { name: 'Games to choose from' })
    expect(within(list).getAllByRole('button')).toHaveLength(1)
  })

  it('says what goes here when there is nothing to choose from', async () => {
    open({ ...sampleLibrary, games: [testGame('Done', { status: 'completed' })] })
    expect(await screen.findByText('Nothing to put face to face yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to your shelf' })).toBeInTheDocument()
  })

  it('leads to Organize when the games only wait for a status', async () => {
    open({
      ...sampleLibrary,
      games: [
        testGame('Synced', { status: 'unsorted' }),
        testGame('Other', { status: 'unsorted' }),
      ],
    })
    expect(await screen.findByText(/Your shelf has 2 games with no status yet/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Organize' })).toHaveAttribute(
      'href',
      '/en/account/unsorted',
    )
  })
})

describe('a duel', () => {
  async function inDuel(games = ['Celeste', 'Hades', 'Inside', 'Tunic']) {
    const view = open()
    await screen.findByRole('list', { name: 'Games to choose from' })
    for (const title of games) await toggle(title)
    await start()
    await screen.findByRole('table')
    return view
  }

  const sides = () =>
    screen
      .getAllByRole('button', { name: /^Choose / })
      .map((button) => button.getAttribute('aria-label')!.replace('Choose ', ''))

  it('sets two games face to face, with their facts as a table and the round named', async () => {
    await inDuel()
    expect(screen.getByRole('heading', { level: 2, name: /Semifinals/ })).toHaveFocus()
    expect(screen.getByText('Duel 1 of 2')).toBeInTheDocument()
    expect(screen.getByText('0 of 3 duels played')).toBeInTheDocument()
    const [a, b] = sides()
    const table = screen.getByRole('table', { name: `${a} and ${b} side by side` })
    expect(within(table).getByRole('columnheader', { name: a })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: 'Time to beat' })).toBeInTheDocument()
    expect(within(table).getByRole('rowheader', { name: 'IGDB rating' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: `Open the page for ${a}` })).toBeInTheDocument()
  })

  it('sends the chosen game on, and says who meets next', async () => {
    await inDuel()
    const [a] = sides()
    await userEvent.click(screen.getByRole('button', { name: `Choose ${a}` }))
    await settle()
    expect(screen.getByText('1 of 3 duels played')).toBeInTheDocument()
    const [c, d] = sides()
    expect(screen.getByText(`${a} goes on. Next: ${c} or ${d}.`)).toBeInTheDocument()
  })

  it('chooses with ← and →, and Undo takes the choice back', async () => {
    await inDuel()
    const before = sides()
    await userEvent.keyboard('{ArrowRight}')
    await settle()
    expect(sides()).not.toEqual(before)
    await userEvent.click(screen.getByRole('button', { name: 'Undo the last choice' }))
    expect(sides()).toEqual(before)
    expect(screen.getByText(`Back to ${before[0]} or ${before[1]}.`)).toBeInTheDocument()
  })

  it('shows the bracket, with the duel being played marked', async () => {
    await inDuel()
    const bracket = screen.getByRole('region', { name: 'The bracket' })
    expect(within(bracket).getByText('Now')).toBeInTheDocument()
    expect(within(bracket).getAllByText('To be decided')).toHaveLength(2)
  })

  it('names the game left, and sets it to Playing when asked', async () => {
    await inDuel()
    for (let duel = 0; duel < 3; duel += 1) {
      await userEvent.keyboard('{ArrowLeft}')
      await settle()
    }
    expect(await screen.findByText('Your next game')).toBeInTheDocument()
    // Focus moves to the game left, so a screen reader hears it.
    expect(document.activeElement?.tagName).toBe('H2')
    expect(screen.getByText(/^Won all 2 of its duels, against/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Start playing it' }))
    expect(play).toHaveBeenCalledWith(expect.any(String), { status: 'playing' })
    expect(await screen.findByText(/is now Playing on your shelf/)).toBeInTheDocument()
    // A choice acted on is not taken back: the game stays Playing.
    expect(screen.queryByRole('button', { name: 'Undo the final' })).not.toBeInTheDocument()
    expect(announced).toHaveBeenCalledWith(expect.objectContaining({ version: 9 }))
  })

  it('takes the final back, to the duel it was', async () => {
    await inDuel(['Celeste', 'Hades'])
    const pair = sides()
    await userEvent.keyboard('{ArrowLeft}')
    await settle()
    await userEvent.click(await screen.findByRole('button', { name: 'Undo the final' }))
    expect(await screen.findByRole('heading', { level: 2, name: /Final/ })).toHaveFocus()
    expect(sides()).toEqual(pair)
  })

  it('leaves the arrows to a menu open over the duel', async () => {
    await inDuel()
    const before = sides()
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    document.body.append(menu)
    await userEvent.keyboard('{ArrowLeft}')
    await settle()
    expect(sides()).toEqual(before)
    menu.remove()
  })

  it('says a lone duel in the singular, and keeps the final of a game already Playing', async () => {
    open()
    await screen.findByRole('list', { name: 'Games to choose from' })
    await toggle('Celeste')
    await userEvent.click(screen.getByRole('button', { name: /^Playing/ }))
    await toggle('Final Fantasy XVI')
    await start()
    expect(await screen.findByText('0 of 1 duel played')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Choose Final Fantasy XVI' }))
    await settle()
    expect(await screen.findByText('Already playing')).toBeInTheDocument()
    // Already Playing: the choice was acted on, so it isn't taken back here.
    expect(screen.queryByRole('button', { name: 'Undo the final' })).not.toBeInTheDocument()
  })

  it('says so when the game left could not be set to Playing', async () => {
    play.mockResolvedValueOnce({ ok: false, reason: 'failed' } as never)
    await inDuel(['Celeste', 'Hades'])
    await userEvent.keyboard('{ArrowLeft}')
    await settle()
    await userEvent.click(await screen.findByRole('button', { name: 'Start playing it' }))
    expect(await screen.findByText(/couldn’t be set to Playing/)).toBeInTheDocument()
  })

  it('asks before changing the games once a duel was played, and keeps them chosen', async () => {
    await inDuel()
    await userEvent.keyboard('{ArrowLeft}')
    await settle()
    await userEvent.click(screen.getByRole('button', { name: 'Change the games' }))
    const question = await screen.findByRole('alertdialog')
    await userEvent.click(within(question).getByRole('button', { name: 'Change the games' }))
    expect(await screen.findByRole('heading', { name: 'Choose the contenders' })).toHaveFocus()
    expect(screen.getAllByText('4 games · 3 duels').length).toBeGreaterThan(0)
  })

  it('is where it was left when the page opens again', async () => {
    const { unmount, as } = await inDuel()
    await userEvent.keyboard('{ArrowLeft}')
    await settle()
    const now = sides()
    unmount()
    open(sampleLibrary, as)
    await screen.findByRole('table')
    expect(sides()).toEqual(now)
    expect(screen.getByText('1 of 3 duels played')).toBeInTheDocument()
  })

  it('ends a duel whose game left the shelf, keeping the others chosen', async () => {
    const { unmount, as } = await inDuel()
    unmount()
    const gone = sampleLibrary.games.filter((game) => game.title !== 'Inside')
    open({ ...sampleLibrary, games: gone }, as)
    expect(await screen.findByText(/A game in your last duel left your shelf/)).toBeInTheDocument()
    expect(screen.getAllByText('3 games · 2 duels').length).toBeGreaterThan(0)
  })
})

describe('the page', () => {
  it('asks a visitor to sign in', () => {
    who = { status: 'visitor' }
    renderWithIntl(<DuelPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Duel' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('draws its ghosts, and says why, while it asks who is signed in', () => {
    who = { status: 'checking' }
    renderWithIntl(<DuelPage />)
    expect(screen.getByRole('status')).toHaveTextContent('Getting your games ready for the duel')
  })

  it('says so when the games could not be read, and tries again', async () => {
    const read = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValue(sampleLibrary)
    renderWithIntl(<SignedInDuel handle={nextHandle()} read={read} play={play} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t be read')
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Games to choose from' })).toBeInTheDocument(),
    )
  })
})
