import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import type { StoreName } from '@/domain/library/stores'

import { StoresField } from './stores-field'

/**
 * Which stores a download on a PC is from (spec 7.9): what it is sold on, then
 * the rest, asked for. A store a linked account lists is fixed (spec 7.3).
 */

const meta = {
  title: 'Features/Owner/StoresField',
  component: StoresField,
  decorators: [
    (Story) => (
      <div className="max-w-sm p-6">
        <Story />
      </div>
    ),
  ],
  render: function Render({ value, ...args }) {
    const [stores, setStores] = useState<readonly StoreName[]>(value)
    return <StoresField {...args} value={stores} onChange={setStores} />
  },
  args: { value: [], soldOn: ['steam', 'gog', 'epic'], onChange: () => undefined },
} satisfies Meta<typeof StoresField>

export default meta
type Story = StoryObj<typeof meta>

export const NoneChosen: Story = {}

export const Chosen: Story = { args: { value: ['gog'] } }

/** Ticked by a linked account: not mine to untick, and not faded either. */
export const FromALinkedAccount: Story = {
  args: { value: ['steam'], fixed: ['steam'], soldOn: ['steam'] },
}

/** IGDB knows nothing of it: the ones nearly every PC game is on. */
export const NothingKnown: Story = { args: { soldOn: [] } }
