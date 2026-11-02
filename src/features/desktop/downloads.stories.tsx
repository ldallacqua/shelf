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
  entry: 'made-up-entry',
  title: 'Made-up Game: Deluxe Edition v1.2',
  sourceName: 'Made-up source',
  file: 'made-up-game.zip',
  folder: 'D:\\Games',
  state: 'downloading',
  why: null,
  done: 3.2 * GB,
  total: 12.4 * GB,
  speed: 18 * 1024 * 1024,
  through: 'direct',
  remote: null,
  archives: 0,
  extraction: null,
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
    onExtract: () => undefined,
    onStopExtracting: () => undefined,
    onChoose: () => undefined,
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

/** On Real-Debrid's servers: nothing arrives here yet, and it can take a while. */
export const RealDebridIsGettingIt: Story = {
  args: {
    list: [
      download({
        state: 'remote',
        remote: 40,
        through: 'realdebrid',
        file: null,
        done: 0,
        total: null,
        speed: 0,
      }),
    ],
  },
}

const stoppedBy = (why: Download['why']) => ({
  args: { list: [download({ state: 'failed', why, through: 'realdebrid', done: 0, speed: 0 })] },
})

export const RealDebridSignedOut: Story = stoppedBy('signedout')
export const RealDebridNotPremium: Story = stoppedBy('premium')
export const RealDebridBlocked: Story = stoppedBy('blocked')
export const RealDebridDead: Story = stoppedBy('dead')
export const RealDebridVirus: Story = stoppedBy('virus')
export const RealDebridHost: Story = stoppedBy('host')
export const RealDebridBusy: Story = stoppedBy('busy')
export const RealDebridDeclined: Story = stoppedBy('declined')

export const Paused: Story = { args: { list: [download({ state: 'paused', speed: 0 })] } }

export const Finished: Story = {
  args: { list: [download({ state: 'done', done: 12.4 * GB, speed: 0 })] },
}

const archive = (extraction: Download['extraction']) => ({
  args: {
    list: [download({ state: 'done', done: 12.4 * GB, speed: 0, archives: 1, extraction })],
  },
})

/** What to do next is the button that comes first. It takes the time and the disk, so it is asked for. */
export const AnArchiveToExtract: Story = archive(null)

export const ReadingTheArchive: Story = archive({
  state: 'working',
  why: null,
  done: 0,
  total: 0,
})

export const Extracting: Story = archive({
  state: 'working',
  why: null,
  done: 9 * GB,
  total: 31 * GB,
})

/** From here the way on is Windows' picker, which opens where it came out. */
export const Extracted: Story = archive({
  state: 'done',
  why: null,
  done: 31 * GB,
  total: 31 * GB,
})

export const ExtractedAndChosen: Story = {
  args: {
    ...archive({ state: 'done', why: null, done: 31 * GB, total: 31 * GB }).args,
    chosen: { one: 'game.exe' },
  },
}

const stuck = (why: NonNullable<Download['extraction']>['why']) =>
  archive({ state: 'failed', why, done: 0, total: 31 * GB })

/** Another go can't change these two, so none is offered. */
export const NeedsAPassword: Story = stuck('password')
export const WouldLeaveItsFolder: Story = stuck('unsafe')
export const ArchiveDamaged: Story = stuck('damaged')
export const ArchiveMissingAPart: Story = stuck('volume')
export const NoRoomToExtract: Story = stuck('disk')
export const ExtractingCutShort: Story = stuck('interrupted')

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
