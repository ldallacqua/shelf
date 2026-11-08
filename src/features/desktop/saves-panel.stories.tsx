import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import type { SavesView } from './saves'
import { SavesPanelView } from './saves-panel'

/**
 * A game's saves, opened from Play's menu (ADR 008, spec 7.12). Steam's game properties put one switch
 * for its cloud above everything else, and Ludusavi lists each place with its size: so the switch first,
 * then where the saves are, then the snapshots, newest first, each restorable after a question, as
 * Steam asks before choosing between two copies. Made-up games and paths.
 */

const HOUR = 60 * 60 * 1000
const now = Date.UTC(2026, 10, 7, 19, 30)

const view = (over: Partial<SavesView> = {}): SavesView => ({
  on: true,
  matched: 'Made-up Game',
  others: [],
  registry: false,
  cloud: [],
  manifest: true,
  base: 'D:\\Games\\Made-up Game',
  locations: [
    {
      text: '<winAppData>/Made-up Game/saves',
      shown: 'C:\\Users\\Someone\\AppData\\Roaming\\Made-up Game\\saves',
      added: false,
      files: 3,
      bytes: 3_400_000,
      refused: false,
    },
    {
      text: '<base>/*.sav',
      shown: 'D:\\Games\\Made-up Game\\*.sav',
      added: false,
      files: 1,
      bytes: 12_000,
      refused: false,
    },
    {
      text: '<winDocuments>/My Games/Made-up Game',
      shown: 'C:\\Users\\Someone\\Documents\\My Games\\Made-up Game',
      added: false,
      files: 0,
      bytes: 0,
      refused: false,
    },
  ],
  files: 4,
  bytes: 3_412_000,
  snapshots: [
    {
      id: 'a',
      createdAt: now - 2 * HOUR,
      device: 'here',
      files: 4,
      bytes: 3_412_000,
      here: true,
    },
    {
      id: 'b',
      createdAt: now - 26 * HOUR,
      device: 'living-room',
      files: 4,
      bytes: 3_300_000,
      here: false,
    },
    {
      id: 'c',
      createdAt: now - 72 * HOUR,
      device: 'here',
      files: 3,
      bytes: 2_900_000,
      here: false,
    },
  ],
  heads: ['a'],
  changedAt: now - 2 * HOUR,
  state: 'in-step',
  last: null,
  busy: false,
  caps: { mostMb: 500, kept: 20 },
  place: 'D:\\OneDrive\\Shelf saves',
  reachable: true,
  away: null,
  ...over,
})

const computers: Record<string, string> = { here: 'this computer', 'living-room': 'Living room' }

const meta = {
  title: 'Features/Desktop/Saves',
  component: SavesPanelView,
  decorators: [
    (Story) => (
      <div className="max-w-xl p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    title: 'Made-up Game',
    state: view(),
    computerOf: (device) =>
      device ? (computers[device] ?? 'another computer') : 'another computer',
    onTurn: () => undefined,
    onBackUp: () => undefined,
    onRestore: () => undefined,
    onShow: () => undefined,
    onAdd: () => undefined,
    onRemove: () => undefined,
    onChooseGame: () => undefined,
    onChooseBase: () => undefined,
    onKeep: () => undefined,
  },
} satisfies Meta<typeof SavesPanelView>

export default meta
type Story = StoryObj<typeof meta>

export const InStep: Story = {}

/** Played since the latest snapshot. */
export const Changed: Story = {
  args: {
    state: view({
      state: 'changed',
      snapshots: view().snapshots.map((snapshot) => ({ ...snapshot, here: false })),
    }),
  },
}

/** Before it is turned on: where the saves are, shown first, and no history yet. */
export const Off: Story = { args: { state: view({ on: false, snapshots: [], state: 'changed' }) } }

/** The list doesn't know the game: its folder is added by hand. */
export const UnknownGame: Story = {
  args: {
    state: view({
      matched: null,
      locations: [],
      files: 0,
      bytes: 0,
      snapshots: [],
      state: 'nothing',
    }),
  },
}

/** Several games answer to its name, the stores carry its saves, and some are in the registry. */
export const Ambiguous: Story = {
  args: {
    state: view({
      others: ['Made-up Game (2004)'],
      cloud: ['steam', 'gog'],
      registry: true,
    }),
  },
}

/** A folder the person added, and one the list names that holds more than the game's saves. */
export const AddedAndRefused: Story = {
  args: {
    state: view({
      locations: [
        ...view().locations,
        {
          text: '<home>/Saved Games/Made-up Game',
          shown: 'C:\\Users\\Someone\\Saved Games\\Made-up Game',
          added: true,
          files: 0,
          bytes: 0,
          refused: false,
        },
        {
          text: '<base>',
          shown: 'D:\\Games\\Made-up Game',
          added: false,
          files: 0,
          bytes: 0,
          refused: true,
        },
      ],
    }),
  },
}

/** Another computer played since: its snapshot is offered, as Steam offers the cloud's before a game starts. */
export const Behind: Story = {
  args: {
    state: view({
      state: 'behind',
      heads: ['b'],
      snapshots: view().snapshots.map((snapshot, at) => ({
        ...snapshot,
        here: at === 2,
        createdAt: at === 1 ? now - HOUR : snapshot.createdAt,
      })),
    }),
  },
}

/**
 * Changed here and on another computer without a backup between: two cards with their dates, as Steam's
 * conflict window has, and nothing chosen by itself.
 */
export const Choice: Story = {
  args: {
    state: view({
      state: 'choose',
      heads: ['b'],
      changedAt: now - 30 * 60 * 1000,
      snapshots: view().snapshots.map((snapshot) => ({ ...snapshot, here: false })),
    }),
  },
}

/**
 * Play pressed with two copies differing (ADR 008, section 7): the game waits. Keeping one plays it, as
 * Steam's conflict window launches the game once a copy is picked; Decide later plays what is here and
 * writes nothing, Steam's "Play anyway".
 */
export const ChoiceBeforePlay: Story = {
  args: {
    ...Choice.args,
    beforePlay: true,
    onLater: () => undefined,
  },
}

/** Two computers backed up from the same snapshot: two latest, and this computer holds one of them. */
export const TwoLatest: Story = {
  args: {
    state: view({
      state: 'choose',
      heads: ['a', 'b'],
    }),
  },
}

/** The folder is a USB drive that isn't plugged in. */
export const FolderAway: Story = {
  args: { state: view({ place: 'E:\\Shelf saves', reachable: false }) },
}

/** No folder chosen: this computer alone. */
export const ThisComputerOnly: Story = { args: { state: view({ place: null }) } }

export const Restoring: Story = { args: { busy: 'restore:b' } }

export const Restored: Story = {
  args: { said: { tone: 'done', text: 'Put back the saves from Nov 6, 2026, 4:30 PM.' } },
}

export const GameRunning: Story = {
  args: {
    said: {
      tone: 'trouble',
      text: 'Close Made-up Game first: Shelf never touches its saves while it runs.',
    },
  },
}

/** The list couldn't be read and none is kept: folders by hand. */
export const NoList: Story = {
  args: { state: view({ manifest: false, matched: null, locations: [], files: 0, bytes: 0 }) },
}

export const Looking: Story = { args: { state: 'loading' } }

export const Failed: Story = { args: { state: 'failed' } }
