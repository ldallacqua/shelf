import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { useState } from 'react'

import type { Sort } from '@/domain/library/sort'
import { testGame, testLibrary } from '@/domain/library/testing'
import type { Status } from '@/domain/library/values'
import { buildIndex } from '@/domain/query/evaluate'
import type { ListCondition } from '@/domain/query/panel'
import { parseQuery } from '@/domain/query/parse'

import { FilterChips } from './filter-chips'
import { ListSection } from './list-section'
import { NoResults } from './no-results'
import { SearchField } from './search-field'
import { SortControl } from './sort-control'
import { StatusRow } from './status-row'

/**
 * The controls that find games (spec 3.1, 5 and 6), each on its own, with a
 * filter that has something in it that could not be understood.
 */

const meta = {
  title: 'Features/Filters',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="mx-auto grid max-w-3xl gap-6 px-6 py-12">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const index = buildIndex(
  testLibrary([testGame('Ember Road', { genres: [12], themes: [19] })], {
    genre: [{ id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' }],
    theme: [{ id: 19, name: 'Horror', slug: 'horror' }],
  }),
)

const counts = { playing: 6, backlog: 92, completed: 79, dropped: 20, wishlist: 33 }

function Field() {
  const [text, setText] = useState('genre:rpg -theme:horror halo:3')
  const parsed = parseQuery(text)
  return (
    <>
      <SearchField value={text} onChange={(next) => setText(next)} className="sm:max-w-xl" />
      <FilterChips
        tree={parsed.tree}
        problems={parsed.problems}
        index={index}
        onRemove={() => undefined}
        onRemoveProblem={() => undefined}
        onClear={() => setText('')}
      />
    </>
  )
}

/** The search field, with what it could not understand underlined and struck through below. */
export const Search: Story = { render: () => <Field /> }

function Status() {
  const [value, setValue] = useState<Status | 'all'>('all')
  return <StatusRow value={value} counts={counts} onChange={setValue} />
}

export const StatusRowStory: Story = { name: 'Status row', render: () => <Status /> }

function Sorting() {
  const [sort, setSort] = useState<Sort>({ key: 'rating', descending: true })
  const [open, setOpen] = useState(false)
  return (
    <SortControl
      sort={sort}
      onSort={setSort}
      onShuffle={() => setSort({ key: 'random', descending: false })}
      open={open}
      onOpenChange={setOpen}
    />
  )
}

export const SortStory: Story = { name: 'Sort', render: () => <Sorting /> }

const genres = [
  { word: 'rpg', name: 'Role-playing (RPG)', count: 86 },
  { word: 'adventure', name: 'Adventure', count: 174 },
  { word: 'puzzle', name: 'Puzzle', count: 39 },
  { word: 'pinball', name: 'Pinball', count: 0 },
]

function Values() {
  const [condition, setCondition] = useState<ListCondition>({
    include: ['rpg'],
    all: false,
    exclude: ['puzzle'],
  })
  return (
    <div className="max-w-sm rounded-panel border border-line bg-surface p-4">
      <ListSection
        filterKey="genre"
        label="Genre"
        condition={condition}
        values={genres}
        labelOf={(word) => genres.find((value) => value.word === word)?.name ?? word}
        isEnglish={() => true}
        onChange={setCondition}
      />
    </div>
  )
}

/** One filter in the panel: off, included, excluded, and a value that would match nothing. */
export const PanelValues: Story = { name: 'Panel values', render: () => <Values /> }

export const NoGames: Story = {
  name: 'No results',
  render: () => <NoResults onClear={() => undefined} />,
}
