import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Ghost, GhostText, Loading } from './ghost'
import { Ghosts } from './ghosts'

const meta = {
  title: 'UI/Ghost',
  component: Ghost,
} satisfies Meta<typeof Ghost>

export default meta
type Story = StoryObj

/** A paragraph, a line of each type, and the shapes of a control and of a cover. */
export const Shapes: Story = {
  render: () => (
    <div className="grid max-w-md gap-6 p-6">
      <Ghosts lines={3} />
      <div className="grid gap-2">
        <span className="title text-2xl">
          <GhostText className="w-2/3" />
        </span>
        <span className="text-sm">
          <GhostText className="w-1/2" />
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Ghost className="aspect-[3/4] w-14 flex-none rounded-[4px]" />
        <Ghost className="h-10 flex-1 rounded-control" />
        <Ghost className="h-9 w-20 rounded-full" />
      </div>
    </div>
  ),
}

/** What a list draws while it is read: a screen reader hears the label, and the eye sees rows. */
export const WhileItLoads: Story = {
  render: () => (
    <Loading label="Loading your games…" className="grid max-w-md gap-3 p-6">
      {Array.from({ length: 4 }, (_, row) => (
        <div key={row} className="flex items-center gap-3">
          <Ghost order={row} className="aspect-[3/4] w-10 flex-none rounded-[3px]" />
          <span className="grid flex-1 gap-1">
            <GhostText order={row} className="w-1/2" />
            <span className="text-sm">
              <GhostText order={row} className="w-1/3" />
            </span>
          </span>
        </div>
      ))}
    </Loading>
  ),
}
