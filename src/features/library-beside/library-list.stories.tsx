import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { testGame, testLibrary } from '@/domain/library/testing'

import { LibraryListView } from './library-list'

import './beside.css'

const library = testLibrary([
  testGame('Ember Road', { status: 'playing' }),
  testGame('Tide Runner'),
  testGame('Moss Kingdom and the Long Journey Beyond the Last Mountain'),
  testGame('Brass Sun', { status: 'completed' }),
])
const shelf = {
  handle: 'sample',
  name: 'Sample',
  public: true,
  files: { kind: 'public' as const, key: 'story' },
}
const meta = {
  title: 'Library/Beside the game',
  component: LibraryListView,
  parameters: { nextjs: { appDirectory: true } },
  decorators: [
    (Story) => (
      <div className="flex h-[36rem] w-[19rem] flex-col overflow-hidden rounded-panel border border-line bg-surface">
        <Story />
      </div>
    ),
  ],
  args: {
    handle: 'sample',
    slug: 'ember-road',
    shelf,
    version: 1,
    shown: true,
    state: { status: 'ready', library },
    handed: {
      id: 1,
      handle: 'sample',
      shelf,
      version: 1,
      arrangement: { group: 'status', sort: { key: 'title', descending: false }, seed: '1', q: '' },
    },
  },
} satisfies Meta<typeof LibraryListView>
export default meta
type Story = StoryObj<typeof meta>

export const Grouped: Story = {}
export const FilterFromLibrary: Story = {
  args: {
    handed: {
      ...meta.args.handed,
      arrangement: { ...meta.args.handed.arrangement, q: 'status:playing' },
    },
  },
}
export const Empty: Story = { args: { state: { status: 'ready', library: testLibrary([]) } } }
export const Reading: Story = { args: { state: { status: 'loading' } } }
export const Failed: Story = { args: { state: { status: 'failed', retry: () => {} } } }
export const LongLibrary: Story = {
  args: {
    state: {
      status: 'ready',
      library: testLibrary(
        Array.from({ length: 1280 }, (_, i) => testGame(`Game ${String(i).padStart(4, '0')}`)),
      ),
    },
  },
}
