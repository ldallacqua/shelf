import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { SaveCapsView } from './save-settings'

/**
 * The limits on every game's snapshots, in Settings (ADR 008, section 4): two numbers, as Steam's and
 * Ludusavi's settings are, each with what it means under it.
 */
const meta = {
  title: 'Features/Desktop/SaveSettings',
  component: SaveCapsView,
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
  args: { caps: { mostMb: 500, kept: 20 }, onChange: () => undefined },
} satisfies Meta<typeof SaveCapsView>

export default meta
type Story = StoryObj<typeof meta>

export const Limits: Story = {}

export const Saved: Story = { args: { said: { tone: 'done', text: 'Saved.' } } }

export const Failed: Story = {
  args: { said: { tone: 'trouble', text: 'The limit couldn’t be saved. Try again.' } },
}

export const AskingTheApp: Story = { args: { caps: undefined } }

/** An app older than saves. */
export const Old: Story = { args: { caps: 'old' } }
