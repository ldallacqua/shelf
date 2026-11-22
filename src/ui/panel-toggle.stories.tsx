import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import { Ghost } from './ghost'
import { PanelToggle } from './panel-toggle'

/** The button and the column it shows and hides, as the list beside a game and the library's filters use them. */
function ToggleExample({ shown: initial, count }: { shown: boolean; count?: number }) {
  const [shown, setShown] = useState(initial)
  return (
    <div className="grid justify-items-start gap-4">
      <PanelToggle shown={shown} onToggle={() => setShown(!shown)} controls="panel-toggle-column">
        {shown ? 'Hide filters' : null}
        {!shown && !count ? 'Show filters' : null}
        {!shown && count ? (
          <>
            <span aria-hidden="true">Show filters</span>
            <span
              aria-hidden="true"
              className="-mr-1 rounded-full bg-accent px-1.5 readout text-[0.625rem] text-on-accent"
            >
              {count}
            </span>
            <span className="sr-only">{`Show filters, ${count} active`}</span>
          </>
        ) : null}
      </PanelToggle>
      <div
        id="panel-toggle-column"
        hidden={!shown}
        className="w-[19rem] rounded-panel border border-line bg-surface p-4"
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
  title: 'UI/Panel toggle',
  component: PanelToggle,
} satisfies Meta<typeof PanelToggle>
export default meta
type Story = StoryObj

export const Shown: Story = { render: () => <ToggleExample shown /> }
export const Hidden: Story = { render: () => <ToggleExample shown={false} /> }
/** Hidden with filters on: the count the narrower Filters button shows. */
export const HiddenWithFilters: Story = { render: () => <ToggleExample shown={false} count={2} /> }
