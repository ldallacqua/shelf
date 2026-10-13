import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { blankCases } from './blank-cases'
import { DemoShelf } from './demo-shelf'
import { Foundations } from './foundations'
import { MotionDemo } from './motion-demo'

const meta = {
  title: 'Foundations',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj

/** The whole foundations page: light, color, type, motion and controls. */
export const Page: Story = { render: () => <Foundations /> }

/** Point at a case and the shelf's light takes its color. */
export const LitShelf: Story = {
  render: () => (
    <div className="px-4 pt-16 pb-20">
      <DemoShelf
        cases={blankCases}
        narrowCount={4}
        label="Blank cases"
        description="A backlit shelf of blank game cases, facing out"
      />
    </div>
  ),
}

export const Motion: Story = {
  render: () => (
    <div className="mx-auto max-w-2xl p-6">
      <MotionDemo />
    </div>
  ),
}
