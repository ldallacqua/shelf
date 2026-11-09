import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { AppUpdateView } from './app-update'

/**
 * A newer Shelf for Windows, downloaded while the app ran: a button in the header, in the app alone,
 * whose panel names the version and restarts the app into it when asked. Press it to see the panel.
 */

const meta = {
  title: 'Features/Desktop/AppUpdate',
  component: AppUpdateView,
  decorators: [
    (Story) => (
      <div className="flex justify-end p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    ready: { version: '0.16.0' },
    downloading: false,
    installing: 'no',
    onInstall: () => undefined,
  },
} satisfies Meta<typeof AppUpdateView>

export default meta
type Story = StoryObj<typeof meta>

export const Ready: Story = {}
export const WithDownloadsUnderWay: Story = { args: { downloading: true } }
export const Restarting: Story = { args: { installing: 'yes' } }
export const SavesBeingBackedUp: Story = { args: { installing: 'busy' } }
export const CouldNot: Story = { args: { installing: 'failed' } }
