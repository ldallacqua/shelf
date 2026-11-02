import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { DownloadSourcesView } from './download-sources'
import { DownloadSourcesGhost } from './download-sources-ghost'
import type { Source } from './sources'

/**
 * Download sources on the account page, in Shelf for Windows alone (ADR 007, spec 7.10). The cards
 * follow Platforms', on the same page. The warning stands beside the field because that is where the
 * choice is made, and says what a source can do and what to do about it.
 */

const HOUR = 3_600_000
const source = (over: Partial<Source> = {}): Source => ({
  id: 'one',
  name: 'Made-up source',
  url: 'https://files.example.invalid/source.json',
  file: null,
  addedAt: Date.now() - 48 * HOUR,
  readAt: Date.now() - 3 * HOUR,
  items: 1240,
  magnets: 1180,
  web: 310,
  leftOut: 0,
  ...over,
})

const meta = {
  title: 'Features/Desktop/DownloadSources',
  component: DownloadSourcesView,
  decorators: [
    (Story) => (
      <div className="max-w-5xl p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    list: [],
    address: '',
    onAddress: () => undefined,
    onAdd: () => undefined,
    onAddFile: () => undefined,
    onReadAgain: () => undefined,
    onRemove: () => undefined,
  },
} satisfies Meta<typeof DownloadSourcesView>

export default meta
type Story = StoryObj<typeof meta>

export const NoneYet: Story = {}

/** Saved by hand, for an address that doesn't answer the app: reading it again means choosing it again. */
export const FromASavedFile: Story = {
  args: { list: [source({ url: 'file:made-up.json', file: 'made-up.json' })] },
}

/** It answered, and not with the file: the way on is in the words, and the button is beside the field. */
export const AnAddressThatRefuses: Story = {
  args: {
    address: 'https://files.example.invalid/source.json',
    invalid: true,
    said: {
      tone: 'trouble',
      text: 'That address answered without the file. It may only answer browsers: open it in yours, save the file, and use From a saved file.',
    },
  },
}

export const WithSources: Story = {
  args: {
    list: [
      source(),
      source({
        id: 'two',
        name: 'A source with a very long name that someone wrote by hand, and did not shorten at all',
        url: 'https://files.example.invalid/a/very/long/path/that/goes/on/for/a/while/and/then/some/more/source.json',
        items: 2,
        magnets: 0,
        web: 2,
        leftOut: 14,
      }),
    ],
  },
}

/** A file that has a name and a list, and nothing in it Shelf can use. */
export const NothingUsable: Story = {
  args: { list: [source({ items: 0, magnets: 0, web: 0, leftOut: 37 })] },
}

export const Adding: Story = {
  args: { address: 'https://files.example.invalid/source.json', adding: true },
}

export const Added: Story = {
  args: {
    list: [source()],
    said: {
      tone: 'done',
      text: 'Added Made-up source, with 1,240 downloads. Nothing was downloaded.',
    },
  },
}

/** The address stays in the field, to be corrected, and the field says it is the one that's wrong. */
export const Refused: Story = {
  args: {
    address: 'https://files.example.invalid/page.html',
    invalid: true,
    said: {
      tone: 'trouble',
      text: 'That address has no source: a source is a JSON file with a name and a list of downloads.',
    },
  },
}

export const ReadingAgain: Story = { args: { list: [source()], reading: 'one' } }

export const AskingTheApp: Story = { args: { list: undefined } }

export const ItsCodeOnTheWay: Story = {
  render: () => <DownloadSourcesGhost />,
}
