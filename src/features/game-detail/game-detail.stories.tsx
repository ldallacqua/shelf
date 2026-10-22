import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import type { GameFacts } from '@/domain/library/game-page'
import type { LibraryPlatform } from '@/domain/library/library'
import { testGame } from '@/domain/library/testing'

import { GameDetail } from './game-detail'
import { MineSkeleton } from './mine-skeleton'

/**
 * A game's page, on its own and in the panel over the shelf. The game is
 * made up, with a wash of its colors where the cover and key art would be:
 * no cover art is stored or drawn, and with no screenshots the strip is left
 * out.
 */

const ps5: LibraryPlatform = {
  id: 167,
  key: 'ps5',
  name: 'PlayStation 5',
  short: 'PS5',
  family: 'playstation',
  generation: 9,
  shape: 'bluRay',
  plastic: 'blue',
}
const platforms = new Map([[ps5.id, ps5]])

const game = testGame('Ember Road', {
  status: 'completed',
  rating: 90,
  minutes: 2460,
  completedOn: '2025-08-14',
  year: 2023,
  releasedOn: '2023-05-02',
  igdbRating: 84,
  igdbRatingCount: 312,
  colors: ['#ff7a3d', '#7a1f4d', '#2b1020'],
  hasNotes: true,
  copies: [{ platform: 167, format: 'physical' }],
  platforms: [167],
  genres: [1],
  themes: [2],
  developers: [3],
  publishers: [4],
})

const facts: GameFacts = {
  slug: game.slug,
  summary:
    'A road trip across a burning coast, made of short drives and long conversations. Each stop changes who will still be in the car at the end.',
  storyline: 'The fires reached the coast road in spring.',
  screenshots: [],
  releases: [{ platform: 167, day: '2023-05-02', year: 2023 }],
  length: { hastily: 600, normally: 900, completely: 1500 },
  notes: 'Finished it in two long evenings.',
  names: {
    genre: [{ id: 1, name: 'Adventure', slug: 'adventure' }],
    theme: [{ id: 2, name: 'Drama', slug: 'drama' }],
    mode: [],
    perspective: [],
    franchise: [],
    series: [],
    company: [
      { id: 3, name: 'Small Lantern', slug: 'small-lantern' },
      { id: 4, name: 'Long Road Press', slug: 'long-road-press' },
    ],
    platform: [ps5],
  },
}

const tags = [{ name: 'replay someday', slug: 'replay-someday' }]

const meta = {
  title: 'Features/Game',
  component: GameDetail,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof GameDetail>

export default meta
type Story = StoryObj<typeof meta>

/** A game's own page, opened directly. */
export const Page: Story = {
  args: { handle: 'sample', layout: 'page', game, tags, platforms, facts },
}

/**
 * In the panel over the shelf, while its facts are on their way: what the
 * library file knows at once, and ghosts for the rest.
 */
export const Arriving: Story = {
  args: { handle: 'sample', layout: 'panel', game, tags, platforms },
}

/**
 * "Mine" for the owner while the editor is on its way: each label where it
 * will be and a ghost the size of each control, so nothing below moves when
 * the editor arrives.
 */
export const OwnerArriving: Story = {
  args: { handle: 'sample', layout: 'panel', game, tags, platforms },
  render: (args) => (
    <div className="max-w-[32rem] px-5 py-6">
      <MineSkeleton game={args.game} tags={args.tags} platforms={args.platforms} level="h3" />
    </div>
  ),
}
