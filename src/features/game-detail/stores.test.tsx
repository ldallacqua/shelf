import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { StoreLink } from '@/domain/library/stores'
import { testGame, testPlatform } from '@/domain/library/testing'
import { renderWithIntl } from '@/test/render'

import { Stores } from './stores'

const PC = testPlatform(6, 'pc', 'pc', 'PC')
const platforms = new Map([[PC.id, PC]])
const links: StoreLink[] = [
  { store: 'steam', url: 'https://store.steampowered.com/app/620' },
  { store: 'gog', url: 'https://www.gog.com/game/a' },
  { store: 'epic', url: 'https://store.epicgames.com/p/a' },
  { store: 'microsoft', url: 'https://www.xbox.com/games/store/a/1' },
  { store: 'playstation', url: 'https://store.playstation.com/concept/1' },
  { store: 'amazon', url: 'https://amazon.com/dp/1' },
]

const draw = (game: ReturnType<typeof testGame>, shown: readonly StoreLink[] | undefined = links) =>
  renderWithIntl(<Stores game={game} links={shown} platforms={platforms} level="h2" />)

describe('where to get a game (spec 7.9)', () => {
  it('links to each store in a tab of its own, and says so', () => {
    draw(testGame('A'))
    const steam = screen.getByRole('link', { name: /^Steam/ })
    expect(steam).toHaveAttribute('href', 'https://store.steampowered.com/app/620')
    expect(steam).toHaveAttribute('target', '_blank')
    expect(steam).toHaveAttribute('rel', 'noopener noreferrer')
    expect(steam).toHaveAccessibleName('Steam (opens in a new tab)')
  })

  it('is where to buy a game I don’t have, with the first few out of the fold', () => {
    draw(testGame('A'))
    expect(screen.getByRole('heading', { name: 'Where to buy' })).toBeInTheDocument()
    expect(screen.getByText('2 more stores')).toBeInTheDocument()
    const lists = screen.getAllByRole('list', { hidden: true })
    expect(within(lists[0]!).getAllByRole('link')).toHaveLength(4)
  })

  it('stands the store I want it from first, in words as well as color', () => {
    draw(testGame('A', { status: 'wishlist', wanted: [6], wantedStores: ['epic'] }))
    expect(screen.getByRole('heading', { name: 'Where to buy' })).toBeInTheDocument()
    const first = screen.getAllByRole('link')[0]!
    expect(first).toHaveAccessibleName('Epic Games I want it here (opens in a new tab)')
    expect(first).toHaveAttribute('data-mine')
  })

  it('is only stores on a game I have: mine out of the fold, the rest behind it', () => {
    draw(
      testGame('A', {
        status: 'playing',
        copies: [{ platform: 6, format: 'digital', stores: ['gog'] }],
      }),
    )
    expect(screen.getByRole('heading', { name: 'Stores' })).toBeInTheDocument()
    expect(screen.getAllByRole('link')[0]).toHaveAccessibleName(
      'GOG I have it here (opens in a new tab)',
    )
    expect(screen.getByText('5 more stores')).toBeInTheDocument()
  })

  it('offers them all behind the fold when none of them is mine', () => {
    draw(testGame('A', { status: 'playing', copies: [{ platform: 6, format: 'digital' }] }))
    expect(screen.getByText('See 6 stores')).toBeInTheDocument()
  })

  it('names a store with no page, without a link, when it is where I keep the game', () => {
    draw(
      testGame('A', {
        status: 'playing',
        copies: [{ platform: 6, format: 'digital', stores: ['battlenet'] }],
      }),
      [],
    )
    expect(screen.getByText('Battle.net')).toBeInTheDocument()
    expect(screen.getByText('I have it here')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('is not there for a game no store is known for', () => {
    const { container } = draw(testGame('A'), [])
    expect(container).toBeEmptyDOMElement()
  })

  it('holds its place with ghosts until the facts come', () => {
    const { container } = renderWithIntl(
      <Stores game={testGame('A')} platforms={platforms} level="h2" />,
    )
    expect(screen.getByRole('heading', { name: 'Where to buy' })).toBeInTheDocument()
    expect(container.querySelectorAll('.ghost')).toHaveLength(4)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
