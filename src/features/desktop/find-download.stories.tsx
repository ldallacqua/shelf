import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { FindDownloadView } from './find-download'
import type { Found } from './sources'

/**
 * Finding a download, from a game's page (ADR 007, spec 7.10). Like Hydra's list, with a field to
 * search and a line of details, closest first rather than newest, since every word has to match
 * and the shortest title is the likeliest. Nothing is chosen or started by itself.
 */

const found = (over: Partial<Found> = {}): Found => ({
  source: 'one',
  sourceName: 'Made-up source',
  place: 0,
  title: 'Made-up Game: Deluxe Edition v1.2',
  fileSize: '12.4 GB',
  uploadDate: '2026-10-20T12:00:00.000Z',
  web: 1,
  magnets: 1,
  inParts: false,
  ...over,
})

const meta = {
  title: 'Features/Desktop/FindDownload',
  component: FindDownloadView,
  decorators: [
    (Story) => (
      <div className="max-w-md p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    words: 'Made-up Game',
    results: [
      found(),
      found({ place: 1, title: 'Made-up Game', fileSize: null, uploadDate: null }),
      found({ place: 2, title: 'Made-up Game: magnet only', web: 0 }),
      found({ place: 3, title: 'Made-up Game, in many parts', web: 0, magnets: 0, inParts: true }),
    ],
    added: new Set<string>(),
    onWords: () => undefined,
    onSearch: () => undefined,
    onDownload: () => undefined,
  },
} satisfies Meta<typeof FindDownloadView>

export default meta
type Story = StoryObj<typeof meta>

export const Results: Story = {}

export const Looking: Story = { args: { results: undefined } }

export const NothingFound: Story = { args: { results: [] } }

export const ChoosingAFolder: Story = { args: { busy: 'one:0' } }

export const PutInLine: Story = { args: { added: new Set(['one:0']) } }

export const AlreadyThere: Story = {
  args: { said: 'That one is already in your downloads.' },
}
