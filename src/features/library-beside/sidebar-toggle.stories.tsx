import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Ghost } from '@/ui/ghost'
import { PanelToggle } from '@/ui/panel-toggle'

/** The game page's Hide list, on the toggle it shares with the library's Hide filters. */
function ToggleExample({ shown: initial }: { shown: boolean }) {
  const t = useTranslations('Beside')
  const [shown, setShown] = useState(initial)
  return (
    <div className="grid justify-items-start gap-4">
      <PanelToggle shown={shown} onToggle={() => setShown(!shown)} controls="game-library-list">
        {t(shown ? 'hide' : 'show')}
      </PanelToggle>
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
  component: PanelToggle,
} satisfies Meta<typeof PanelToggle>
export default meta
type Story = StoryObj

export const ListShown: Story = { render: () => <ToggleExample shown /> }
export const ListHidden: Story = { render: () => <ToggleExample shown={false} /> }
