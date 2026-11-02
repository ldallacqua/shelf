import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { Scores } from './scores'

import './game-detail.css'

/**
 * What others think of a game (spec 7.11). Narrow, as in the panel, each place
 * is a line; with room, as on the page, a column.
 */

const igdb = { rating: 84, count: 312, url: 'https://www.igdb.com/games/ember-road' }
const steam = { app: '620', count: 392586, percent: 98, score: 9 }
const shelf = { rating: 86, count: 14 }

const meta = {
  title: 'Features/Game/Scores',
  component: Scores,
  args: { level: 'h2' },
  decorators: [
    (Story) => (
      <div className="max-w-3xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Scores>

export default meta
type Story = StoryObj<typeof meta>

export const EveryPlace: Story = { args: { igdb, steam, shelf } }

/** As the panel holds it: one line to a place. */
export const Narrow: Story = {
  args: { igdb, steam, shelf },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
}

/** Nobody on Shelf has rated it: the place stands empty, and says so. */
export const NoneOnShelfYet: Story = { args: { igdb, steam } }

/** One person's rating is still a rating, and its meter dims to say how little it rests on. */
export const OneRating: Story = { args: { igdb, steam, shelf: { rating: 90, count: 1 } } }

/** A console game, with no page on Steam. */
export const NotOnSteam: Story = { args: { igdb, shelf } }

/** Reviews on Steam that split people: the words are Steam's, and no color judges them. */
export const Mixed: Story = {
  args: { igdb: { ...igdb, rating: 61 }, steam: { ...steam, percent: 46, score: 5, count: 49744 } },
}

/** Under ten reviews Steam gives no words of its own. */
export const AFewOnSteam: Story = {
  args: { igdb, steam: { app: '620', count: 3, percent: 100, score: 0 }, shelf },
}

/** While the page's facts are on their way: what the library file knows, and ghosts. */
export const Waiting: Story = { args: { igdb, waiting: true } }
