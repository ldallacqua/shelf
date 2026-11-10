import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { expect, userEvent, within } from 'storybook/test'

import { Dialog, DialogContent } from '@/ui/dialog'

import type { SavesView } from './saves'
import { SavesPanelView } from './saves-panel'

/**
 * A game's saves, opened from Play's menu or the status beside Play (ADR 008, spec 7.12; ADR 009,
 * decision 5). What most people need first, as Xbox's save dialogs say one thing with two or three
 * actions: one sentence with where and when, and the action that fits it. Then Steam's one switch, the
 * newest three backups with their marks as icons and tips, and where the saves are, folded into one line
 * as Heroic folds its save path into the game's settings. Made-up games and paths.
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

/**
 * As Play's menu opens it: a dialog over the game (ADR 009), centered and as tall as it needs, the whole
 * screen on a phone. Its restore questions are asked in their row, never as a second dialog.
 */
export const InItsDialog: Story = {
  decorators: [
    (Story) => (
      <Dialog open>
        <DialogContent title="Saves for Made-up Game" closeLabel="Close">
          <Story />
        </DialogContent>
      </Dialog>
    ),
  ],
}

/** The same, on a phone. */
export const InItsDialogOnAPhone: Story = {
  ...InItsDialog,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
}

/** Played since the last backup: backing up is the one thing to do. */
export const Changed: Story = {
  args: {
    state: view({
      state: 'changed',
      snapshots: view().snapshots.map((snapshot) => ({ ...snapshot, here: false })),
    }),
  },
}

/** Before it is turned on: the switch and what it does, and no history yet. */
export const Off: Story = { args: { state: view({ on: false, snapshots: [], state: 'changed' }) } }

/** First setup: the list doesn't know the game, so where they are opens by itself, to add its folder. */
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

/** Another computer played since: its saves are offered, as Steam offers the cloud's before a game starts. */
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

/** Two computers backed up from the same backup: two latest, and this computer holds one of them. */
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

/** Google Drive, the newest backup still waiting here: said so first, and marked in its row in words. */
export const InAService: Story = {
  args: {
    state: view({
      place: 'Google Drive',
      service: true,
      snapshots: view().snapshots.map((snapshot, at) => ({ ...snapshot, waiting: at === 0 })),
    }),
  },
}

export const Restoring: Story = {
  args: { busy: 'restore:b', progress: { step: 'fetching', done: 3, total: 4 } },
}

/** A backup under way: what it is doing, and how far it has got, where the app can tell. */
export const BackingUp: Story = {
  args: { busy: 'back-up', progress: { step: 'packing', done: 1, total: 4 } },
}
export const Sending: Story = {
  args: {
    state: view({ place: 'Google Drive' }),
    busy: 'back-up',
    progress: { step: 'sending', done: 0, total: null },
  },
}

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

/** Cloud up to date: in step with Google Drive, every backup there. */
export const InGoogleDrive: Story = {
  args: {
    state: view({
      place: 'Google Drive',
      service: true,
      snapshots: view().snapshots.map((snapshot) => ({ ...snapshot, waiting: false })),
    }),
  },
}

/** Google Drive took the sign-in back: the way to fix it is in Settings, backups wait here meanwhile. */
export const SignedOut: Story = {
  args: {
    state: view({ place: 'Google Drive', service: true, reachable: false, away: 'signed-out' }),
  },
}

/** The service is full. */
export const Full: Story = {
  args: { state: view({ place: 'OneDrive', service: true, reachable: false, away: 'full' }) },
}

/** On, saves found, and nothing backed up yet. */
export const NeverBackedUp: Story = {
  args: { state: view({ state: 'changed', snapshots: [], heads: [] }) },
}

/** A long history: the newest three, and All for the rest. */
export const LongHistory: Story = {
  args: {
    state: view({
      snapshots: Array.from({ length: 14 }, (_, at) => ({
        id: `backup-${at}`,
        createdAt: now - (2 + at * 20) * HOUR,
        device: at % 3 === 1 ? 'living-room' : 'here',
        files: 4,
        bytes: 3_400_000,
        here: at === 0,
      })),
      heads: ['backup-0'],
    }),
  },
}

/** Restore asks in its row, never in a second dialog: Cancel first, Escape its answer. */
export const AskingToRestore: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    const [restore] = await page.findAllByRole('button', { name: 'Restore' })
    await userEvent.click(restore!)
    await expect(page.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  },
}
