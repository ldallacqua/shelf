import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import type { OwnerGame } from '@/domain/library/editing'
import { testPlatform } from '@/domain/library/testing'

import { Copies } from './mine-editor'

/**
 * What I own of a game, a card to a copy (spec 7.3). One a linked account lists
 * says so, and has no button to remove it, nor a way to take its store off.
 */

const platforms = [testPlatform(6, 'pc', 'pc', 'PC'), testPlatform(48, 'ps4', 'playstation', 'PS4')]

const owned = (copies: OwnerGame['copies']): OwnerGame =>
  ({ soldOn: ['steam', 'gog', 'epic'], copies }) as OwnerGame

const meta = {
  title: 'Features/GameDetail/Copies',
  component: Copies,
  decorators: [
    (Story) => (
      <div className="max-w-88 p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    owned: owned([]),
    labels: new Map(platforms.map((each) => [each.id, each])),
    platforms,
    onFormat: () => undefined,
    onStores: () => undefined,
    onRemove: () => undefined,
    onAdd: () => undefined,
  },
} satisfies Meta<typeof Copies>

export default meta
type Story = StoryObj<typeof meta>

export const FromALinkedAccount: Story = {
  args: {
    owned: owned([
      {
        id: 'steam',
        platformId: 6,
        format: 'digital',
        stores: ['steam'],
        synced: [{ source: 'steam', minutes: 8754 }],
        readFrom: ['steam'],
      },
    ]),
  },
}

export const AddedByHand: Story = {
  args: {
    owned: owned([{ id: 'gog', platformId: 6, format: 'digital', stores: ['gog'] }]),
  },
}

export const NoLongerListed: Story = {
  args: {
    owned: owned([
      {
        id: 'old',
        platformId: 6,
        format: 'digital',
        stores: ['steam'],
        synced: [{ source: 'steam', minutes: 600 }],
      },
    ]),
  },
}

export const None: Story = {}
