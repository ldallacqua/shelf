import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import { PlayTimeView } from './play-time'

/**
 * A game's play time under "Mine", for its owner (spec 7.3, #153): one total, when it was last
 * played, and where it came from by the platform of the copy, the largest first. A source that saw
 * the same play as another says so in a tag; idle time taken off shows as a row once set; (i) holds
 * how it is counted, and ⋯ holds Remove idle time. PlayStation and Xbox are made up here, ahead of
 * #74 and #73: what they report would land the same way. A visitor sees only the total, in the
 * game's facts.
 */

const meta = {
  title: 'Features/GameDetail/PlayTime',
  component: PlayTimeView,
  decorators: [
    (Story) => (
      <div className="max-w-[32rem] p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    heading: 'h3',
    total: 0,
    platforms: [],
    idle: 0,
    reported: 0,
    stores: [],
    onIdle: () => undefined,
  },
} satisfies Meta<typeof PlayTimeView>

export default meta
type Story = StoryObj<typeof meta>

/** Nothing counted: a quiet line, and the way to link a platform. */
export const Empty: Story = {}

export const ShelfForWindowsOnly: Story = {
  args: {
    total: 47,
    lastPlayed: 'Nov 7, 2026',
    platforms: [{ name: 'PC', minutes: 47, sources: [{ name: 'Shelf for Windows', minutes: 47 }] }],
  },
}

export const SteamOnly: Story = {
  args: {
    total: 1925,
    lastPlayed: 'Oct 30, 2026',
    platforms: [{ name: 'PC', minutes: 1925, sources: [{ name: 'Steam', minutes: 1925 }] }],
    reported: 1925,
    stores: ['Steam'],
  },
}

/** The same play, seen twice: the larger counts, and the other says so. */
export const SteamAndShelfOverlapping: Story = {
  args: {
    total: 8400,
    lastPlayed: 'Nov 1, 2026',
    platforms: [
      {
        name: 'PC',
        minutes: 8400,
        sources: [
          { name: 'Steam', minutes: 8400 },
          { name: 'Shelf for Windows', minutes: 6, sameAs: 'Steam' },
        ],
      },
    ],
    reported: 8400,
    stores: ['Steam'],
  },
}

export const PcAndAConsole: Story = {
  args: {
    total: 8765,
    lastPlayed: 'Nov 1, 2026',
    platforms: [
      {
        name: 'PC',
        minutes: 8400,
        sources: [
          { name: 'Steam', minutes: 8400 },
          { name: 'Shelf for Windows', minutes: 6, sameAs: 'Steam' },
        ],
      },
      { name: 'Nintendo Switch', minutes: 365, sources: [{ name: 'Nintendo', minutes: 365 }] },
    ],
    reported: 8765,
    stores: ['Steam', 'Nintendo'],
  },
}

/** Xbox on a PC copy is PC play, overlapping the app; PlayStation adds. Both made up. */
export const ThreePlatforms: Story = {
  args: {
    total: 3540,
    lastPlayed: 'Nov 5, 2026',
    platforms: [
      {
        name: 'PC',
        minutes: 2100,
        sources: [
          { name: 'Xbox', minutes: 2100 },
          { name: 'Shelf for Windows', minutes: 1290, sameAs: 'Xbox' },
        ],
      },
      { name: 'PlayStation 5', minutes: 1080, sources: [{ name: 'PlayStation', minutes: 1080 }] },
      { name: 'Nintendo Switch', minutes: 360, sources: [{ name: 'Nintendo', minutes: 360 }] },
    ],
    reported: 3540,
    stores: ['Xbox', 'PlayStation', 'Nintendo'],
  },
}

/** Two hours of Steam's taken off as idle: the PC adds what is left. */
export const IdleTimeSet: Story = {
  args: {
    total: 8645,
    lastPlayed: 'Nov 1, 2026',
    platforms: [
      {
        name: 'PC',
        minutes: 8280,
        sources: [
          { name: 'Steam', minutes: 8400 },
          { name: 'Shelf for Windows', minutes: 6, sameAs: 'Steam' },
        ],
      },
      { name: 'Nintendo Switch', minutes: 365, sources: [{ name: 'Nintendo', minutes: 365 }] },
    ],
    idle: 120,
    reported: 8765,
    stores: ['Steam', 'Nintendo'],
  },
}

/** Steam's last sync failed: its hours may be behind. */
export const SourceBehind: Story = {
  args: {
    ...SteamAndShelfOverlapping.args,
    platforms: [
      {
        name: 'PC',
        minutes: 8400,
        sources: [
          { name: 'Steam', minutes: 8400, behind: true },
          { name: 'Shelf for Windows', minutes: 6, sameAs: 'Steam' },
        ],
      },
    ],
  },
}

/** A few seconds counted: something, never "0 h". */
export const LessThanAMinute: Story = {
  args: {
    total: 0.5,
    lastPlayed: 'Nov 7, 2026',
    platforms: [
      { name: 'PC', minutes: 0.5, sources: [{ name: 'Shelf for Windows', minutes: 0.5 }] },
    ],
  },
}
