import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { PlaceTroubleView } from './place-trouble'

/**
 * Where this computer's saves go, when it needs the person (ADR 008, section 8): a button in the header,
 * in the app alone, as sync apps mark their icon until it is fixed, whose panel says what it means and
 * leads to Settings. Press it to see the panel. Made-up folder.
 */

const meta = {
  title: 'Features/Desktop/PlaceTrouble',
  component: PlaceTroubleView,
  decorators: [
    (Story) => (
      <div className="flex justify-end p-6">
        <Story />
      </div>
    ),
  ],
  args: { trouble: { kind: 'signed-out', name: 'Google Drive' } },
} satisfies Meta<typeof PlaceTroubleView>

export default meta
type Story = StoryObj<typeof meta>

export const SignedOut: Story = {}
export const Full: Story = { args: { trouble: { kind: 'full', name: 'OneDrive' } } }
export const FolderAway: Story = { args: { trouble: { kind: 'away', name: 'E:\\Shelf saves' } } }
