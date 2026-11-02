import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { DownloadsLinkView } from './downloads-link'
import type { Download } from './sources'

/**
 * The way to the downloads, in the header beside the theme, in Shelf for Windows alone. A ring around it
 * fills as a browser's does, so how far along is there on any page without opening anything.
 */

const download = (over: Partial<Download> = {}): Download => ({
  id: 'one',
  entry: null,
  title: 'Made-up Game',
  sourceName: 'Made-up source',
  file: 'made-up.zip',
  folder: 'D:\\Games',
  state: 'downloading',
  why: null,
  done: 62,
  total: 100,
  speed: 10,
  through: 'direct',
  remote: null,
  archives: 0,
  extraction: null,
  ...over,
})

const meta = {
  title: 'Features/Desktop/DownloadsLink',
  component: DownloadsLinkView,
  decorators: [
    (Story) => (
      <div className="flex p-6">
        <Story />
      </div>
    ),
  ],
  args: { list: [] },
} satisfies Meta<typeof DownloadsLinkView>

export default meta
type Story = StoryObj<typeof meta>

export const Resting: Story = {}
export const HowFarAlong: Story = { args: { list: [download()] } }
export const CantSayHowFar: Story = { args: { list: [download({ total: null })] } }
export const OneHasStopped: Story = {
  args: { list: [download({ state: 'failed', why: 'disk' })] },
}
export const OnThisPage: Story = { args: { current: true, list: [download()] } }
