import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import type { ShelfItem } from '@/domain/library/group'
import type { LibraryGame, LibraryPlatform } from '@/domain/library/library'
import type { Status } from '@/domain/library/values'

import { GamePreview } from './game-preview'
import { LibrarySkeleton } from './library-skeleton'
import { ShelfGrid } from './shelf-grid'
import { StatsLine } from './stats-line'
import { Toolbar } from './toolbar'

/**
 * The parts of the library, on their own. The games here are made up, with a
 * wash of color where a cover would be: no cover art is stored or drawn.
 */

const platform = (
  id: number,
  short: string,
  name: string,
  shape: LibraryPlatform['shape'],
  plastic: LibraryPlatform['plastic'],
): LibraryPlatform => ({
  id,
  key: short.toLowerCase(),
  name,
  short,
  family: 'other',
  shape,
  plastic,
})

const platformList = [
  platform(167, 'PS5', 'PlayStation 5', 'bluRay', 'blue'),
  platform(130, 'Switch', 'Nintendo Switch', 'switch', 'red'),
  platform(169, 'Series X|S', 'Xbox Series X|S', 'bluRay', 'green'),
  platform(8, 'PS2', 'PlayStation 2', 'keepCase', 'black'),
  platform(7, 'PS1', 'PlayStation', 'jewel', 'clear'),
]
const platforms = new Map(platformList.map((entry) => [entry.id, entry]))

const palettes = [
  ['#ff7a3d', '#7a1f4d', '#2b1020'],
  ['#22c8ee', '#123b8f', '#0c1a3a'],
  ['#7ddc3c', '#0c3b2a', '#10241a'],
  ['#f0409b', '#3a1c8f', '#1a1033'],
  ['#ffc23d', '#5b2a0c', '#2a1606'],
] as const

const game = (index: number, status: Status, extra: Partial<LibraryGame> = {}): LibraryGame => ({
  slug: `game-${index}`,
  title:
    ['Ember Road', 'Tide Runner', 'Moss Kingdom', 'Neon Bloom', 'Brass Sun'][index % 5] ?? 'Game',
  status,
  year: 2018 + index,
  addedOn: '2024-03-05',
  minutes: 600 * index,
  igdbRatingCount: 120,
  igdbRating: 80 + index,
  kind: 'main',
  colors: palettes[index % palettes.length],
  featured: false,
  hasNotes: false,
  copies: [{ platform: platformList[index % platformList.length]?.id ?? 167, format: 'physical' }],
  genres: [],
  themes: [],
  modes: [],
  perspectives: [],
  platforms: [167],
  franchises: [],
  series: [],
  developers: [],
  publishers: [],
  tags: [],
  ...extra,
})

const stand = (entry: LibraryGame): ShelfItem => {
  const [copy] = entry.copies
  return copy ? { game: entry, copy } : { game: entry }
}

/** One of every state a box can be in (spec 3.2). */
const states: ShelfItem[] = [
  stand(game(0, 'backlog')),
  stand(game(1, 'playing')),
  stand(game(2, 'completed', { rating: 90 })),
  stand(game(3, 'dropped')),
  stand(game(4, 'wishlist', { copies: [] })),
  stand(game(5, 'backlog', { copies: [{ platform: 167, format: 'digital' }] })),
  stand(
    game(6, 'completed', {
      copies: [
        { platform: 130, format: 'physical' },
        { platform: 167, format: 'digital' },
      ],
    }),
  ),
]

const describe = (item: ShelfItem) => `${item.game.title}, ${item.game.status}`

const meta = {
  title: 'Features/Library',
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="shelves mx-auto max-w-5xl px-6 py-12">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

/** Backlog, playing, completed, dropped, wishlist, a download, and a game owned twice. */
export const BoxStates: Story = {
  render: () => (
    <ShelfGrid
      shelfKey="states"
      items={states}
      total={states.length}
      unmeasured={states.length}
      platforms={platforms}
      density="covers"
      slot={142}
      tall={190}
      label="Every state a box can be in"
      describe={describe}
      position={0}
      onOpen={() => undefined}
      onLeave={() => undefined}
    />
  ),
}

/** The same boxes standing spine-out. */
export const Compact: Story = {
  render: () => (
    <ShelfGrid
      shelfKey="compact"
      items={states}
      total={states.length}
      unmeasured={states.length}
      platforms={platforms}
      density="compact"
      slot={142}
      tall={190}
      label="Every state a box can be in, spine-out"
      describe={describe}
      position={0}
      onOpen={() => undefined}
      onLeave={() => undefined}
    />
  ),
}

/** A shelf whose first boxes have arrived: ghosts stand where the rest will, until the library file brings them. */
export const Arriving: Story = {
  render: () => (
    <ShelfGrid
      shelfKey="arriving"
      items={states.slice(0, 3)}
      total={16}
      unmeasured={3}
      platforms={platforms}
      density="covers"
      slot={142}
      tall={190}
      label="Three boxes arrived, the rest on their way"
      describe={describe}
      position={0}
      onOpen={() => undefined}
      onLeave={() => undefined}
    />
  ),
}

/** The library before its first boxes arrive, as the page built ahead of time shows it. */
export const Loading: Story = {
  render: () => <LibrarySkeleton />,
}

export const Controls: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <StatsLine stats={{ games: 230, finished: 79, hours: 4236 }} />
      <Toolbar
        view="shelf"
        group="platform"
        density="covers"
        wallSize="medium"
        onView={() => undefined}
        onGroup={() => undefined}
        onDensity={() => undefined}
        onWallSize={() => undefined}
        dimension="2d"
        onDimension={() => undefined}
      />
    </div>
  ),
}

/** A game picked up from the shelf. */
export const Preview: Story = {
  render: () => (
    <GamePreview
      item={stand(game(2, 'completed', { rating: 90, completedOn: '2024-06-01', tags: [0] }))}
      platforms={platforms}
      tags={[{ name: 'replay someday', slug: 'replay-someday' }]}
      onClose={() => undefined}
      onReturnFocus={() => false}
      onNext={() => undefined}
    />
  ),
}
