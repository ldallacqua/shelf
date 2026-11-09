import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { ListControls } from './list-controls'

const meta = {
  title: 'Library/Beside the game/Controls',
  component: ListControls,
  decorators: [
    (Story) => (
      <div className="w-[17rem] rounded-panel border border-line bg-surface p-3">
        <Story />
      </div>
    ),
  ],
  args: { group: 'status', onGroup: () => {}, onReady: () => {} },
} satisfies Meta<typeof ListControls>
export default meta
type Story = StoryObj<typeof meta>

export const Browser: Story = {}
export const Desktop: Story = { args: { ready: false } }
export const ReadyToPlay: Story = { args: { ready: true } }
export const Ungrouped: Story = { args: { group: 'none', ready: false } }
