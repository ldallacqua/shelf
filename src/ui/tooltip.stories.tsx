import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { ArrowUpIcon, ShuffleIcon, XIcon } from 'lucide-react'

import { Button } from './button'
import { Tip, TipProvider } from './tooltip'

const meta = {
  title: 'UI/Tip',
  component: Tip,
} satisfies Meta<typeof Tip>

export default meta
type Story = StoryObj

/**
 * Hover or Tab along the row: after the first, each opens at once. A click,
 * or focus put there by a sheet, shows none.
 */
export const IconButtons: Story = {
  render: () => (
    <TipProvider>
      <div className="flex gap-2 p-12">
        <Tip label="Shuffle again">
          <Button size="icon" aria-label="Shuffle again">
            <ShuffleIcon aria-hidden="true" />
          </Button>
        </Tip>
        <Tip label="Reverse the order" describes>
          <Button size="icon" aria-label="Title, ascending">
            <ArrowUpIcon aria-hidden="true" />
          </Button>
        </Tip>
        <Tip label="Clear the search">
          <Button variant="ghost" size="icon" aria-label="Clear the search">
            <XIcon aria-hidden="true" />
          </Button>
        </Tip>
      </div>
    </TipProvider>
  ),
}
