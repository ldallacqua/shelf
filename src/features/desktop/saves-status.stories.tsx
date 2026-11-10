import type { Meta, StoryObj } from '@storybook/nextjs-vite'

import type { SavesView } from './saves'
import { SavesStatusView } from './saves-panel'

/**
 * Beside Play, once a game's saves are on (ADR 009, decision 5): their state in a few words, as Steam's
 * Cloud status stands beside its Play ("Up to date", "Syncing", "Unable to sync"). What needs the person
 * is a warning in words and a mark, never in color alone; pressing it opens the Saves dialog. Made-up
 * games, paths and times.
 */

const HOUR = 60 * 60 * 1000
// Relative to whenever the story is looked at, so "11h ago" stays 11 hours.
const now = Date.now()

const view = (over: Partial<SavesView> = {}): SavesView => ({
  on: true,
  matched: 'Made-up Game',
  others: [],
  registry: false,
  cloud: [],
  manifest: true,
  base: null,
  locations: [],
  files: 4,
  bytes: 3_412_000,
  snapshots: [
    {
      id: 'a',
      createdAt: now - 11 * HOUR,
      device: 'here',
      files: 4,
      bytes: 3_412_000,
      here: true,
      waiting: false,
    },
    {
      id: 'b',
      createdAt: now - 30 * HOUR,
      device: 'living-room',
      files: 4,
      bytes: 3_300_000,
      here: false,
      waiting: false,
    },
  ],
  heads: ['a'],
  changedAt: now - 11 * HOUR,
  state: 'in-step',
  last: null,
  busy: false,
  caps: { mostMb: 500, kept: 20 },
  place: 'Google Drive',
  service: true,
  reachable: true,
  away: null,
  ...over,
})

const meta = {
  title: 'Features/Desktop/SavesStatus',
  component: SavesStatusView,
  args: { view: view(), syncing: false, onOpen: () => undefined },
} satisfies Meta<typeof SavesStatusView>

export default meta
type Story = StoryObj<typeof meta>

/** In step with a service: where, and when the latest backup was made. */
export const InAService: Story = {}

export const InAFolder: Story = {
  args: { view: view({ place: 'D:\\Synced\\Shelf saves', service: false }) },
}

/** This computer alone: never a place. */
export const OnThisComputer: Story = { args: { view: view({ place: null }) } }

/** The newest backup is still on this computer: never said to be in the service. */
export const Waiting: Story = {
  args: {
    view: view({
      snapshots: view().snapshots.map((snapshot, at) => ({ ...snapshot, waiting: at === 0 })),
    }),
  },
}

export const NotBackedUp: Story = { args: { view: view({ state: 'changed' }) } }

export const NewerElsewhere: Story = { args: { view: view({ state: 'behind', heads: ['b'] }) } }

/** Warnings: what needs the person. */
export const Choose: Story = { args: { view: view({ state: 'choose', heads: ['a', 'b'] }) } }

export const SignedOut: Story = {
  args: { view: view({ place: 'OneDrive', reachable: false, away: 'signed-out' }) },
}

export const Full: Story = { args: { view: view({ reachable: false, away: 'full' }) } }

export const Unreachable: Story = {
  args: {
    view: view({ place: 'E:\\Shelf saves', service: false, reachable: false, away: 'unreachable' }),
  },
}

export const NoFolder: Story = {
  args: { view: view({ state: 'nothing', files: 0, snapshots: [], heads: [] }) },
}

export const Failed: Story = { args: { view: 'failed' } }

/** A sync under way: Play says Syncing too. */
export const Syncing: Story = { args: { syncing: true } }

/** Before the app has answered. */
export const Looking: Story = { args: { view: undefined } }

/** Off: nothing beside Play; Saves is in its menu, to turn it on. */
export const Off: Story = { args: { view: view({ on: false }) } }
