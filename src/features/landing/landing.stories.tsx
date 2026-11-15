import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { factsOf } from '@/domain/duel/facts'
import { testGame, testLibrary } from '@/domain/library/testing'

import { DownloadFacts, DownloadForWindows } from '@/features/desktop/download-windows'

import type { DemoGame } from './demo-case'
import { DesktopDemo, DesktopPoints } from './desktop-demo'
import { DEMO_FACTS, DuelDemo } from './duel-demo'
import { LookDemo } from './look-demo'
import { Overview } from './overview'
import { StartSteps } from './start-steps'

import './landing.css'

/**
 * The landing page's newer parts (spec 15): the overview under the first screen, the colors, Shelf
 * for Windows, the duel and the steps to a shelf of one's own. The page builds them from the example shelf
 * on the server; here a few of its games stand in, as the page itself draws them.
 */
const meta = {
  title: 'Features/Landing page',
  decorators: [
    (Story) => (
      <div id="landing" className="max-w-5xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta

export default meta
type Story = StoryObj

const game = (
  slug: string,
  title: string,
  cover: string,
  colors: [string, string, string],
  hours: number,
): DemoGame => ({
  slug,
  title,
  cover,
  colors,
  led: colors[0],
  shape: 'keepCase',
  plastic: 'black',
  platform: 'PC',
  format: 'digital',
  status: 'playing',
  hours,
})

const HADES = game('hades--1', 'Hades', 'cob9kr', ['#b25235', '#d7c5be', '#0d0403'], 67)
const PC = [
  game('hollow-knight', 'Hollow Knight', 'cobfzp', ['#1e5fb1', '#c0b8ce', '#040b42'], 43),
  game('celeste', 'Celeste', 'cob9dh', ['#8f4e4c', '#b0b0b3', '#342127'], 6),
  game('elden-ring', 'Elden Ring', 'co4jni', ['#d1a96a', '#715d41', '#060b07'], 101),
  game('half-life-2', 'Half-Life 2', 'co1nmw', ['#432c1e', '#d1d0c4', '#0c150f'], 21),
]

/** Every part at a glance, each tile a link to its part. */
export const AtAGlance: Story = { render: () => <Overview /> }

/** The example shelf in a colorway, lights off and on; the chips change it with no script. */
export const Colors: Story = { render: () => <LookDemo games={[PC[0]!, PC[1]!, HADES]} /> }

/** Shelf for Windows' window, as a picture. */
export const DesktopWindow: Story = { render: () => <DesktopDemo game={HADES} shelf={PC} /> }

/** What the app does, and the way to download it. */
export const DesktopDownload: Story = { render: () => <DesktopPoints /> }

/** The download button alone, as the first screen and the close have it. */
export const DownloadButton: Story = {
  render: () => (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <DownloadForWindows />
        <DownloadForWindows variant="primary" />
      </div>
      <DownloadFacts />
    </div>
  ),
}

/** From signing up to a shelf of one's own. */
export const GettingStarted: Story = { render: () => <StartSteps /> }

/** Two of the example shelf's backlog face to face, as "Choose your next game" draws them. */
const OUTER_WILDS = game(
  'outer-wilds',
  'Outer Wilds',
  'co65ac',
  ['#a3885a', '#4d4235', '#030203'],
  0,
)
const HADES_II = game('hades-ii', 'Hades II', 'coaknx', ['#21614e', '#9fc1b2', '#081d19'], 0)
const duelFacts = factsOf(
  [
    testGame('Outer Wilds', {
      length: 1140,
      hastyShare: 63,
      igdbRating: 87,
      year: 2019,
      genres: [1, 2],
    }),
    testGame('Hades II', { length: 2580, igdbRating: 91, year: 2025, genres: [3, 4] }),
  ],
  testLibrary([], {
    genre: [
      { id: 1, name: 'Puzzle', slug: 'puzzle' },
      { id: 2, name: 'Adventure', slug: 'adventure' },
      { id: 3, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' },
      { id: 4, name: 'Hack and slash/Beat ’em up', slug: 'hack-and-slash-beat-em-up' },
    ],
  }).names,
  '2026-01-01',
).filter(({ key }) => (DEMO_FACTS as readonly string[]).includes(key))

/**
 * "Choose your next game": one duel, with no script. Choosing one lights it, dims the other and
 * says which goes on; under it, the rounds a bracket of eight narrows through.
 */
export const Duel: Story = {
  render: () => <DuelDemo games={[OUTER_WILDS, HADES_II]} facts={duelFacts} />,
  play: async ({ canvasElement }) => {
    const scene = within(canvasElement)
    await userEvent.click(scene.getByRole('radio', { name: 'Choose Outer Wilds' }))
    await expect(scene.getByRole('radio', { name: 'Choose Outer Wilds' })).toBeChecked()
    await expect(scene.getByText('Outer Wilds goes on to the semifinals.')).toBeVisible()
  },
}
