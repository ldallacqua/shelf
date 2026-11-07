import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { ThisComputerGhost } from './download-sources-ghost'
import { ThisComputerView } from './this-computer'

/**
 * This computer's name, in Settings, in Shelf for Windows alone (ADR 005, section 12). Until it is
 * named it is called by its place among my computers, never by Windows' name for it. The others are
 * listed under it, so that place makes sense.
 */

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

const meta = {
  title: 'Features/Desktop/ThisComputer',
  component: ThisComputerView,
  decorators: [
    (Story) => (
      <div className="max-w-5xl p-6">
        <Story />
      </div>
    ),
  ],
  args: { number: 1, others: [], onSave: () => undefined },
} satisfies Meta<typeof ThisComputerView>

export default meta
type Story = StoryObj<typeof meta>

/** The first computer, not named yet. */
export const Unnamed: Story = {}

export const Named: Story = { args: { name: 'Desktop' } }

/** The second, beside one named and one that has counted nothing yet. */
export const AmongOthers: Story = {
  args: {
    number: 2,
    others: [
      { id: 'a', number: 1, name: 'Desktop', lastSeenAt: NOW - 2 * DAY },
      { id: 'c', number: 3 },
    ],
  },
}

export const Saving: Story = { args: { name: 'Desktop', busy: true } }

export const Saved: Story = { args: { name: 'Notebook', said: { tone: 'done', text: 'Saved.' } } }

export const Failed: Story = {
  args: { said: { tone: 'trouble', text: 'The name couldn’t be saved. Try again.' } },
}

/** On its way, before its code and words are here. */
export const Ghost: Story = { render: () => <ThisComputerGhost /> }
