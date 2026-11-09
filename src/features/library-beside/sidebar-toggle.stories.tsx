import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import { Ghost } from '@/ui/ghost'

import { SidebarToggleView } from './sidebar-toggle'

function ToggleExample({ shown: initial }: { shown: boolean }) {
  const [shown, setShown] = useState(initial)
  return (
    <div className="grid gap-4">
      <SidebarToggleView shown={shown} onToggle={() => setShown(!shown)} />
      <div
        id="game-library-list"
        hidden={!shown}
        className="w-[17rem] rounded-panel border border-line bg-surface p-4"
      >
        <div aria-hidden="true" className="grid gap-3">
          <Ghost className="h-10 w-full" />
          <Ghost className="h-10 w-4/5" />
          <Ghost className="h-10 w-3/5" />
        </div>
      </div>
    </div>
  )
}

const meta = {
  title: 'Library/Beside the game/Visibility',
  component: SidebarToggleView,
  args: { shown: true, onToggle: () => {} },
  render: ({ shown }) => <ToggleExample shown={shown} />,
} satisfies Meta<typeof SidebarToggleView>
export default meta
type Story = StoryObj<typeof meta>

export const ListShown: Story = {}
export const ListHidden: Story = { args: { shown: false } }
