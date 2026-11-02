import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { DownloadsView } from './downloads-list'
import type { Download } from './sources'

/**
 * Downloads, on the account page above the sources, in Shelf for Windows alone (ADR 007, spec 7.10).
 * What is said while moving is what a person decides by: how far, how fast, how long. Nothing is
 * offered that starts a file: a finished one is shown in its folder.
 */

const GB = 1024 ** 3
const download = (over: Partial<Download> = {}): Download => ({
  id: 'one',
  title: 'Made-up Game: Deluxe Edition v1.2',
  sourceName: 'Made-up source',
  file: 'made-up-game.zip',
  folder: 'D:\\Games',
  state: 'downloading',
  why: null,
  done: 3.2 * GB,
  total: 12.4 * GB,
  speed: 18 * 1024 * 1024,
  ...over,
})

const meta = {
  title: 'Features/Desktop/Downloads',
  component: DownloadsView,
  decorators: [
    (Story) => (
      <div className="max-w-5xl p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    list: [download()],
    onPause: () => undefined,
    onResume: () => undefined,
    onRemove: () => undefined,
    onShow: () => undefined,
  },
} satisfies Meta<typeof DownloadsView>

export default meta
type Story = StoryObj<typeof meta>

export const Downloading: Story = {}

export const SizeNotKnown: Story = { args: { list: [download({ total: null })] } }

export const Waiting: Story = {
  args: {
    list: [
      download(),
      download({ id: 'two', title: 'Another Made-up Game', state: 'queued', done: 0, speed: 0 }),
    ],
  },
}

export const Paused: Story = { args: { list: [download({ state: 'paused', speed: 0 })] } }

export const Finished: Story = {
  args: { list: [download({ state: 'done', done: 12.4 * GB, speed: 0 })] },
}

export const LinksThatArePages: Story = {
  args: {
    list: [download({ state: 'failed', why: 'page', file: null, done: 0, total: null, speed: 0 })],
  },
}

export const NoAnswer: Story = {
  args: { list: [download({ state: 'failed', why: 'unreachable', speed: 0 })] },
}

export const NoRoomOnTheDisk: Story = {
  args: { list: [download({ state: 'failed', why: 'disk', done: 0, speed: 0 })] },
}

export const CantWriteThere: Story = {
  args: { list: [download({ state: 'failed', why: 'write', speed: 0 })] },
}

export const CouldNotAsk: Story = { args: { list: [], trouble: 'This computer couldn’t do that.' } }

/** Drawn as nothing at all. */
export const NoneYet: Story = { args: { list: [] } }
