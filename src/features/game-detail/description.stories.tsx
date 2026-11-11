import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import type { Description, DescriptionBlock } from '@/domain/steam/description'

import { GameDescription } from './description'

/**
 * A game's long description from its store page on Steam, as About shows it (ADR 010, decision 11).
 * The game and its words are made up. So are its pictures' files: no game art is drawn here, so
 * each picture is an empty frame of its size, washed so it can be seen.
 */

const FILES = 'steam/apps/400/extras'

const words = (text: string) => ({ kind: 'paragraph' as const, runs: [{ text }] })

const story: Description = [
  { kind: 'heading', text: 'STORY' },
  {
    kind: 'paragraph',
    runs: [
      { text: 'Tidewater', strong: true },
      {
        text: ' is a quiet game about a lighthouse keeper on an island the sea is slowly taking back. Each night the light must be lit; each morning the shore is a little closer.',
      },
    ],
  },
  { kind: 'heading', text: 'ABOUT THIS GAME' },
  words(
    'Mend the lamp, row out to the wrecks for parts, and keep a log of the ships that pass. Some of them answer. The tide sets the length of every day, and the weather decides what the night will cost.',
  ),
  { kind: 'heading', text: 'FEATURES' },
  {
    kind: 'list',
    items: [
      [{ text: 'Forty islands', strong: true }, { text: ', each with its own tides' }],
      [{ text: 'Six seasons of weather' }],
      [{ text: 'A log that remembers every ship' }],
    ],
  },
  { kind: 'picture', id: `${FILES}/islands.avif`, width: 616, height: 300 },
  { kind: 'heading', text: 'ADDITIONAL DETAILS' },
  words('Developed by: Small Lantern\nPublished by: Long Road Press'),
]

const clip: DescriptionBlock = {
  kind: 'picture',
  id: `${FILES}/lamp.poster.avif`,
  width: 600,
  height: 338,
  loop: { mp4: `${FILES}/lamp.mp4`, webm: `${FILES}/lamp.webm` },
}

const meta = {
  title: 'Features/Game/Description',
  component: GameDescription,
  args: {
    blocks: story,
    summary: 'A keeper, a lighthouse, and a sea that is taking the island back.',
    title: 'Tidewater',
    slug: 'tidewater',
    lang: 'en',
  },
  decorators: [
    (Story) => (
      <div className="game-section max-w-[44rem] p-6 [&_.game-picture]:bg-surface-raised">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GameDescription>

export default meta
type Story = StoryObj<typeof meta>

/** Headings, set words, a list, a picture: the rest folded behind Read more. */
export const Folded: Story = {}

/** A short one shows whole. */
export const Short: Story = {
  args: { blocks: story.slice(0, 2) },
}

/**
 * A clip that loops as a GIF would: it plays while near the window, and pressing it pauses it.
 * Under reduced motion it stands still until pressed.
 */
export const Clip: Story = {
  args: { blocks: [clip, ...story.slice(1, 4)] },
}

/** A game the store keeps for adults: its pictures blurred until one is pressed, then all shown. */
export const ForAdults: Story = {
  args: {
    blocks: [
      story[1]!,
      { kind: 'picture', id: `${FILES}/shore.avif`, width: 616, height: 300, mature: true },
      { ...clip, mature: true } as DescriptionBlock,
    ],
  },
}

/** Only pictures, their words drawn in: the summary leads, so a screen reader has words. */
export const PicturesOnly: Story = {
  args: {
    blocks: [
      { kind: 'picture', id: `${FILES}/banner-one.avif`, width: 780, height: 300 },
      { kind: 'picture', id: `${FILES}/banner-two.avif`, width: 780, height: 300 },
    ],
  },
}
