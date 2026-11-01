import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import type { StoreLink } from '@/domain/library/stores'
import { testGame, testPlatform } from '@/domain/library/testing'

import { Stores } from './stores'

/**
 * Where to get a game (spec 7.9), at the head of the column beside Mine. A
 * store's name is in words, never its logo.
 */

const pc = testPlatform(6, 'pc', 'pc', 'PC')
const links: StoreLink[] = [
  { store: 'steam', url: 'https://store.steampowered.com/app/620' },
  { store: 'gog', url: 'https://www.gog.com/game/a' },
  { store: 'epic', url: 'https://store.epicgames.com/p/a' },
  { store: 'microsoft', url: 'https://www.xbox.com/games/store/a/1' },
  { store: 'playstation', url: 'https://store.playstation.com/concept/1' },
  { store: 'amazon', url: 'https://amazon.com/dp/1' },
]

const meta = {
  title: 'Features/GameDetail/Stores',
  component: Stores,
  decorators: [
    (Story) => (
      <div className="max-w-88 p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    game: testGame('Ember Road'),
    links,
    platforms: new Map([[pc.id, pc]]),
    level: 'h2',
  },
} satisfies Meta<typeof Stores>

export default meta
type Story = StoryObj<typeof meta>

export const WhereToBuy: Story = {}

export const WantedHere: Story = {
  args: {
    game: testGame('Ember Road', { status: 'wishlist', wanted: [6], wantedStores: ['gog'] }),
  },
}

export const HaveItHere: Story = {
  args: {
    game: testGame('Ember Road', {
      status: 'playing',
      copies: [{ platform: 6, format: 'digital', stores: ['steam'] }],
    }),
  },
}

export const OnlySteamKnown: Story = { args: { links: links.slice(0, 1) } }

/** While the game's facts are on their way. */
export const Arriving: Story = { args: { links: undefined } }
