import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { RealDebridView } from './real-debrid'

/**
 * Real-Debrid in Settings, in Shelf for Windows alone (ADR 007, phase 3). The code is large
 * because it has to be read and typed on another page, and the way there is the primary button.
 */

const meta = {
  title: 'Features/Desktop/RealDebrid',
  component: RealDebridView,
  decorators: [
    (Story) => (
      <div className="max-w-5xl p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    account: { state: 'out' },
    onSignIn: () => undefined,
    onCancel: () => undefined,
    onSignOut: () => undefined,
  },
} satisfies Meta<typeof RealDebridView>

export default meta
type Story = StoryObj<typeof meta>

export const SignedOut: Story = {}

export const WaitingForTheCode: Story = {
  args: {
    account: { state: 'waiting', code: 'MADEUP12', url: 'https://real-debrid.com/device' },
  },
}

export const Premium: Story = {
  args: {
    account: { state: 'in', username: 'made-up', premium: true, until: '2027-01-01T00:00:00.000Z' },
  },
}

/** Host links may still work, and magnets won't: each download says so when it stops. */
export const NotPremium: Story = {
  args: { account: { state: 'in', username: 'made-up', premium: false, until: null } },
}

export const CodeRanOut: Story = {
  args: { said: 'That code ran out before it was entered. Ask for a new one.' },
}

export const AskingTheApp: Story = { args: { account: undefined } }
